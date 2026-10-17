// Source/worktree scan only; no file contents or secret values are logged.
import { execFileSync } from "node:child_process";
import { readFileSync, lstatSync } from "node:fs";

const files = [...new Set(execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean))];
const findings = [];
for (const file of files) {
  if (/^\.env(?:\.|$)/.test(file) && file !== ".env.example") { findings.push(file); continue; }
  if (!/\.(?:ts|tsx|js|mjs|cjs|json|md|ya?ml|sql|py|pem|key)$/.test(file)) continue;
  if (lstatSync(file).isSymbolicLink()) { findings.push(file); continue; }
  const content = readFileSync(file, "utf8");
  let suspect = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)
    || /\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,}|AKIA[A-Z0-9]{16}|xox[baprs]-[A-Za-z0-9-]{20,})\b/.test(content);
  for (const match of content.matchAll(/postgres(?:ql)?:\/\/[^\s"'`<>]+/g)) {
    try {
      const url = new URL(match[0]);
      if (url.password && url.password !== "PASSWORD" && !/(?:example|\.test$|localhost|127\.0\.0\.1)/i.test(url.hostname)) suspect = true;
    } catch { /* not a literal URL */ }
  }
  if (suspect) findings.push(file);
}
if (findings.length) {
  console.error("Possible committed/deployable secrets; review these files (values suppressed):");
  for (const file of findings) console.error(JSON.stringify(file));
  process.exitCode = 1;
} else console.info(`Source/worktree secret scan passed (${files.length} files; ignored local .env not read). This pattern scan is not an entropy scan or a full git-history audit.`);
