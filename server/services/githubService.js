const https = require("https");
const operation = require("./operationContext");
const { integer } = require("./config");

const DEFAULT_INCLUDE = new Set([
  // Source
  ".py", ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts", ".go", ".java", ".c", ".cpp", ".h",
  ".rs", ".rb", ".php", ".swift", ".kt",
  // Docs/config that define structure
  ".md", ".yml", ".yaml", ".json", ".toml", ".ini", ".env", ".example",
  ".sh", ".ps1", ".bat", ".cmd", ".dockerfile",
]);

const DEFAULT_EXCLUDE = [
  // Keep structure accurate: exclude only generated/binary/vendor heavy paths.
  "node_modules/", "dist/", "build/", ".git/", ".github/", ".vscode/",
  "__pycache__/", "venv/", ".next/", "coverage/", ".turbo/", ".cache/",
  "vendor/", "obj/", "bin/",
];

const MAX_FILE_SIZE = 100000; // 100KB
const MAX_REPO_FILES = integer("REPO_MAX_FILES", 250, 1, 2000);
const MAX_TOTAL_REPO_BYTES = integer("REPO_MAX_TOTAL_BYTES", 15 * 1024 * 1024, 1024, 100 * 1024 * 1024); // 15MB

// Priority score for files when a repository exceeds the file/byte caps.
// High-signal structure files first, then root-level source, then the rest.
function filePriority(p) {
  const base = p.split("/").pop().toLowerCase();
  if (base === "readme.md" || base === "package.json" || base === "dockerfile" || base === "makefile") return 100;
  if (base === ".env.example" || /^\.env\./.test(base)) return 80;
  if (/^(index|main|app|server|cli)\.(js|ts|py|go|rs|rb|php)$/.test(base)) return 70;
  if (p.split("/").length <= 2) return 50; // root-level file
  if (base.endsWith(".md") || base.endsWith(".json") || base.endsWith(".yml") || base.endsWith(".yaml")) return 40;
  return 10;
}

function httpGet(url, headers = {}, redirects = 0, maxBytes = 10 * 1024 * 1024) {
  operation.check();
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !["api.github.com", "raw.githubusercontent.com"].includes(parsed.hostname) || redirects > 3) return reject(new Error("Unsupported GitHub redirect"));
    const req = https.get(parsed, { signal: operation.signal(), headers: { "User-Agent": "CodeLens", ...headers } }, res => {
      res.on("error", reject);
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, parsed);
        const nextHeaders = next.hostname === parsed.hostname ? headers : {};
        return httpGet(next.href, nextHeaders, redirects + 1, maxBytes).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`GitHub returned HTTP ${res.statusCode}. Check repository access or retry later.`));
      }
      const chunks = [];
      let size = 0;
      res.on("data", chunk => {
        size += chunk.length;
        if (size > maxBytes) req.destroy(new Error("GitHub response exceeds size limit"));
        else chunks.push(chunk);
      });
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
    req.on("error", reject);
    req.setTimeout(30000, () => req.destroy(new Error("GitHub request timed out")));
  });
}

function parseRepoUrl(url) {
  // Handle URLs like https://github.com/owner/repo or https://github.com/owner/repo.git
  if (typeof url !== "string" || url.length > 2048) throw new Error("Invalid GitHub URL");
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error("Invalid GitHub URL"); }
  const parts = parsed.pathname.replace(/\/$/, "").split("/").filter(Boolean);
  if (parsed.protocol !== "https:" || parsed.hostname !== "github.com" || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash || parts.length !== 2) {
    throw new Error("Expected https://github.com/owner/repo");
  }
  const [owner, rawRepo] = parts;
  const repo = rawRepo.replace(/\.git$/, "");
  if (!/^[A-Za-z0-9-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo) || repo === "." || repo === "..") throw new Error("Invalid GitHub repository name");
  return { owner, repo };
}

function shouldIncludeFile(path) {
  const name = path.split("/").pop().toLowerCase();
  if ((name === ".env" || name.startsWith(".env.")) && name !== ".env.example") return false;
  if (/\.(pem|key|p12|pfx)$/.test(name)) return false;
  // Check excludes
  for (const excl of DEFAULT_EXCLUDE) {
    if (path.includes(excl)) return false;
  }

  // Always include common repo "structure" files even without extensions
  const base = path.split("/").pop().toLowerCase();
  if (
    base === "requirements.txt" ||
    base === "readme" ||
    base === "license" ||
    base === "makefile" ||
    base === "dockerfile" ||
    base === ".env.example" ||
    base === ".gitignore"
  ) {
    return true;
  }

  // Check file extension (last segment)
  const parts = base.split(".");
  if (parts.length < 2) return false;
  const ext = "." + parts.pop();
  if (DEFAULT_INCLUDE.has(ext)) return true;

  // Allow multi-part endings like ".env.example"
  if (base.endsWith(".env.example")) return true;
  return false;
}

async function fetchRepoTree(repoUrl, token = null) {
  const { owner, repo } = parseRepoUrl(repoUrl);
  const projectName = repo;

  const headers = { Accept: "application/vnd.github.v3+json" };
  if (token) headers.Authorization = `token ${token}`;

  // Get the default branch
  const repoInfoUrl = `https://api.github.com/repos/${owner}/${repo}`;
  const repoInfo = JSON.parse(await httpGet(repoInfoUrl, headers));
  if (repoInfo.private) throw new Error("Only public GitHub repositories are supported. Private access requires per-user GitHub permissions.");
  const defaultBranch = repoInfo.default_branch || "main";
  const commit = JSON.parse(await httpGet(`https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(defaultBranch)}`, headers));
  if (!/^[a-f0-9]{40}$/.test(commit.sha || "")) throw new Error("GitHub returned an invalid commit");

  // Get the full tree recursively (each entry carries the blob sha — free change detection)
  const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${commit.sha}?recursive=1`;
  const treeData = JSON.parse(await httpGet(treeUrl, headers));

  if (!treeData.tree) throw new Error("Failed to fetch repository tree");
  if (treeData.truncated) throw new Error("Repository tree is too large for this prototype");

  let entries = treeData.tree.filter(
    (item) => item.type === "blob" && item.size <= MAX_FILE_SIZE && shouldIncludeFile(item.path)
  );

  if (entries.length === 0) throw new Error("No matching files found in repository");

  // Apply file-count and total-bytes caps, keeping high-signal files first.
  const eligibleCount = entries.length;
  const totalBytes = entries.reduce((a, e) => a + (e.size || 0), 0);
  if (entries.length > MAX_REPO_FILES || totalBytes > MAX_TOTAL_REPO_BYTES) {
    const sorted = [...entries].sort((a, b) => filePriority(b.path) - filePriority(a.path));
    const capped = [];
    let bytes = 0;
    for (const e of sorted) {
      if (capped.length >= MAX_REPO_FILES) break;
      if (bytes + (e.size || 0) > MAX_TOTAL_REPO_BYTES) continue;
      capped.push(e);
      bytes += e.size || 0;
    }
    entries = capped;
    console.warn(
      `[GitHub] Repo exceeds caps (${MAX_REPO_FILES} files / ${Math.round(MAX_TOTAL_REPO_BYTES / 1024 / 1024)}MB); analyzing ${entries.length} highest-signal files`
    );
  }

  return {
    owner,
    repo,
    branch: commit.sha,
    revision: commit.sha,
    coverage: { totalFiles: treeData.tree.filter(item => item.type === "blob").length, eligibleFiles: eligibleCount, analyzedFiles: entries.length, skippedFiles: treeData.tree.filter(item => item.type === "blob").length - entries.length },
    projectName,
    entries, // [{ path, size, sha }]
  };
}

async function fetchFileContents(owner, repo, branch, entries, token = null, onProgress = null) {
  const files = [];
  const batchSize = integer("GITHUB_FETCH_BATCH_SIZE", 20, 1, 30);

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    const promises = batch.map(async (entry) => {
      try {
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${entry.path.split("/").map(encodeURIComponent).join("/")}`;
        const content = await httpGet(rawUrl, token ? { Authorization: `token ${token}` } : {}, 0, MAX_FILE_SIZE);
        return { path: entry.path, sha: entry.sha, content };
      } catch (err) {
        operation.check();
        console.warn('GitHub source fetch failed', { name: err.name, status: err.status });
        return null;
      }
    });

    const results = await Promise.all(promises);
    results.filter(Boolean).forEach((f) => files.push(f));

    if (onProgress) {
      onProgress(`Fetched ${Math.min(i + batchSize, entries.length)}/${entries.length} files...`);
    }
  }

  return files;
}

module.exports = {
  fetchRepoTree,
  fetchFileContents,
  parseRepoUrl,
  shouldIncludeFile,
  DEFAULT_EXCLUDE,
  DEFAULT_INCLUDE,
  MAX_FILE_SIZE,
};
