#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../extractors');
const reg = fs.readFileSync(path.join(root, 'generated-registry.ts'), 'utf8');
const hand = new Set(
  [...reg.match(/export const HAND_OVERRIDES = new Set\(\[([\s\S]*?)\]\);/)[1].matchAll(/"([^"]+)"/g)].map(
    (m) => m[1],
  ),
);
const defs = [];
for (const m of reg.matchAll(
  /ie_key:\s*"([^"]+)",\s*ie_name:\s*"[^"]*",\s*className:\s*"([^"]+)",\s*valid_url:\s*([\s\S]*?),\s*module_hint:\s*"([^"]*)"/g,
)) {
  const valid = m[3].trim();
  const isBase = valid === 'null as any' || valid === 'null' || valid === 'false';
  defs.push({ key: m[1], cls: m[2], isBase, hint: m[4].replace(/\\/g, '/').replace(/\.py$/, '') });
}

const focus = new Set([
  'adobepass',
  'amp',
  'aws',
  'art19',
  'asobichannel',
  'pornhub',
  'aenetworks',
  'amazonminitv',
  'antenna',
  'audius',
  'acfun',
  'ard',
  'abematv',
  'afreecatv',
  'agora',
  'audiodraft',
  'applepodcasts',
  'archiveorg',
  'adn',
  'acast',
  'abc',
  'brightcove',
  'facebook',
  'kaltura',
  'tencent',
  'weibo',
  'iqiyi',
  'bilibili',
  'twitch',
  'twitter',
  'tiktok',
  'soundcloud',
  'vimeo',
  'instagram',
  'niconico',
  'youtube/_tab',
  'youtube/_video',
  'youtube/_redirect',
  'youtube/_search',
  'youtube/_clip',
]);

const miss = defs.filter((d) => focus.has(d.hint) && !hand.has(d.key));
const byFam = new Map();
for (const d of miss) {
  if (!byFam.has(d.hint)) byFam.set(d.hint, []);
  byFam.get(d.hint).push(`${d.key}${d.isBase ? '[base]' : ''} (${d.cls})`);
}
for (const [fam, items] of [...byFam.entries()].sort()) {
  console.log(`\n## ${fam}`);
  for (const i of items) console.log('- ' + i);
}
console.log(`\nTOTAL_MISSING ${miss.length}`);
