/**
 * 晴天示例书源（shareBookSource.json）：renderVersionPage 主线路曾写死 sy.gyks（/version 失效），
 * 且 v*.gyks 上 /download/… 404，应为 /sy/download/…。
 * 运行（在 Reader 目录）：node scripts/patch-qingtian-share-source.mjs
 *
 * 若报 EPERM：关闭占用该文件的程序、检查杀毒/权限，或以可写副本保存后替换。
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const path = join(__dirname, '../examples/shareBookSource.json');

let t = fs.readFileSync(path, 'utf8');

const blockHtml = "let yd = '';\\n    let html = `";
const blockHtmlNew =
  "let yd = '';\\n" +
  "    var qtBase = (typeof getArgument === 'function' ? getArgument('server') : '') || " +
  "(typeof host !== 'undefined' && host[0]) || 'https://v1.gyks.cf';\\n" +
  "    var qtBaseNorm = String(qtBase).replace(/^http:/i, 'https:');\\n" +
  "    let html = `";

if (!t.includes(blockHtml)) {
  console.error('未找到 renderVersionPage 中 let html，可能已修补');
  process.exit(1);
}
t = t.replace(blockHtml, blockHtmlNew);

const sy = "baseUrl: 'https://sy.gyks.cf'";
if (!t.includes(sy)) {
  console.error('未找到 sy.gyks.cf baseUrl');
  process.exit(1);
}
t = t.replace(sy, "baseUrl: '${qtBaseNorm}'");

const needle =
  "baseUrl: '${qtBaseNorm}',\\n        downloadPath: '/download/%E5%AE%89%E5%8D%93%E9%98%85%E8%AF%BBapp-%E6%99%B4%E5%A4%A9%E8%9E%8D%E5%90%884.0(vip%E5%AE%8C%E5%85%A8%E7%89%88).json'";
const repl =
  "baseUrl: '${qtBaseNorm}',\\n        downloadPath: '/sy/download/%E5%AE%89%E5%8D%93%E9%98%85%E8%AF%BBapp-%E6%99%B4%E5%A4%A9%E8%9E%8D%E5%90%884.0(vip%E5%AE%8C%E5%85%A8%E7%89%88).json'";
if (!t.includes(needle)) {
  console.error('未找到主线路 downloadPath 片段');
  process.exit(1);
}
t = t.replace(needle, repl);

JSON.parse(t);
fs.writeFileSync(path, t, 'utf8');
console.log('patched', path);
