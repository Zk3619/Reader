/**
 * 从 git HEAD 恢复因编码损坏（??? / U+FFFD）的源文件，
 * 跳过需保留当前逻辑的路径（viewer 重构、App 等另行处理）。
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');

/** 不自动恢复：当前版本含 viewer 重构或弃用清理，需单独合并 */
const SKIP = new Set([
  'src/app/App.tsx',
  'src/stores/viewer',
  'src/pages/viewer',
  'src/components/viewer/MediaViewerCatalog.tsx',
  'src/components/viewer/MediaViewerShell.tsx',
  'src/components/viewer/MediaViewerShellMain.tsx',
  'src/components/viewer/MediaViewerHeader.tsx',
  'src/components/viewer/MediaViewerFooter.tsx',
  'src/components/viewer/MediaViewerChapterNavFooter.tsx',
  'src/components/viewer/MediaViewerToolbarHeader.tsx',
  'src/components/viewer/media-viewer-shell-context.tsx',
  'src/lib/platform/inner-web-presentation.ts',
  'src/lib/media/text/reader-ui-config.ts',
  'src/lib/media/text/reader-media-messages.ts',
  'src/lib/book-source/media-viewer.ts',
  'src/lib/bookshelf/reading-progress-snapshot.ts',
  'src/stores/index.ts',
]);

function shouldSkip(rel) {
  const n = rel.replace(/\\/g, '/');
  if (SKIP.has(n)) return true;
  for (const p of SKIP) {
    if (n.startsWith(`${p}/`)) return true;
  }
  return false;
}

function isCorrupted(content) {
  return content.includes('???') || content.includes('\uFFFD') || /\?\?[^?\n]/.test(content);
}

function isTracked(rel) {
  try {
    execSync(`git cat-file -e "HEAD:${rel.replace(/\\/g, '/')}"`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

const toRestore = [];

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(ROOT, full).replace(/\\/g, '/');
    if (fs.statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(tsx?)$/.test(name)) continue;
    if (shouldSkip(rel)) continue;
    const content = fs.readFileSync(full, 'utf8');
    if (!isCorrupted(content)) continue;
    if (!isTracked(rel)) {
      console.warn('corrupted untracked, manual fix:', rel);
      continue;
    }
    toRestore.push(rel);
  }
}

walk(SRC);

console.log(`Restoring ${toRestore.length} corrupted files from git HEAD...`);
for (const rel of toRestore) {
  execSync(`git checkout HEAD -- "${rel}"`, { stdio: 'inherit' });
}

console.log('Done.');
