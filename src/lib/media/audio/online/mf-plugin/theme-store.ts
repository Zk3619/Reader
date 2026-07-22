/**
 * MusicFree 远程主题商店（对齐 themePackStoreBaseUrl）
 */

import { unzipSync } from 'fflate';
import { request } from '@/lib/http';
import {
  applyMfThemePreset,
  applyMfThemeFromConfig,
  importMfThemePackFromFile,
  parseMfThemePackCss,
} from '@/lib/media/audio/online/mf-plugin/theme-pack';
import { getMfBuiltinThemePreset } from '@/lib/media/audio/online/mf-plugin/mf-theme-presets';
import type { MfThemePackConfig } from '@/lib/media/audio/online/mf-plugin/mf-theme-presets/types';
import {
  isOpfsMfThemeSupported,
  normalizeMfThemeZipEntries,
  opfsMfThemePackBase,
  readMfThemeOpfsText,
  writeMfThemePackToOpfs,
} from '@/lib/media/audio/online/mf-plugin/mf-theme-opfs';

export const MF_THEME_STORE_BASE_URLS = [
  'https://raw.githubusercontent.com/maotoumao/MusicFreeThemePacks/master/',
  'https://cdn.jsdelivr.net/gh/maotoumao/MusicFreeThemePacks@master/',
] as const;

export type MfRemoteThemeEntry = {
  name: string;
  path: string;
  author?: string;
  description?: string;
};

function collectIframeAssetPaths(config: MfThemePackConfig): string[] {
  const paths = new Set<string>();
  const add = (value?: string) => {
    if (!value) return;
    const trimmed = value.trim();
    if (trimmed.startsWith('@/')) paths.add(trimmed.slice(2));
    else if (!/^https?:\/\//i.test(trimmed)) paths.add(trimmed.replace(/^\//, ''));
  };
  add(config.preview);
  if (config.iframe) {
    for (const p of Object.values(config.iframe)) add(p);
  }
  return [...paths];
}

async function fetchRemoteBytes(url: string): Promise<Uint8Array | null> {
  try {
    const res = await request(url, {
      method: 'GET',
      timeout: 45_000,
      useBackendHttp: true,
    });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function fetchRemoteText(url: string): Promise<string | null> {
  const bytes = await fetchRemoteBytes(url);
  if (!bytes) return null;
  return new TextDecoder().decode(bytes);
}

async function fetchRemoteMfthemeZip(path: string): Promise<Uint8Array | null> {
  const candidates = [
    `${path}.mftheme`,
    `${path}/${path}.mftheme`,
    `${path}/theme.mftheme`,
  ];
  for (const base of MF_THEME_STORE_BASE_URLS) {
    for (const rel of candidates) {
      const bytes = await fetchRemoteBytes(`${base}${rel}`);
      if (bytes?.length) return bytes;
    }
  }
  return null;
}

async function fetchRemoteThemeFolder(path: string): Promise<Record<string, Uint8Array>> {
  const entries: Record<string, Uint8Array> = {};
  let cssText = '';
  let configText = '';
  for (const base of MF_THEME_STORE_BASE_URLS) {
    cssText = (await fetchRemoteText(`${base}${path}/index.css`)) ?? '';
    configText = (await fetchRemoteText(`${base}${path}/config.json`)) ?? '';
    if (cssText) break;
  }
  if (!cssText) throw new Error('无法下载远程主题 index.css');

  entries['index.css'] = new TextEncoder().encode(cssText);
  if (configText) entries['config.json'] = new TextEncoder().encode(configText);

  let config: MfThemePackConfig = {};
  if (configText) {
    try {
      config = JSON.parse(configText) as MfThemePackConfig;
    } catch {
      // ignore
    }
  }
  for (const rel of collectIframeAssetPaths(config)) {
    for (const base of MF_THEME_STORE_BASE_URLS) {
      const bytes = await fetchRemoteBytes(`${base}${path}/${rel}`);
      if (bytes?.length) {
        entries[rel] = bytes;
        break;
      }
    }
  }
  return entries;
}

async function applyMfThemeFromOpfsEntries(
  themeId: string,
  entries: Record<string, Uint8Array>,
): Promise<void> {
  const normalized = normalizeMfThemeZipEntries(entries);
  if (!normalized['index.css']) {
    throw new Error('主题包缺少 index.css');
  }
  const cssText = new TextDecoder().decode(normalized['index.css']);
  const { meta, css } = parseMfThemePackCss(cssText);

  let config: MfThemePackConfig = {};
  if (normalized['config.json']) {
    try {
      config = JSON.parse(new TextDecoder().decode(normalized['config.json'])) as MfThemePackConfig;
      Object.assign(meta, config);
    } catch {
      // ignore
    }
  }

  const hasIframe = !!(config.iframe && Object.keys(config.iframe).length > 0);

  if (isOpfsMfThemeSupported()) {
    await writeMfThemePackToOpfs(themeId, normalized);
  }

  applyMfThemeFromConfig({
    css,
    effect: config.iframe?.app ? 'iframe' : 'none',
    iframe: config.iframe,
    packBaseUrl: isOpfsMfThemeSupported()
      ? opfsMfThemePackBase(themeId)
      : `/mf-themes/${themeId}`,
    opfsThemeId: isOpfsMfThemeSupported() && hasIframe ? themeId : undefined,
    meta: {
      name: config.name ?? meta.name,
      author: config.author ?? meta.author,
      version: config.version ?? meta.version,
      description: config.description ?? meta.description,
    },
  });
}

export async function fetchMfRemoteThemeCatalog(): Promise<MfRemoteThemeEntry[]> {
  for (const base of MF_THEME_STORE_BASE_URLS) {
    try {
      const res = await request(`${base}.publish/publish.json`, {
        method: 'GET',
        timeout: 20_000,
        useBackendHttp: true,
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { themes?: MfRemoteThemeEntry[] };
      if (Array.isArray(json.themes)) return json.themes;
    } catch {
      // try next mirror
    }
  }
  return [{ name: '樱花', path: 'sakura', author: '猫头猫' }];
}

export async function installMfThemeFromRemote(path: string): Promise<void> {
  if (path === 'sakura' && getMfBuiltinThemePreset('sakura')) {
    applyMfThemePreset('sakura');
    return;
  }

  const zip = await fetchRemoteMfthemeZip(path);
  if (zip?.length) {
    const entries = unzipSync(zip);
    await applyMfThemeFromOpfsEntries(path, entries);
    return;
  }

  const folderEntries = await fetchRemoteThemeFolder(path);
  await applyMfThemeFromOpfsEntries(path, folderEntries);
}

export async function installMfThemeFromMfthemeFile(file: File): Promise<void> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const entries = unzipSync(buf);
  const themeId = file.name.replace(/\.mftheme$/i, '') || `custom-${Date.now()}`;
  await applyMfThemeFromOpfsEntries(themeId, entries);
}

/** 读取已安装 OPFS 主题中的 config.json（调试/预览用） */
export async function readInstalledMfThemeConfig(themeId: string): Promise<string | null> {
  return readMfThemeOpfsText(themeId, 'config.json');
}

export { importMfThemePackFromFile };
