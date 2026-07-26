import fs from 'fs';

const root = 'd:/Projects/Reader/src/lib/media/video/danmaku/danmu-api/vendor';

// local-redis → shim
{
  const p = `${root}/utils/local-redis-util.js`;
  let c = fs.readFileSync(p, 'utf8');
  c = c.replace(
    "const { createClient } = await import('redis');",
    "const { createClient } = await import('../../shims/redis.js');",
  );
  fs.writeFileSync(p, c, 'utf8');
  console.log('local-redis', c.includes('shims/redis'));
}

// bangumi-data：Node 内置 → Reader shim（Vite 无法解析 stream/promises）
{
  const p = `${root}/utils/bangumi-data-util.js`;
  let c = fs.readFileSync(p, 'utf8');
  c = c
    .replace("import fs from 'fs';", "import fs from '../../shims/fs.js';")
    .replace("import path from 'path';", "import path from '../../shims/path.js';")
    .replace(
      "import { pipeline } from 'stream/promises';",
      "import { pipeline } from '../../shims/stream-promises.js';",
    )
    .replace(
      "import fetch from 'node-fetch';",
      "import fetch from '../../shims/node-fetch.js';",
    )
    .replace(
      "const CACHE_DIR = path.join(process.cwd(), '.cache');",
      "const CACHE_DIR = path.join('.', '.cache');",
    );
  fs.writeFileSync(p, c, 'utf8');
  console.log('bangumi-data imports patched');
}

// bangumi-data：浏览器下跳过磁盘初始化
{
  const p = `${root}/utils/bangumi-data-util.js`;
  let c = fs.readFileSync(p, 'utf8');
  if (!c.includes('READER_SKIP_BANGUMI_DATA_FS')) {
    c = c.replace(
      /export async function initBangumiData\s*\(([^)]*)\)\s*\{/,
      `export async function initBangumiData($1) {
  // READER_SKIP_BANGUMI_DATA_FS
  if (typeof window !== 'undefined') {
    return;
  }
  return initBangumiDataNode($1);
}
async function initBangumiDataNode($1) {`,
    );
    fs.writeFileSync(p, c, 'utf8');
  }
  console.log('bangumi-data patched');
}

// cache-util：judgeLocalCacheValid 在浏览器直接失败
{
  const p = `${root}/utils/cache-util.js`;
  let c = fs.readFileSync(p, 'utf8');
  if (!c.includes('READER_SKIP_LOCAL_CACHE_FS')) {
    c = c.replace(
      /export async function judgeLocalCacheValid\s*\(([^)]*)\)\s*\{/,
      `export async function judgeLocalCacheValid($1) {
  // READER_SKIP_LOCAL_CACHE_FS
  if (typeof window !== 'undefined') {
    globals.localCacheValid = false;
    globals.localCacheInitialized = true;
    return;
  }
  return judgeLocalCacheValidNode($1);
}
async function judgeLocalCacheValidNode($1) {`,
    );
    fs.writeFileSync(p, c, 'utf8');
  }
  console.log('cache-util patched');
}

// writeCacheToFile / read：浏览器 no-op
{
  const p = `${root}/utils/cache-util.js`;
  let c = fs.readFileSync(p, 'utf8');
  if (!c.includes('READER_NOOP_WRITE_CACHE')) {
    c = c.replace(
      /export function writeCacheToFile\s*\(([^)]*)\)\s*\{/,
      `export function writeCacheToFile($1) {
  // READER_NOOP_WRITE_CACHE
  if (typeof window !== 'undefined') return;
  return writeCacheToFileNode($1);
}
function writeCacheToFileNode($1) {`,
    );
    fs.writeFileSync(p, c, 'utf8');
  }
  console.log('writeCache patched');
}
