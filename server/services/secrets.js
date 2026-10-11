// Conservative redaction of recognizable credentials, not a complete secret scanner.
// Newlines are retained so source citations continue to refer to the original lines.
function redactContent(content) {
  let count = 0;
  const redact = value => { count++; return value.split('\n').map(() => '[REDACTED]').join('\n'); };
  const text = String(content)
    .replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, redact)
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AIza[A-Za-z0-9_-]{35}|sk-(?:proj-)?[A-Za-z0-9_-]{32,}|AKIA[A-Z0-9]{16})\b/g, redact)
    .replace(/((?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|secret[_-]?key)["']?\s*[:=]\s*["'])([^"'\n]{12,})(["'])/gi,
      (match, prefix, value, suffix) => /example|placeholder|your[-_ ]|replace[-_ ]|process\.env|\$\{/i.test(value) ? match : `${prefix}${redact(value)}${suffix}`);
  return { content: text, count };
}
function redactFiles(files) {
  let redactedValues = 0;
  const safe = files.map(file => { const result = redactContent(file.content); redactedValues += result.count; return { ...file, content: result.content }; });
  return { files: safe, redactedValues };
}
module.exports = { redactContent, redactFiles };
