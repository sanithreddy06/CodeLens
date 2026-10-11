const unzipper = require("unzipper");
const path = require("path");
const operation = require("./operationContext");
const { integer } = require("./config");
const { shouldIncludeFile, MAX_FILE_SIZE } = require("./githubService");

const MAX_ZIP_FILE_COUNT = integer("ZIP_MAX_FILE_COUNT", 2000, 1, 10000);
const MAX_TOTAL_UNZIPPED_BYTES = integer("ZIP_MAX_TOTAL_BYTES", 50 * 1024 * 1024, 1024, 100 * 1024 * 1024); // 50MB

function toPosixPath(p) {
  return String(p || "").replace(/\\/g, "/");
}

function isSafeZipPath(p) {
  const posix = toPosixPath(p);
  if (!posix || posix.endsWith("/")) return false;
  if (posix.startsWith("/") || posix.startsWith("~") || /^[a-z]:/i.test(posix)) return false;
  if (posix.includes("\0")) return false;

  const normalized = path.posix.normalize(posix);
  if (normalized.startsWith("../") || normalized === "..") return false;
  if (normalized.includes("/../")) return false;
  return true;
}

async function extractZipToFiles(zipBuffer, onProgress) {
  operation.check();
  const directory = await unzipper.Open.buffer(zipBuffer);
  if (directory.files.length > 10000) throw new Error("ZIP contains too many entries");
  const seen = new Set();

  let totalBytes = 0;
  let includedCount = 0;
  const files = [];

  for (const entry of directory.files) {
    operation.check();
    const rawPath = entry.path;
    const filePath = path.posix.normalize(toPosixPath(rawPath));

    if (entry.type !== "File") continue;
    if (!isSafeZipPath(rawPath)) continue;
    if (seen.has(filePath)) throw new Error("ZIP contains duplicate file paths");
    seen.add(filePath);
    if (!shouldIncludeFile(filePath)) continue;

    const size = entry.uncompressedSize || 0;
    if (size > MAX_FILE_SIZE) continue;

    includedCount += 1;
    if (includedCount > MAX_ZIP_FILE_COUNT) {
      throw new Error(`ZIP contains too many files (limit ${MAX_ZIP_FILE_COUNT})`);
    }

    const stream = entry.stream();
    const abort = () => stream.destroy(new Error("Extraction cancelled"));
    operation.signal()?.addEventListener("abort", abort, { once: true });
    const chunks = [];
    let actualSize = 0;
    try {
      for await (const chunk of stream) {
        operation.check();
        actualSize += chunk.length;
        totalBytes += chunk.length;
        if (actualSize > MAX_FILE_SIZE || totalBytes > MAX_TOTAL_UNZIPPED_BYTES) throw new Error("ZIP extracted content exceeds size limits");
        chunks.push(chunk);
      }
    } finally {
      operation.signal()?.removeEventListener("abort", abort);
      stream.destroy();
    }
    const buf = Buffer.concat(chunks);
    const content = buf.toString("utf8");
    files.push({ path: filePath, content });

    if (onProgress && includedCount % 100 === 0) {
      onProgress(`Extracted ${includedCount} files...`);
    }
  }

  if (files.length === 0) {
    throw new Error("No matching files found in ZIP");
  }

  return { projectName: "zip-upload", files, coverage: { totalFiles: directory.files.filter(entry => entry.type === "File").length, analyzedFiles: files.length, skippedFiles: directory.files.filter(entry => entry.type === "File").length - files.length } };
}

module.exports = { extractZipToFiles, isSafeZipPath };
