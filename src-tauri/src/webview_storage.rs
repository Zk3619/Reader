//! WebView2 数据目录管理与精细化清理（缓存目录 / Cookie）

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use std::path::{Path, PathBuf};

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri::{AppHandle, Manager, Runtime};

#[cfg(not(any(target_os = "android", target_os = "ios")))]
const CACHE_DIR_NAMES: &[&str] = &[
    "Cache",
    "Code Cache",
    "GPUCache",
    "DawnWebGPUCache",
    "DawnGraphiteCache",
    "blob_storage",
    "Service Worker",
];

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn config_path(_app: &AppHandle) -> Result<PathBuf, String> {
    crate::portable_paths::config_file_path()
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn webview_root(app: &AppHandle) -> Result<PathBuf, String> {
    let path = config_path(app)?;
    crate::ensure_config_exists(&path)?;
    crate::portable_paths::effective_webview_data_root(&path)
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn dir_size(path: &Path) -> u64 {
    if !path.exists() {
        return 0;
    }
    let mut total = 0u64;
    let Ok(entries) = std::fs::read_dir(path) else {
        return 0;
    };
    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_dir() {
            total += dir_size(&p);
        } else if let Ok(meta) = entry.metadata() {
            total += meta.len();
        }
    }
    total
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn remove_cache_dirs_under(root: &Path, depth: usize) -> usize {
    if depth > 8 || !root.is_dir() {
        return 0;
    }
    let mut removed = 0usize;
    let Ok(entries) = std::fs::read_dir(root) else {
        return 0;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if CACHE_DIR_NAMES.iter().any(|n| *n == name_str.as_ref()) {
            if std::fs::remove_dir_all(&path).is_ok() {
                removed += 1;
            }
        } else {
            removed += remove_cache_dirs_under(&path, depth + 1);
        }
    }
    removed
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn clear_cookies_on_webview<R: Runtime>(webview: &tauri::Webview<R>) -> Result<usize, String> {
    let cookies = webview.cookies().map_err(|e| e.to_string())?;
    let mut count = 0usize;
    for cookie in cookies {
        if webview.delete_cookie(cookie).is_ok() {
            count += 1;
        }
    }
    Ok(count)
}

/// WebView user data 根目录（config.webviewDataDir 或默认 exe 根，实际 profile 为 exe/EBWebView）
#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
pub fn get_webview_data_root(app: tauri::AppHandle) -> Result<String, String> {
    let root = webview_root(&app)?;
    Ok(crate::portable_paths::webview_profile_directory(&root)
        .to_string_lossy()
        .into_owned())
}

/// 日志目录（exe/logs）
#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
pub fn get_log_directory() -> Result<String, String> {
    Ok(crate::portable_paths::log_directory()?.to_string_lossy().into_owned())
}

/// WebView 数据目录占用（字节）
#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
pub fn get_webview_storage_stats(app: tauri::AppHandle) -> Result<u64, String> {
    let root = webview_root(&app)?;
    let profile = crate::portable_paths::webview_profile_directory(&root);
    Ok(dir_size(if profile.is_dir() { &profile } else { &root }))
}

/// 删除 WebView2 缓存目录（保留 Cookie / LocalStorage）
#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
pub fn clear_webview_disk_cache(app: tauri::AppHandle) -> Result<usize, String> {
    let root = webview_root(&app)?;
    let profile = crate::portable_paths::webview_profile_directory(&root);
    let target = if profile.is_dir() { profile } else { root };
    Ok(remove_cache_dirs_under(&target, 0))
}

/// 清除所有 WebView 的 Cookie（不影响业务 SQLite / config.json）
#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
pub fn clear_webview_cookies(app: tauri::AppHandle) -> Result<usize, String> {
    let mut total = 0usize;
    let mut seen = std::collections::HashSet::new();
    for (label, webview) in app.webviews() {
        if seen.insert(label.to_string()) {
            total += clear_cookies_on_webview(&webview)?;
        }
    }
    Ok(total)
}

/// 清除主窗口全部浏览数据（缓存 + Cookie + LocalStorage 等）
#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
pub fn clear_main_webview_all_browsing_data(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "主窗口不存在".to_string())?;
    window
        .clear_all_browsing_data()
        .map_err(|e| e.to_string())
}
