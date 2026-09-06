import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const DISHONORING = /\b(inimig[oa]s?|traidor(?:es|a|as)?|bandid[oa]s?|vergonha|corrupt[oa]s?)\b/i;
const IMPERATIVE_VOTE = /(?<![\w-])(?:vote|votes|votem|votai)(?![\w-])/i;

function collectAssetFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "vendor" || entry.name === "node_modules") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectAssetFiles(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith(".js") || entry.name.endsWith(".css"))) {
      files.push(fullPath);
    }
  }
  return files;
}

const targets = [
  path.join(REPO_ROOT, "index.html"),
  path.join(REPO_ROOT, "dex.html"),
  ...collectAssetFiles(path.join(REPO_ROOT, "assets")),
];

let violations = 0;

for (const targetPath of targets) {
  if (!fs.existsSync(targetPath)) continue;
  const relativePath = path.relative(REPO_ROOT, targetPath).replace(/\\/g, "/");
  const content = fs.readFileSync(targetPath, "utf8");
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const sanitizedLine = line.replace(/\bvote-app\b/gi, "");
    if (DISHONORING.test(sanitizedLine) || IMPERATIVE_VOTE.test(sanitizedLine)) {
      console.error(`COMPLIANCE VIOLATION in ${relativePath}:${i + 1}: ${line.trim()}`);
      violations++;
    }
  }
}

if (violations > 0) {
  process.exit(1);
}

console.log("Copy compliance check passed.");
