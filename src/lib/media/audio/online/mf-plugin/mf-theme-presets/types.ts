import type { MfThemePackMeta } from '@/lib/media/audio/online/mf-plugin/theme-pack';

export const MF_THEME_IFRAME_SLOTS = [
  'app',
  'header',
  'body',
  'music-bar',
  'side-bar',
  'page',
] as const;

export type MfThemeIframeSlot = (typeof MF_THEME_IFRAME_SLOTS)[number];

export type MfThemeIframeMap = Partial<Record<MfThemeIframeSlot, string>>;

export type MfThemeEffect = 'none' | 'iframe' | 'sakura-iframe' | 'sakura-petals';

export interface MfThemePackConfig extends MfThemePackMeta {
  preview?: string;
  iframe?: MfThemeIframeMap;
}

export interface MfThemePreset extends MfThemePackMeta {
  id: string;
  name: string;
  css: string;
  /** 额外选择器样式（面板透明等） */
  surfaceCss?: string;
  effect?: MfThemeEffect;
  /** @deprecated 使用 iframe.app */
  iframeUrl?: string;
  iframe?: MfThemeIframeMap;
  /** 主题包根路径（内置 /public/mf-themes/...） */
  packBaseUrl?: string;
  preview?: {
    background: string;
    foreground: string;
    primary: string;
  };
}
