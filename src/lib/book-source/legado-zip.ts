/**
 * 解析 Legado 备份 ZIP / 书源 ZIP（bookSource.json、rssSources.json 等）
 */

import { invoke } from '@tauri-apps/api/core';
import { unzip } from 'fflate';
import { isTauri } from '@/lib/platform/detect';

export type LegadoZipEntries = Record<string, string>;

function basename(path: string): string {
  const norm = path.replace(/\\/g, '/');
  const parts = norm.split('/');
  return parts[parts.length - 1] ?? path;
}

async function extractZipWeb(bytes: Uint8Array): Promise<LegadoZipEntries> {
  const raw = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(bytes, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
  const out: LegadoZipEntries = {};
  for (const [path, data] of Object.entries(raw)) {
    const name = basename(path).toLowerCase();
    if (!name.endsWith('.json') && !name.endsWith('.txt')) continue;
    const text = new TextDecoder().decode(data);
    if (text.trim()) out[name] = text;
  }
  return out;
}

export async function extractLegadoZipEntries(file: File): Promise<LegadoZipEntries> {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (isTauri()) {
    return invoke<LegadoZipEntries>('extract_zip_json_entries', {
      zipBytes: Array.from(buf),
    });
  }
  return extractZipWeb(buf);
}

/** Legado 备份包内常见 JSON 文件名 */
export const LEGADO_ZIP_BOOK_SOURCE_NAMES = [
  'booksource.json',
  'book_source.json',
  'sharebooksource.json',
];
export const LEGADO_ZIP_RSS_NAMES = ['rsssources.json', 'rsssource.json'];
export const LEGADO_ZIP_REPLACE_RULE_NAMES = ['replacerule.json', 'replace_rule.json'];

export function pickZipEntry(
  entries: LegadoZipEntries,
  names: string[]
): string | undefined {
  const lowerMap = new Map(
    Object.entries(entries).map(([k, v]) => [k.toLowerCase(), v])
  );
  for (const name of names) {
    const hit = lowerMap.get(name.toLowerCase());
    if (hit) return hit;
  }
  for (const [key, value] of lowerMap) {
    if (names.some((n) => key.includes(n.replace('.json', '')))) {
      return value;
    }
  }
  return undefined;
}
