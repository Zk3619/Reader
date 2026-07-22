/**
 * MusicFree 插件订阅 JSON（对齐 Desktop installPluginFromLocal/Remote 的 .json）
 * 形态：{ desc?, plugins: [{ name?, url, version? }] } 或 URL 字符串数组
 */

export type MfPluginManifestEntry = {
  name?: string;
  url?: string;
  srcUrl?: string;
  version?: string;
};

/** MusicFree 订阅清单：`{ plugins: [{ url }] }` 或 URL 数组 */
export function isMfPluginsJsonManifest(parsed: unknown): boolean {
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) return false;
    return parsed.every(
      (item) =>
        typeof item === 'string' ||
        (item != null &&
          typeof item === 'object' &&
          (typeof (item as MfPluginManifestEntry).url === 'string' ||
            typeof (item as MfPluginManifestEntry).srcUrl === 'string')),
    );
  }
  if (!parsed || typeof parsed !== 'object') return false;
  const plugins = (parsed as { plugins?: unknown }).plugins;
  return Array.isArray(plugins) && isMfPluginsJsonManifest(plugins);
}

export function extractMfPluginUrlsFromManifest(parsed: unknown): string[] {
  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object') {
          const entry = item as MfPluginManifestEntry;
          const u = entry.url ?? entry.srcUrl;
          return typeof u === 'string' ? u.trim() : '';
        }
        return '';
      })
      .filter((u) => /^https?:\/\//i.test(u));
  }
  if (
    parsed &&
    typeof parsed === 'object' &&
    Array.isArray((parsed as { plugins?: unknown }).plugins)
  ) {
    return extractMfPluginUrlsFromManifest((parsed as { plugins: unknown[] }).plugins);
  }
  return [];
}

/** 文本是否像 MusicFree plugins.json */
export function looksLikeMfPluginsJsonText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false;
  try {
    return isMfPluginsJsonManifest(JSON.parse(trimmed));
  } catch {
    return false;
  }
}

export function urlLooksLikeMfPluginsJson(url: string): boolean {
  const u = url.trim();
  return /\.json(\?|#|$)/i.test(u) || /plugins\.json/i.test(u);
}
