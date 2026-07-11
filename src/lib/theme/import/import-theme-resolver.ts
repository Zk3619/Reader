/**
 * 从 File / 目录 / 文本 / URL 解析候选主题包
 */

import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '@/lib/platform/detect';
import { toWebHttpProxyRequest } from '@/lib/http/web-http-proxy';
import { getThemePreset } from '@/lib/database/theme-presets';
import { legadoThemeConfigToPacks } from '@/lib/theme/adapters/legado-theme-adapter';
import {
  importThemePackJson,
  importThemePackZip,
} from '@/lib/theme/theme-pack-io';
import { isThemeImportFileName } from '@/lib/theme/import/theme-import-files';
import { parseThemePackJson } from '@/lib/theme/schema/validate-theme-pack';
import type { ReaderThemePackV1 } from '@/lib/theme/schema/theme-pack-v1';

export type { ImportThemeOptions } from '@/lib/theme/import/import-theme-merge';
export {
  buildImportComparisons,
  defaultImportSelection,
  mergeThemePackForImport,
  type ImportThemeComparison,
} from '@/lib/theme/import/import-theme-merge';

export type ThemeImportSource = 'reader-pack' | 'legado' | 'zip';

export interface ResolvedThemeEntry {
  pack: ReaderThemePackV1;
  source: ThemeImportSource;
  sourceFile?: string;
}

export interface ResolvedThemes {
  entries: ResolvedThemeEntry[];
  warnings?: string[];
}

export type ThemeImportStage = 'fetch' | 'parse' | 'file';

export interface ThemeImportProgress {
  stage: ThemeImportStage;
  message: string;
  current?: number;
  total?: number;
}

export type ThemeImportProgressCallback = (progress: ThemeImportProgress) => void;

export interface ResolveThemeFileOptions {
  overwriteAssets?: boolean;
}

function isZipFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith('.zip') || lower.endsWith('.reader-theme.zip');
}

function isZipUrl(url: string): boolean {
  return /\.zip(\?|#|$)/i.test(url);
}

function parseThemePacksFromJsonText(text: string): {
  packs: ReaderThemePackV1[];
  source: ThemeImportSource;
} {
  const trimmed = text.trim();
  if (!trimmed) return { packs: [], source: 'reader-pack' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const single = importThemePackJson(trimmed);
    if (single.ok && single.pack) {
      return { packs: [single.pack], source: 'reader-pack' };
    }
    return { packs: [], source: 'reader-pack' };
  }

  const legado = legadoThemeConfigToPacks(parsed);
  if (legado.length > 0) {
    return { packs: legado, source: 'legado' };
  }

  if (Array.isArray(parsed)) {
    const packs: ReaderThemePackV1[] = [];
    for (const item of parsed) {
      const result = parseThemePackJson(item);
      if (result.ok && result.pack) packs.push(result.pack);
    }
    return { packs, source: 'reader-pack' };
  }

  const result = parseThemePackJson(parsed);
  if (result.ok && result.pack) {
    return { packs: [result.pack], source: 'reader-pack' };
  }
  return { packs: [], source: 'reader-pack' };
}

async function applyZipAssetPolicy(
  pack: ReaderThemePackV1,
  overwriteAssets?: boolean,
): Promise<ReaderThemePackV1> {
  if (overwriteAssets !== false) return pack;
  const existing = await getThemePreset(pack.id);
  if (!existing?.manifest.assets) return pack;
  return { ...pack, assets: structuredClone(existing.manifest.assets) };
}

async function resolveThemesFromZipFile(
  file: File,
  options?: ResolveThemeFileOptions,
): Promise<ResolvedThemeEntry[]> {
  const result = await importThemePackZip(file);
  if (!result.ok || !result.pack) {
    throw new Error(result.issues[0]?.message ?? 'ZIP 主题包解析失败');
  }
  const pack = await applyZipAssetPolicy(result.pack, options?.overwriteAssets);
  return [{ pack, source: 'zip', sourceFile: file.name }];
}

export async function resolveThemesFromFile(
  file: File,
  options?: ResolveThemeFileOptions,
): Promise<ResolvedThemes> {
  if (isZipFileName(file.name)) {
    return {
      entries: await resolveThemesFromZipFile(file, options),
    };
  }

  const text = await file.text();
  const { packs, source } = parseThemePacksFromJsonText(text);
  if (packs.length === 0) {
    throw new Error('未能解析出有效主题包');
  }

  return {
    entries: packs.map((pack) => ({ pack, source, sourceFile: file.name })),
  };
}

/** 目录批量：按 pack.id 合并；附带警告去重 */
export async function resolveThemesFromLocalFiles(
  files: File[],
  options?: ResolveThemeFileOptions,
  onProgress?: ThemeImportProgressCallback,
): Promise<ResolvedThemes> {
  const eligible = files.filter((f) => isThemeImportFileName(f.name));
  if (eligible.length === 0) {
    throw new Error('未找到符合条件的主题文件（json / zip）');
  }

  const byId = new Map<string, ResolvedThemeEntry>();
  const warningSet = new Set<string>();
  const fileErrors: string[] = [];
  const total = eligible.length;

  for (let i = 0; i < eligible.length; i++) {
    const file = eligible[i]!;
    onProgress?.({
      stage: 'file',
      message: `正在解析文件… (${i + 1}/${total})`,
      current: i + 1,
      total,
    });
    try {
      const resolved = await resolveThemesFromFile(file, options);
      for (const entry of resolved.entries) {
        byId.set(entry.pack.id, entry);
      }
      for (const warning of resolved.warnings ?? []) {
        warningSet.add(warning);
      }
    } catch (err) {
      fileErrors.push(`${file.name}：${String(err)}`);
    }
  }

  if (byId.size === 0) {
    const detail =
      fileErrors.length > 0 ? fileErrors.slice(0, 3).join('；') : '未能解析出有效主题包';
    throw new Error(detail);
  }

  if (fileErrors.length > 0) {
    warningSet.add(`已跳过 ${fileErrors.length} 个无法解析的文件`);
  }

  return {
    entries: [...byId.values()],
    warnings: warningSet.size > 0 ? [...warningSet] : undefined,
  };
}

async function fetchThemeImportText(urlRaw: string): Promise<string> {
  const url = urlRaw.trim();
  if (!url) return '';

  if (isTauri()) {
    return invoke<string>('fetch_url_text', {
      url,
      timeoutMs: 30000,
      skipUserAgent: false,
    });
  }

  const proxied = toWebHttpProxyRequest(url, {
    method: 'GET',
    redirect: 'follow',
  });

  const res = await fetch(proxied?.url ?? url, proxied?.init ?? { mode: 'cors' });
  if (!res.ok) throw new Error(`请求失败: ${res.status}`);
  return res.text();
}

type DownloadBinaryResult = {
  data: number[];
  status: number;
};

async function fetchThemeImportZipFile(urlRaw: string): Promise<File> {
  const url = urlRaw.trim();
  if (!url) throw new Error('URL 为空');

  if (isTauri()) {
    const result = await invoke<DownloadBinaryResult>('download_binary', {
      url,
      method: 'GET',
      timeoutMs: 60000,
    });
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`请求失败: ${result.status}`);
    }
    const fileName = url.split(/[/?#]/).pop() || 'theme.zip';
    return new File([new Uint8Array(result.data)], fileName, { type: 'application/zip' });
  }

  const proxied = toWebHttpProxyRequest(url, {
    method: 'GET',
    redirect: 'follow',
  });
  const res = await fetch(proxied?.url ?? url, proxied?.init ?? { mode: 'cors' });
  if (!res.ok) throw new Error(`请求失败: ${res.status}`);
  const buffer = await res.arrayBuffer();
  const fileName = url.split(/[/?#]/).pop() || 'theme.zip';
  return new File([buffer], fileName, { type: 'application/zip' });
}

export async function resolveThemesFromNetworkUrl(
  urlRaw: string,
  options?: ResolveThemeFileOptions,
  onProgress?: ThemeImportProgressCallback,
): Promise<ResolvedThemes> {
  const url = urlRaw.trim();
  if (!url) return { entries: [] };

  if (isZipUrl(url)) {
    onProgress?.({ stage: 'fetch', message: '正在下载主题 ZIP…' });
    const file = await fetchThemeImportZipFile(url);
    onProgress?.({ stage: 'parse', message: '正在解析主题 ZIP…' });
    return {
      entries: await resolveThemesFromZipFile(file, options),
    };
  }

  onProgress?.({ stage: 'fetch', message: '正在下载主题…' });
  const text = await fetchThemeImportText(url);
  onProgress?.({ stage: 'parse', message: '正在解析主题…' });
  const { packs, source } = parseThemePacksFromJsonText(text);
  return {
    entries: packs.map((pack) => ({ pack, source })),
  };
}

export async function resolveThemesFromText(
  text: string,
  options?: ResolveThemeFileOptions,
  onProgress?: ThemeImportProgressCallback,
): Promise<ResolvedThemes> {
  const trimmed = text.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return resolveThemesFromNetworkUrl(trimmed, options, onProgress);
  }
  onProgress?.({ stage: 'parse', message: '正在解析主题…' });
  const { packs, source } = parseThemePacksFromJsonText(trimmed);
  return {
    entries: packs.map((pack) => ({ pack, source })),
  };
}

/** 扁平化 entries，便于批量导入 */
export function flattenResolvedThemes(resolved: ResolvedThemes): ReaderThemePackV1[] {
  return resolved.entries.map((entry) => entry.pack);
}
