/// <reference types="vite/client" />

declare module '*.sql?raw' {
  const content: string;
  export default content;
}

interface ImportMetaEnv {
  readonly TAURI_ENV_PLATFORM?: string;
  readonly TAURI_ENV_ARCH?: string;
  readonly TAURI_ENV_FAMILY?: string;
  /** enhanced：暴露内嵌 libmpv/Media3/Anime4K；缺省或 artplayer-only 为轻量（仍含外置） */
  readonly VITE_VIDEO_PROFILE?: string;
  readonly VITE_ENABLE_FFMPEG_WASM?: string;
  readonly VITE_WEB_HTTP_PROXY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
