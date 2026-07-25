/**
 * @deprecated MusicFree Hub 主题包（.mftheme / index.css）已弃用：设置入口与运行时挂载已移除；能力保留供主题工作室迁移参考。
 */

import {
  getMfBuiltinThemePreset,
  listMfBuiltinThemePresets,
  type MfThemeEffect,
  type MfThemeIframeMap,
  type MfThemePreset,
} from '@/lib/media/audio/online/mf-plugin/mf-theme-presets';
import {
  mergeMfThemeIframeMaps,
  resolveMfThemeIframeMap,
} from '@/lib/media/audio/online/mf-plugin/mf-theme-iframe';
import {
  parseOpfsMfThemePackBase,
  resolveOpfsMfThemeIframeMap,
} from '@/lib/media/audio/online/mf-plugin/mf-theme-opfs';
import { isMobile } from '@/lib/platform/detect';

const STYLE_ID = 'reader-mf-theme-pack';
const SURFACE_STYLE_ID = 'reader-mf-theme-pack-surface';

export type MfThemePackMeta = {
  name?: string;
  author?: string;
  version?: string;
  description?: string;
};

type StoredTheme = {
  presetId?: string | null;
  css?: string;
  surfaceCss?: string;
  effect?: MfThemeEffect;
  iframeUrl?: string;
  iframe?: MfThemeIframeMap;
  packBaseUrl?: string;
  opfsThemeId?: string;
  meta?: MfThemePackMeta;
};

let opfsResolvedIframes: MfThemeIframeMap = {};

const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export function subscribeMfThemePack(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function parseMfThemePackCss(text: string): { meta: MfThemePackMeta; css: string } {
  let meta: MfThemePackMeta = {};
  let css = text.trim();
  const configMatch = css.match(/\/\*\s*@config\s*([\s\S]*?)\s*\*\//);
  if (configMatch?.[1]) {
    try {
      meta = JSON.parse(configMatch[1]) as MfThemePackMeta;
      css = css.replace(configMatch[0], '').trim();
    } catch {
      // ignore
    }
  }
  return { meta, css };
}

function injectStyle(id: string, selector: string, css: string): void {
  if (typeof document === 'undefined') return;
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!css.trim()) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('style');
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = `${selector} {\n${css}\n}`;
}

function injectSurfaceStyle(css: string): void {
  if (!css.trim()) {
    document.getElementById(SURFACE_STYLE_ID)?.remove();
    return;
  }
  let el = document.getElementById(SURFACE_STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = SURFACE_STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

function setHubThemeAttr(presetId: string | null, effect: MfThemeEffect): void {
  if (typeof document === 'undefined') return;
  const hub = document.querySelector<HTMLElement>('[data-music-hub="true"]');
  if (!hub) return;
  if (presetId) hub.setAttribute('data-mf-theme', presetId);
  else hub.removeAttribute('data-mf-theme');
  if (effect && effect !== 'none') hub.setAttribute('data-mf-theme-effect', effect);
  else hub.removeAttribute('data-mf-theme-effect');
}

export function shouldUseMfThemeIframeEffect(effect: MfThemeEffect): boolean {
  if (isMobile() && (effect === 'sakura-iframe' || effect === 'sakura-petals')) {
    return false;
  }
  return effect === 'sakura-iframe' || effect === 'iframe';
}

export function shouldUseSakuraCanvasFallback(effect?: MfThemeEffect): boolean {
  const eff = effect ?? getActiveMfThemeEffect();
  return isMobile() && (eff === 'sakura-iframe' || eff === 'sakura-petals');
}

export async function hydrateMfThemeOpfsAssets(): Promise<void> {
  const stored = readStoredTheme();
  opfsResolvedIframes = {};
  const themeId = stored?.opfsThemeId ?? parseOpfsMfThemePackBase(stored?.packBaseUrl);
  if (!themeId || !stored?.iframe) return;
  try {
    opfsResolvedIframes = await resolveOpfsMfThemeIframeMap(
      themeId,
      stored.iframe as Record<string, string | undefined>,
    );
    notify();
  } catch (err) {
    console.warn('[mf-theme] OPFS iframe hydrate failed', err);
  }
}

export function getActiveMfThemeIframeUrl(): string | null {
  const iframes = getActiveMfThemeIframes();
  return iframes.app ?? null;
}

export function getActiveMfThemeIframes(): MfThemeIframeMap {
  if (Object.keys(opfsResolvedIframes).length > 0) {
    return opfsResolvedIframes;
  }
  const stored = readStoredTheme();
  if (stored?.opfsThemeId || parseOpfsMfThemePackBase(stored?.packBaseUrl)) {
    return {};
  }
  if (stored?.iframe && Object.keys(stored.iframe).length > 0) {
    return resolveMfThemeIframeMap(stored.iframe, stored.packBaseUrl);
  }
  if (stored?.iframeUrl) {
    return { app: stored.iframeUrl };
  }
  if (stored?.presetId) {
    const preset = getMfBuiltinThemePreset(stored.presetId);
    if (!preset) return {};
    return resolveMfThemeIframeMap(
      mergeMfThemeIframeMaps(
        preset.iframe,
        preset.iframeUrl ? { app: preset.iframeUrl } : undefined,
      ),
      preset.packBaseUrl,
    );
  }
  return {};
}

function applyStoredTheme(stored: StoredTheme): void {
  injectStyle(STYLE_ID, '[data-music-hub="true"]', stored.css ?? '');
  injectSurfaceStyle(stored.surfaceCss ?? '');
  setHubThemeAttr(stored.presetId ?? null, stored.effect ?? 'none');
}

export function applyMfThemePackCss(css: string, options?: { surfaceCss?: string }): void {
  applyStoredTheme({
    presetId: null,
    css,
    surfaceCss: options?.surfaceCss,
    effect: 'none',
  });
}

export function clearMfThemePackCss(): void {
  document.getElementById(STYLE_ID)?.remove();
  document.getElementById(SURFACE_STYLE_ID)?.remove();
  setHubThemeAttr(null, 'none');
}

const THEME_STORAGE_KEY = 'reader_audio_mf_theme_css';

function readStoredTheme(): StoredTheme | null {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredTheme;
  } catch {
    return null;
  }
}

function writeStoredTheme(stored: StoredTheme | null): void {
  try {
    if (!stored) localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // ignore
  }
  notify();
}

function persistAndApply(stored: StoredTheme): void {
  writeStoredTheme(stored);
  applyStoredTheme(stored);
}

export function getActiveMfThemePresetId(): string | null {
  return readStoredTheme()?.presetId ?? null;
}

export function getActiveMfThemeEffect(): MfThemeEffect {
  const stored = readStoredTheme();
  if (stored?.effect) return stored.effect;
  if (stored?.presetId) {
    return getMfBuiltinThemePreset(stored.presetId)?.effect ?? 'none';
  }
  return 'none';
}

export function applyMfThemePreset(presetId: string | null): void {
  if (!presetId) {
    clearMfThemePackStorage();
    return;
  }
  const preset = getMfBuiltinThemePreset(presetId);
  if (!preset) throw new Error(`未知 MusicFree 内置主题：${presetId}`);
  opfsResolvedIframes = {};
  persistAndApply({
    presetId: preset.id,
    css: preset.css,
    surfaceCss: preset.surfaceCss,
    effect: preset.effect ?? 'none',
    iframeUrl: preset.iframeUrl ?? preset.iframe?.app,
    iframe: preset.iframe ?? (preset.iframeUrl ? { app: preset.iframeUrl } : undefined),
    packBaseUrl: preset.packBaseUrl,
    meta: {
      name: preset.name,
      author: preset.author,
      description: preset.description,
    },
  });
}

export { listMfBuiltinThemePresets, type MfThemePreset, type MfThemeIframeMap };

export async function importMfThemePackFromFile(file: File): Promise<MfThemePackMeta> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.css')) {
    const { meta, css } = parseMfThemePackCss(await file.text());
    persistAndApply({
      presetId: null,
      css,
      effect: 'none',
      meta,
    });
    return meta;
  }
  if (name.endsWith('.json')) {
    const json = JSON.parse(await file.text()) as { css?: string; config?: MfThemePackMeta };
    const css = String(json.css ?? '');
    persistAndApply({
      presetId: null,
      css,
      effect: 'none',
      meta: json.config ?? {},
    });
    return json.config ?? {};
  }
  throw new Error('仅支持 .css 或 .json 主题包');
}

export function restoreMfThemePackFromStorage(): void {
  const stored = readStoredTheme();
  if (!stored?.css) return;
  applyStoredTheme(stored);
  if (stored.opfsThemeId || parseOpfsMfThemePackBase(stored.packBaseUrl)) {
    void hydrateMfThemeOpfsAssets();
  }
}

export function clearMfThemePackStorage(): void {
  opfsResolvedIframes = {};
  writeStoredTheme(null);
  clearMfThemePackCss();
}

export function applyMfThemeFromConfig(options: {
  css: string;
  surfaceCss?: string;
  effect?: MfThemeEffect;
  iframe?: MfThemeIframeMap;
  packBaseUrl?: string;
  opfsThemeId?: string;
  meta?: MfThemePackMeta;
}): void {
  opfsResolvedIframes = {};
  persistAndApply({
    presetId: null,
    css: options.css,
    surfaceCss: options.surfaceCss,
    effect: options.effect ?? (options.iframe?.app ? 'iframe' : 'none'),
    iframe: options.iframe,
    iframeUrl: options.iframe?.app,
    packBaseUrl: options.packBaseUrl,
    opfsThemeId: options.opfsThemeId,
    meta: options.meta,
  });
  if (options.opfsThemeId) {
    void hydrateMfThemeOpfsAssets();
  }
}
