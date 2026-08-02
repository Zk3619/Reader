#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../extractors');
const regPath = path.join(root, 'generated-registry.ts');
let reg = fs.readFileSync(regPath, 'utf8');

const handA = fs.readFileSync(path.join(root, 'hand-a/index.ts'), 'utf8');
const fromHandA = [...handA.matchAll(/ie_key:\s*'([^']+)'/g)].map((m) => m[1]);

const extra = [
  'AdobePass',
  'AMP',
  'AWS',
  'Art19Show',
  'AsobiChannelTagURL',
  'AsobiChannelBase',
  'AcFunVideoBase',
  'PornHubPagedVideoList',
  'PornHubUserVideosUpload',
  'PornHubBase',
  'PornHubPlaylistBase',
  'PornHubPagedPlaylistBase',
];

const m = reg.match(/export const HAND_OVERRIDES = new Set\(\[([\s\S]*?)\]\);/);
const existing = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
const merged = [...new Set([...existing, ...fromHandA, ...extra])].sort((a, b) =>
  a.localeCompare(b),
);
const body = merged.map((k) => `  "${k}",`).join('\n');
reg = reg.replace(
  /export const HAND_OVERRIDES = new Set\(\[[\s\S]*?\]\);/,
  `export const HAND_OVERRIDES = new Set([\n${body}\n]);`,
);
fs.writeFileSync(regPath, reg, 'utf8');
console.log(JSON.stringify({ total: merged.length, extra }, null, 2));
