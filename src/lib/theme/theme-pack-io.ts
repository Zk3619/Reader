/**
 * Theme Pack 导入 / 导出（JSON + ZIP via fflate）
 */

import { unzip, zip } from 'fflate';
import type { ReaderThemePackV1 } from '@/lib/theme/schema/theme-pack-v1';
import { parseThemePackJsonString, type ThemePackValidationResult } from '@/lib/theme/schema/validate-theme-pack';
import { legadoThemeConfigToPacks } from '@/lib/theme/adapters/legado-theme-adapter';
import {
  persistThemeAssetsFromZip,
  readThemeAssetsForExport,
} from '@/lib/theme/theme-asset-storage';

const THEME_JSON = 'theme.json';
const PREVIEW_PNG = 'preview.png';

function encodeText(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/** 导出为 JSON 字符串 */
export function exportThemePackJson(pack: ReaderThemePackV1): string {
  return JSON.stringify(pack, null, 2);
}

/** 从 JSON 字符串导入 */
export function importThemePackJson(json: string): ThemePackValidationResult {
  return parseThemePackJsonString(json);
}

/** 导出 .reader-theme.zip Blob（含 assets/，可选 preview.png） */
export async function exportThemePackZip(
  pack: ReaderThemePackV1,
  options?: { previewPng?: Uint8Array },
): Promise<Blob> {
  const files: Record<string, Uint8Array> = {
    [THEME_JSON]: encodeText(exportThemePackJson(pack)),
  };
  if (options?.previewPng?.byteLength) {
    files[PREVIEW_PNG] = options.previewPng;
  }
  const assetFiles = await readThemeAssetsForExport(pack.id, pack.assets);
  Object.assign(files, assetFiles);

  const zipped = await new Promise<Uint8Array>((resolve, reject) => {
    zip(files, (err, data) => (err ? reject(err) : resolve(data)));
  });
  return new Blob([zipped], { type: 'application/zip' });
}

export interface ThemePackZipImportResult {
  ok: boolean;
  pack?: ReaderThemePackV1;
  issues: ThemePackValidationResult['issues'];
}

/** 从 ZIP 导入 theme.json */
export async function importThemePackZip(file: File): Promise<ThemePackZipImportResult> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(buffer, (err, data) => (err ? reject(err) : resolve(data)));
  });

  const themeBytes = entries[THEME_JSON] ?? entries[`./${THEME_JSON}`];
  if (!themeBytes) {
    return { ok: false, issues: [{ path: THEME_JSON, message: 'ZIP 中缺少 theme.json' }] };
  }

  const result = importThemePackJson(decodeText(themeBytes));
  if (!result.ok || !result.pack) {
    return { ok: false, issues: result.issues };
  }

  const assetEntries: Record<string, Uint8Array> = {};
  for (const [path, bytes] of Object.entries(entries)) {
    if (path === THEME_JSON || path === PREVIEW_PNG || path.startsWith('__MACOSX')) continue;
    assetEntries[path] = bytes;
  }

  if (Object.keys(assetEntries).length > 0) {
    const manifest = await persistThemeAssetsFromZip(
      result.pack.id,
      assetEntries,
      result.pack.assets,
    );
    result.pack = { ...result.pack, assets: manifest };
  }

  return { ok: true, pack: result.pack, issues: result.issues };
}

/** 尝试 Legado themeConfig.json 导入 */
export function importLegadoThemeConfigJson(json: string): ReaderThemePackV1[] {
  try {
    return legadoThemeConfigToPacks(JSON.parse(json));
  } catch {
    return [];
  }
}

/** 触发浏览器下载 */
export function downloadThemePackJson(pack: ReaderThemePackV1, filename?: string): void {
  const blob = new Blob([exportThemePackJson(pack)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? `${pack.name.replace(/\s+/g, '-')}.reader-theme.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadThemePackZip(
  pack: ReaderThemePackV1,
  filename?: string,
  options?: { previewPng?: Uint8Array },
): Promise<void> {
  const blob = await exportThemePackZip(pack, options);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? `${pack.name.replace(/\s+/g, '-')}.reader-theme.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
