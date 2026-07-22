/**
 * MusicFree 官方「樱花」主题（MusicFreeThemePacks/sakura）
 * - 官方 index.css 变量
 * - WebGL 飘落 iframe（/public/mf-themes/sakura/iframes/app.html）
 */

import type { MfThemePreset } from '@/lib/media/audio/online/mf-plugin/mf-theme-presets/types';

/** 与官方 index.css 一致（:root 选择器在 Reader 中映射到 hub） */
export const SAKURA_MF_CSS = `
  --primaryColor: #ff7676;
  --textColor: #fcfcfc;
  --textSecondaryColor: #aaaaaa;
  --backgroundColor: #686c75;
  --shadowColor: rgba(0, 0, 0, 0.3);
  --dividerColor: rgba(255, 255, 255, 0.1);
  --maskColor: rgba(33, 33, 33, 0.2);
  --backdropColor: #4b4949;
  --listHoverColor: rgba(255, 255, 255, 0.05);
  --listActiveColor: rgba(255, 255, 255, 0.1);
  --placeholderColor: #dededeba;

  --background: 225 7% 43%;
  --foreground: 0 0% 99%;
  --card: 0 0% 29%;
  --card-foreground: 0 0% 99%;
  --popover: 0 0% 29%;
  --popover-foreground: 0 0% 99%;
  --primary: 0 100% 73%;
  --primary-foreground: 0 0% 100%;
  --secondary: 0 0% 35%;
  --secondary-foreground: 0 0% 96%;
  --muted: 0 0% 32%;
  --muted-foreground: 0 0% 72%;
  --accent: 0 0% 36%;
  --accent-foreground: 0 0% 98%;
  --border: 0 0% 100% / 0.12;
  --input: 0 0% 100% / 0.14;
  --ring: 0 100% 73%;

  color: var(--textColor);
  background-color: var(--backgroundColor);
`;

export const SAKURA_MF_SURFACE_CSS = `
[data-music-hub="true"][data-mf-theme="sakura"] [class*="bg-background"] {
  background-color: rgba(0, 0, 0, 0.2) !important;
}
[data-music-hub="true"][data-mf-theme="sakura"] [class*="backdrop-blur"] {
  backdrop-filter: blur(10px);
}
[data-music-hub="true"][data-mf-theme="sakura"] a {
  color: #8bd1ed;
}
`;

export const SAKURA_IFRAME_URL = '/mf-themes/sakura/iframes/app.html';

export const SAKURA_THEME_PRESET: MfThemePreset = {
  id: 'sakura',
  name: '樱花',
  author: '猫头猫',
  description: 'MusicFree 官方樱花主题：官方配色 + WebGL 樱花飘落。',
  preview: {
    background: '#686c75',
    foreground: '#fcfcfc',
    primary: '#ff7676',
  },
  css: SAKURA_MF_CSS,
  surfaceCss: SAKURA_MF_SURFACE_CSS,
  effect: 'sakura-iframe',
  packBaseUrl: '/mf-themes/sakura',
  iframe: {
    app: '@/iframes/app.html',
  },
  iframeUrl: SAKURA_IFRAME_URL,
};
