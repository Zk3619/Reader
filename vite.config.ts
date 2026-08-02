import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { readerHttpProxy } from "./vite-plugins/reader-http-proxy";
import { legadoWebApiServer } from "./vite-plugins/legado-web-api-server";
import { serveOrtWasm } from "./vite-plugins/serve-ort-wasm";

/** 默认轻量；enhanced 由 scripts/tauri-cli.mjs 注入 VITE_VIDEO_PROFILE=enhanced */
process.env.VITE_VIDEO_PROFILE ??= "artplayer-only";

const host = process.env.TAURI_DEV_HOST;

/** 开发时排除监听，避免编辑文档/示例/构建产物等触发 HMR */
const DEV_WATCH_IGNORED_DIRS = [
  "src-tauri",
  "docs",
  "examples",
  "dist",
  "web-service-dist",
  "scripts",
  ".cursor",
  ".vscode",
  ".codegraph",
  ".shared",
] as const;
const devWatchIgnored = DEV_WATCH_IGNORED_DIRS.map(
  (dir) => `${path.resolve(__dirname, dir).replace(/\\/g, "/")}/**`,
);

const pathStub = path.resolve(__dirname, "src/stubs/path.ts");
const mobiParserBrowser = path.resolve(
  __dirname,
  "node_modules/@lingo-reader/mobi-parser/dist/index.browser.mjs",
);

// https://vite.dev/config/
export default defineConfig(async () => ({
  test: {
    environment: 'node',
    include: ['src/test/**/*.test.ts'],
    exclude: ['src/test/**/_archive/**'],
    setupFiles: ['./src/test/vitest.setup.ts'],
    alias: {
      'path-browserify': pathStub,
      path: pathStub,
      '@lingo-reader/mobi-parser': mobiParserBrowser,
      'node:async_hooks': path.resolve(
        __dirname,
        'src/lib/media/video/danmaku/danmu-api/shims/async-hooks.js',
      ),
      redis: path.resolve(
        __dirname,
        'src/lib/media/video/danmaku/danmu-api/shims/redis.js',
      ),
      'node-fetch': path.resolve(
        __dirname,
        'src/lib/media/video/danmaku/danmu-api/shims/node-fetch.js',
      ),
      'stream/promises': path.resolve(__dirname, 'src/stubs/stream-promises.js'),
      'node:stream/promises': path.resolve(
        __dirname,
        'src/stubs/stream-promises.js',
      ),
    },
  },
  plugins: [
    solid(),
    tailwindcss(),
    readerHttpProxy(),
    legadoWebApiServer(),
    serveOrtWasm(),
  ],
  // 开发时用默认 base；Tauri 打包后从本地协议加载，需相对路径
  base: process.env.NODE_ENV === "production" ? "./" : "",
  assetsInclude: ["**/*.wasm"],
  worker: {
    // 目录解析 Worker 会共享规则引擎分块，必须使用支持 code-splitting 的 ES 格式。
    format: "es" as const,
  },
  optimizeDeps: {
    exclude: [
      "quickjs-emscripten",
      "@jitl/quickjs-wasmfile-release-sync",
      "onnxruntime-web",
    ],
  },
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "src") },
      { find: "src", replacement: path.resolve(__dirname, "src") },
      { find: "~", replacement: path.resolve(__dirname, "src") },
      {
        find: "@lingo-reader/mobi-parser",
        replacement: mobiParserBrowser,
      },
      // 子路径必须写在 `stream` 之前，否则会被解析成 stub 文件下的 /promises
      {
        find: "stream/promises",
        replacement: path.resolve(__dirname, "src/stubs/stream-promises.js"),
      },
      {
        find: "node:stream/promises",
        replacement: path.resolve(__dirname, "src/stubs/stream-promises.js"),
      },
      {
        find: "stream",
        replacement: path.resolve(__dirname, "src/stubs/stream.ts"),
      },
      {
        find: "node:stream",
        replacement: path.resolve(__dirname, "src/stubs/stream.ts"),
      },
      {
        find: "fs",
        replacement: path.resolve(__dirname, "src/stubs/empty.ts"),
      },
      {
        find: "node:fs",
        replacement: path.resolve(__dirname, "src/stubs/empty.ts"),
      },
      { find: "path", replacement: pathStub },
      { find: "node:path", replacement: pathStub },
      { find: "path-browserify", replacement: pathStub },
      {
        find: "crypto",
        replacement: path.resolve(__dirname, "src/stubs/node-crypto.ts"),
      },
      {
        find: "node:crypto",
        replacement: path.resolve(__dirname, "src/stubs/node-crypto.ts"),
      },
      {
        find: "node:async_hooks",
        replacement: path.resolve(
          __dirname,
          "src/lib/media/video/danmaku/danmu-api/shims/async-hooks.js",
        ),
      },
      {
        find: "redis",
        replacement: path.resolve(
          __dirname,
          "src/lib/media/video/danmaku/danmu-api/shims/redis.js",
        ),
      },
      {
        find: "node-fetch",
        replacement: path.resolve(
          __dirname,
          "src/lib/media/video/danmaku/danmu-api/shims/node-fetch.js",
        ),
      },
      {
        find: "process",
        replacement: path.resolve(
          __dirname,
          "src/lib/media/video/danmaku/danmu-api/shims/process.js",
        ),
      },
      {
        find: "node:process",
        replacement: path.resolve(
          __dirname,
          "src/lib/media/video/danmaku/danmu-api/shims/process.js",
        ),
      },
    ],
  },
  // 浏览器侧裸标识符 process（vendor 未 import 时）
  define: {
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV ?? "development",
    ),
  },
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
        protocol: "ws",
        host,
        port: 1421,
      }
      : undefined,
    watch: {
      // 3. 排除非前端源码路径，避免无关文件变更触发 HMR
      ignored: devWatchIgnored,
    },
  },
}));
