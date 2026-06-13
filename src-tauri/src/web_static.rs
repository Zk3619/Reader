//! Web 服务 UI 静态资源（web-service-dist）

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use tauri::{AppHandle, Manager};

static WEB_UI_ROOT: OnceLock<PathBuf> = OnceLock::new();

pub fn init_web_ui_root(app: &AppHandle) {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(res) = app.path().resource_dir() {
        candidates.push(res.join("web-service-dist"));
        candidates.push(res.clone());
    }
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../web-service-dist"),
    );
    for root in candidates {
        if root.join("index.html").is_file() {
            let _ = WEB_UI_ROOT.set(root);
            return;
        }
    }
}

pub fn web_ui_root() -> PathBuf {
    WEB_UI_ROOT
        .get()
        .cloned()
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../web-service-dist"))
}

pub fn mime_for_extension(ext: &str) -> &'static str {
    match ext {
        "html" | "htm" => "text/html; charset=utf-8",
        "js" | "mjs" => "application/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "md" => "text/markdown; charset=utf-8",
        "txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

fn mime_for_path(path: &Path) -> &'static str {
    mime_for_extension(
        path.extension()
            .and_then(|e| e.to_str())
            .unwrap_or(""),
    )
}

/// 解析静态文件路径；第二项表示是否为 SPA fallback（index.html）
pub fn resolve_static_file(request_path: &str) -> Option<(PathBuf, &'static str)> {
    let path_only = request_path.split('?').next().unwrap_or(request_path);
    let mut rel = path_only.trim_start_matches('/');
    if rel.is_empty() || rel.ends_with('/') {
        rel = "index.html";
    }
    if rel.contains("..") {
        return None;
    }

    let root = web_ui_root();
    let file = root.join(rel);
    if file.is_file() {
        let mime = mime_for_path(&file);
        return Some((file, mime));
    }

    // SPA：无扩展名的 GET 回退 index.html
    if !rel.contains('.') {
        let index = root.join("index.html");
        if index.is_file() {
            return Some((index, "text/html; charset=utf-8"));
        }
    }

    None
}
