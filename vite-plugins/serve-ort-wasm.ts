/**
 * 将 onnxruntime-web 的 wasm/mjs 挂到 /ort/，避免 SPA fallback 返回 HTML
 *（magic 变成 3c 21 64 6f = "<!do"）。
 */
import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

const ORT_FILES = [
  "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm",
] as const;

function ortDistDir(root: string): string {
  return path.resolve(root, "node_modules/onnxruntime-web/dist");
}

function contentType(file: string): string {
  if (file.endsWith(".wasm")) return "application/wasm";
  if (file.endsWith(".mjs")) return "text/javascript";
  return "application/octet-stream";
}

export function serveOrtWasm(): Plugin {
  let root = process.cwd();
  return {
    name: "serve-ort-wasm",
    configResolved(cfg) {
      root = cfg.root;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith("/ort/")) {
          next();
          return;
        }
        const name = path.basename(url);
        if (!(ORT_FILES as readonly string[]).includes(name)) {
          res.statusCode = 404;
          res.end("ort asset not found");
          return;
        }
        const filePath = path.join(ortDistDir(root), name);
        if (!fs.existsSync(filePath)) {
          res.statusCode = 404;
          res.end("ort asset missing on disk");
          return;
        }
        res.setHeader("Content-Type", contentType(name));
        res.setHeader("Cache-Control", "no-cache");
        fs.createReadStream(filePath).pipe(res);
      });
    },
    closeBundle() {
      const outDir = path.resolve(root, "dist/ort");
      const srcDir = ortDistDir(root);
      fs.mkdirSync(outDir, { recursive: true });
      for (const name of ORT_FILES) {
        const from = path.join(srcDir, name);
        if (fs.existsSync(from)) {
          fs.copyFileSync(from, path.join(outDir, name));
        }
      }
    },
  };
}
