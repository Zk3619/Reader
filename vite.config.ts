import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { readerHttpProxy } from "./vite-plugins/reader-http-proxy";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  test: {
    environment: 'node',
    include: ['src/test/**/*.test.ts'],
    setupFiles: ['./src/test/vitest.setup.ts'],
  },
  plugins: [solid(), tailwindcss(), readerHttpProxy()],
  // 开发时用默认 base；Tauri 打包后从本地协议加载，需相对路径
  base: process.env.NODE_ENV === "production" ? "./" : "",
  assetsInclude: ["**/*.wasm"],
  optimizeDeps: {
    exclude: ["quickjs-emscripten", "@jitl/quickjs-wasmfile-release-sync"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      src: path.resolve(__dirname, "src"),
      "~": path.resolve(__dirname, "src"),
      // 浏览器占位，避免 sql.js 引用 Node 内置模块时的 externalized 警告
      "fs": path.resolve(__dirname, "src/stubs/empty.ts"),
      "path": path.resolve(__dirname, "src/stubs/path.ts"),
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
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
