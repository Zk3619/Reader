/**
 * getSourceUrlIdentifier -> getLegadoSourceKey，删除弃用别名
 */
import fs from 'node:fs';
import path from 'node:path';

const shared = 'src/lib/js-engine/legado/source-script-shared.ts';
let s = fs.readFileSync(shared, 'utf8');
s = s.replace(/\n\/\*\* @deprecated[\s\S]*?export function getSourceUrlIdentifier[\s\S]*?\n}\n/, '\n');
s = s.replace(/\bgetSourceUrlIdentifier\b/g, 'getLegadoSourceKey');
fs.writeFileSync(shared, s);

const index = 'src/lib/js-engine/index.ts';
let idx = fs.readFileSync(index, 'utf8');
idx = idx.replace(/\bgetSourceUrlIdentifier\b/g, 'getLegadoSourceKey');
fs.writeFileSync(index, idx);

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      walk(full);
    } else if (/\.(ts|tsx)$/.test(name)) {
      if (full.includes('source-script-shared')) continue;
      let c = fs.readFileSync(full, 'utf8');
      if (!c.includes('getSourceUrlIdentifier')) continue;
      c = c.replace(/\bgetSourceUrlIdentifier\b/g, 'getLegadoSourceKey');
      fs.writeFileSync(full, c);
      console.log('updated', full);
    }
  }
}
walk('src');
console.log('getLegadoSourceKey migration done');
