/**
 * MusicFree 主题 iframe URL 解析
 */

import type { MfThemeIframeMap, MfThemeIframeSlot } from '@/lib/media/audio/online/mf-plugin/mf-theme-presets/types';

export function resolveMfThemeIframeSrc(
  slotPath: string,
  packBaseUrl?: string,
): string {
  const trimmed = slotPath.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) return trimmed;
  if (trimmed.startsWith('@/')) {
    const rel = trimmed.slice(2);
    if (packBaseUrl) {
      const base = packBaseUrl.replace(/\/$/, '');
      return `${base}/${rel}`;
    }
    return `/mf-themes/${rel}`;
  }
  if (packBaseUrl) {
    const base = packBaseUrl.replace(/\/$/, '');
    return `${base}/${trimmed.replace(/^\//, '')}`;
  }
  return trimmed;
}

export function resolveMfThemeIframeMap(
  iframe?: MfThemeIframeMap,
  packBaseUrl?: string,
): MfThemeIframeMap {
  if (!iframe) return {};
  const out: MfThemeIframeMap = {};
  for (const [slot, path] of Object.entries(iframe)) {
    if (!path) continue;
    out[slot as MfThemeIframeSlot] = resolveMfThemeIframeSrc(path, packBaseUrl);
  }
  return out;
}

export function mergeMfThemeIframeMaps(
  ...maps: Array<MfThemeIframeMap | undefined>
): MfThemeIframeMap {
  return Object.assign({}, ...maps.filter(Boolean));
}
