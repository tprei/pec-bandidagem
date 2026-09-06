import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const missing = [];

function checkHtmlFile(relativePath) {
  const fullPath = path.resolve(REPO_ROOT, relativePath);
  if (!fs.existsSync(fullPath)) {
    missing.push({ file: relativePath, source: "root" });
    return;
  }
  const content = fs.readFileSync(fullPath, "utf8");

  const tagPatterns = [
    /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi,
    /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi,
    /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi,
  ];

  for (const pattern of tagPatterns) {
    for (const match of content.matchAll(pattern)) {
      const rawRef = match[1].trim();
      if (
        !rawRef ||
        rawRef.startsWith("http://") ||
        rawRef.startsWith("https://") ||
        rawRef.startsWith("data:") ||
        rawRef.startsWith("#") ||
        rawRef.startsWith("mailto:") ||
        rawRef.startsWith("//")
      ) {
        continue;
      }
      const cleanRef = rawRef.split(/[?#]/)[0];
      if (!cleanRef) continue;

      const targetPath = path.resolve(REPO_ROOT, cleanRef);
      if (!fs.existsSync(targetPath)) {
        missing.push({ file: cleanRef, source: relativePath });
      }
    }
  }
}

function checkSw() {
  const swPath = path.resolve(REPO_ROOT, "sw.js");
  if (!fs.existsSync(swPath)) {
    missing.push({ file: "sw.js", source: "root" });
    return;
  }
  const content = fs.readFileSync(swPath, "utf8");

  function extractArrayStrings(fileContent, arrayName) {
    const regex = new RegExp(`(?:const|let|var)\\s+${arrayName}\\s*=\\s*\\[([\\s\\S]*?)\\]`, "s");
    const match = fileContent.match(regex);
    if (!match) return [];
    const strRegex = /["']([^"']+)["']/g;
    const strings = [];
    for (const m of match[1].matchAll(strRegex)) {
      strings.push(m[1]);
    }
    return strings;
  }

  const precache = extractArrayStrings(content, "PRECACHE");
  const ownAssets = extractArrayStrings(content, "OWN_ASSETS");
  const swRefs = new Set([...precache, ...ownAssets]);

  for (const ref of swRefs) {
    const cleanRef = ref.split(/[?#]/)[0].trim();
    if (!cleanRef) continue;
    const targetPath = path.resolve(REPO_ROOT, cleanRef);
    if (!fs.existsSync(targetPath)) {
      missing.push({ file: cleanRef, source: "sw.js" });
    }
  }
}

function checkManifest() {
  const manifestPath = path.resolve(REPO_ROOT, "manifest.webmanifest");
  if (!fs.existsSync(manifestPath)) {
    missing.push({ file: "manifest.webmanifest", source: "root" });
    return;
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (err) {
    console.error(`Failed to parse manifest.webmanifest: ${err.message}`);
    process.exit(1);
  }

  if (manifest.start_url) {
    const cleanRef = manifest.start_url.split(/[?#]/)[0].trim();
    if (
      cleanRef &&
      !cleanRef.startsWith("http://") &&
      !cleanRef.startsWith("https://") &&
      !cleanRef.startsWith("data:")
    ) {
      const targetPath = path.resolve(REPO_ROOT, cleanRef);
      if (!fs.existsSync(targetPath)) {
        missing.push({ file: cleanRef, source: "manifest.webmanifest" });
      }
    }
  }

  if (Array.isArray(manifest.icons)) {
    for (const icon of manifest.icons) {
      if (!icon.src) continue;
      const cleanRef = icon.src.split(/[?#]/)[0].trim();
      if (
        cleanRef &&
        !cleanRef.startsWith("http://") &&
        !cleanRef.startsWith("https://") &&
        !cleanRef.startsWith("data:")
      ) {
        const targetPath = path.resolve(REPO_ROOT, cleanRef);
        if (!fs.existsSync(targetPath)) {
          missing.push({ file: cleanRef, source: "manifest.webmanifest" });
        }
      }
    }
  }
}

function collectFiles(dir, ext, ignoreDirs = []) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoreDirs.includes(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, ext, ignoreDirs));
    } else if (entry.isFile() && fullPath.endsWith(ext)) {
      results.push(fullPath);
    }
  }
  return results;
}

function checkEsmImports() {
  const assetFiles = collectFiles(path.resolve(REPO_ROOT, "assets"), ".js", ["vendor", "node_modules"]);
  const testFiles = collectFiles(path.resolve(REPO_ROOT, "tests"), ".mjs", ["node_modules"]);

  const filesToCheck = [...assetFiles, ...testFiles];

  for (const filePath of filesToCheck) {
    const content = fs.readFileSync(filePath, "utf8");
    const relativeSource = path.relative(REPO_ROOT, filePath).replace(/\\/g, "/");

    const staticImportRegex = /(?:import\s+(?:[\s\S]*?from\s+)?|export\s+[\s\S]*?from\s+)["']([^"']+)["']/g;
    const dynamicImportRegex = /import\(\s*["']([^"']+)["']\s*\)/g;

    const specifiers = [];
    for (const match of content.matchAll(staticImportRegex)) {
      specifiers.push(match[1]);
    }
    for (const match of content.matchAll(dynamicImportRegex)) {
      specifiers.push(match[1]);
    }

    for (const specifier of specifiers) {
      if (!specifier.startsWith(".")) continue;

      const cleanSpecifier = specifier.split(/[?#]/)[0].trim();
      const resolvedPath = path.resolve(path.dirname(filePath), cleanSpecifier);
      const relativeRef = path.relative(REPO_ROOT, resolvedPath).replace(/\\/g, "/");

      if (!fs.existsSync(resolvedPath)) {
        missing.push({ file: relativeRef, source: relativeSource });
      }
    }
  }
}

checkHtmlFile("index.html");
checkHtmlFile("dex.html");
checkSw();
checkManifest();
checkEsmImports();

if (missing.length > 0) {
  for (const item of missing) {
    console.error(`MISSING ASSET: ${item.file} referenced by ${item.source}`);
  }
  process.exit(1);
}

console.log("Asset references check passed.");
