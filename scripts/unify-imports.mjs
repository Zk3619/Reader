/**
 * Rewrite relative / src / ~ imports under src/ to @/ alias.
 * Run: node scripts/unify-imports.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = path.join(root, "src");

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (/\.(ts|tsx)$/.test(ent.name)) files.push(p);
  }
  return files;
}

function resolveToAlias(filePath, spec) {
  if (spec.startsWith("@/")) return spec;
  if (spec.startsWith("src/")) return `@/${spec.slice(4)}`;
  if (spec.startsWith("~/")) return `@/${spec.slice(2)}`;
  if (!spec.startsWith(".")) return spec;

  const abs = path.normalize(path.join(path.dirname(filePath), spec));
  if (!abs.startsWith(srcRoot)) return spec;
  return `@/${path.relative(srcRoot, abs).replace(/\\/g, "/")}`;
}

const patterns = [
  /\bfrom\s+(['"])([^'"]+)\1/g,
  /\bimport\s+(['"])(\.[^'"]+)\1/g,
  /\bexport\s+\*\s+from\s+(['"])([^'"]+)\1/g,
];

let fileCount = 0;
let replaceCount = 0;

for (const file of walk(srcRoot)) {
  let text = fs.readFileSync(file, "utf8");
  let changed = false;

  for (const re of patterns) {
    text = text.replace(re, (full, quote, spec) => {
      const next = resolveToAlias(file, spec);
      if (next === spec) return full;
      replaceCount++;
      changed = true;
      if (full.startsWith("import ")) return `import ${quote}${next}${quote}`;
      if (full.startsWith("export *")) return `export * from ${quote}${next}${quote}`;
      return `from ${quote}${next}${quote}`;
    });
  }

  if (changed) {
    fs.writeFileSync(file, text);
    fileCount++;
  }
}

console.log(`updated ${fileCount} files, ${replaceCount} import paths`);
