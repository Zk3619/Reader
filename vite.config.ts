import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { readerHttpProxy } from "./vite-plugins/reader-http-proxy";
import { legadoWebApiServer } from "./vite-plugins/legado-web-api-server";

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
    setupFiles: ['./src/test/vitest.setup.ts'],
    alias: {
      'path-browserify': pathStub,
      path: pathStub,
      '@lingo-reader/mobi-parser': mobiParserBrowser,
    },
  },
  plugins: [solid(), tailwindcss(), readerHttpProxy(), legadoWebApiServer()],
  // 开发时用默认 base；Tauri 打包后从本地协议加载，需相对路径
  base: process.env.NODE_ENV === "production" ? "./" : "",
  assetsInclude: ["**/*.wasm"],
  worker: {
    // 目录解析 Worker 会共享规则引擎分块，必须使用支持 code-splitting 的 ES 格式。
    format: "es" as const,
  },
  optimizeDeps: {
    exclude: ["quickjs-emscripten", "@jitl/quickjs-wasmfile-release-sync"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      src: path.resolve(__dirname, "src"),
      "~": path.resolve(__dirname, "src"),
      // 强制浏览器构建，避免 Node 入口拉 node:path
      "@lingo-reader/mobi-parser": mobiParserBrowser,
      // 浏览器占位，避免 sql.js / lingo-reader 引用 Node 内置模块时的 externalized 警告
      "fs": path.resolve(__dirname, "src/stubs/empty.ts"),
      "path": pathStub,
      "path-browserify": pathStub,
      "crypto": path.resolve(__dirname, "src/stubs/empty.ts")
    },
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
