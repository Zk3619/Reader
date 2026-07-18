//! 桌面端便携路径布局：
//! - exe/AppData：settings.json、.window-state.json、数据库与业务缓存
//! - exe/EBWebView：WebView2 用户数据（由 data_directory=exe 根目录生成）
//! - exe/logs：运行日志

use std::path::{Path, PathBuf};

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri::AppHandle;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub const DATA_DIR_NAME: &str = "AppData";
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub const LOG_DIR_NAME: &str = "logs";
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub const WINDOW_STATE_FILE: &str = ".window-state.json";
/// WebView2 在 data_directory 下自动创建的子目录名
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub const WEBVIEW_PROFILE_DIR: &str = "EBWebView";
/// 旧版布局（迁移用）
#[cfg(not(any(target_os = "android", target_os = "ios")))]
const LEGACY_WEBVIEW_CACHE_DIR: &str = "WebViewCache";

/// exe 所在目录（绿色版根目录）
pub fn exe_dir() -> Result<PathBuf, String> {
    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    exe_path
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| "无法获取 exe 所在目录".to_string())
}

pub fn ensure_dir(path: &Path) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }
    std::fs::create_dir_all(path).map_err(|e| format!("创建目录失败 {}: {}", path.display(), e))
}

/// 默认业务数据根：exe/AppData
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn default_data_root() -> Result<PathBuf, String> {
    let dir = exe_dir()?.join(DATA_DIR_NAME);
    ensure_dir(&dir)?;
    Ok(dir)
}

/// 桌面端：settings.json 位于 exe/AppData/settings.json（旧 config.json 启动时迁移）
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn config_file_path() -> Result<PathBuf, String> {
    let path = default_data_root()?.join(super::CONFIG_FILE);
    let _ = crate::migrate_legacy_config_filename(&path);
    Ok(path)
}

/// 窗口状态：exe/AppData/.window-state.json
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn window_state_file_path() -> Result<PathBuf, String> {
    Ok(default_data_root()?.join(WINDOW_STATE_FILE))
}

/// 日志目录：exe/logs
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn log_directory() -> Result<PathBuf, String> {
    let dir = exe_dir()?.join(LOG_DIR_NAME);
    ensure_dir(&dir)?;
    Ok(dir)
}

/// 从 settings.json 解析 WebView user data 根目录（默认 exe 根，使 EBWebView 与 exe 同级）
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn effective_webview_data_root(config_path: &Path) -> Result<PathBuf, String> {
    let exe = exe_dir()?;
    let s = std::fs::read_to_string(config_path).unwrap_or_else(|_| "{}".to_string());
    let config: serde_json::Value =
        serde_json::from_str(&s).unwrap_or(serde_json::Value::Object(Default::default()));
    let custom = config
        .get("webviewDataDir")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let root = match custom {
        Some(dir) if Path::new(dir).is_absolute() => PathBuf::from(dir),
        Some(dir) => resolve_data_root_from_relative(dir, &exe)?,
        None => exe,
    };
    ensure_dir(&root)?;
    Ok(root)
}

/// WebView2 的 data_directory：直接使用根目录，运行时生成 `<root>/EBWebView/`
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn webview_data_directory(root: &Path, _label: &str) -> Result<PathBuf, String> {
    ensure_dir(root)?;
    Ok(root.to_path_buf())
}

/// WebView2 实际 profile 目录（统计与清理缓存用）
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn webview_profile_directory(root: &Path) -> PathBuf {
    root.join(WEBVIEW_PROFILE_DIR)
}

/// reader.json 仍在 exe 同目录，可选覆盖 dataDir
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn data_dir_from_reader_json(exe_dir: &Path) -> Option<String> {
    #[derive(serde::Deserialize)]
    struct ReaderJson {
        #[serde(rename = "dataDir")]
        data_dir: Option<String>,
    }

    let path = exe_dir.join(super::PORTABLE_MARKER_FILE);
    if !path.exists() {
        return None;
    }
    let s = std::fs::read_to_string(&path).ok()?;
    let config: ReaderJson = serde_json::from_str(&s).ok()?;
    config
        .data_dir
        .map(|d| d.trim().to_string())
        .filter(|d| !d.is_empty())
}

pub fn resolve_data_root_from_relative(
    data_dir: &str,
    base: &Path,
) -> Result<PathBuf, String> {
    let data_root = if std::path::Path::new(data_dir).is_absolute() {
        PathBuf::from(data_dir)
    } else {
        base.join(data_dir)
    };
    ensure_dir(&data_root)?;
    Ok(data_root)
}

/// 旧版便携目录 → 新布局（exe 根下的 config / window-state / WebViewCache 迁入正确位置）
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn run_legacy_layout_migrations() {
    if let Err(e) = migrate_config_to_app_data() {
        eprintln!("[portable] 迁移 settings.json: {e}");
    }
    if let Err(e) = migrate_window_state_to_app_data() {
        eprintln!("[portable] 迁移窗口状态: {e}");
    }
    if let Err(e) = migrate_webview_to_exe_ebwebview() {
        eprintln!("[portable] 迁移 WebView 目录: {e}");
    }
}

#[cfg(any(target_os = "android", target_os = "ios"))]
#[allow(dead_code)]
pub fn run_legacy_layout_migrations() {}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn migrate_config_to_app_data() -> Result<(), String> {
    let exe = exe_dir()?;
    // 旧布局：exe/settings.json 或 exe/config.json → AppData/settings.json
    let target = config_file_path()?;
    let legacy_settings = exe.join(super::CONFIG_FILE);
    let legacy_config = exe.join(super::LEGACY_SETTINGS_FILE);
    if !target.exists() {
        if legacy_settings.exists() {
            migrate_file_if_missing(&legacy_settings, &target)?;
        } else if legacy_config.exists() {
            migrate_file_if_missing(&legacy_config, &target)?;
        }
    }
    let _ = crate::migrate_legacy_config_filename(&target);
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn migrate_window_state_to_app_data() -> Result<(), String> {
    let exe = exe_dir()?;
    let legacy = exe.join(WINDOW_STATE_FILE);
    let target = window_state_file_path()?;
    migrate_file_if_missing(&legacy, &target)
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn migrate_webview_to_exe_ebwebview() -> Result<(), String> {
    let exe = exe_dir()?;
    let new_profile = exe.join(WEBVIEW_PROFILE_DIR);
    if new_profile.exists() {
        return Ok(());
    }

    // 旧版：exe/WebViewCache/<label>/EBWebView
    let legacy_cache = exe.join(LEGACY_WEBVIEW_CACHE_DIR);
    if legacy_cache.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&legacy_cache) {
            for entry in entries.flatten() {
                let candidate = entry.path().join(WEBVIEW_PROFILE_DIR);
                if candidate.is_dir() {
                    std::fs::rename(&candidate, &new_profile).map_err(|e| e.to_string())?;
                    eprintln!(
                        "[portable] WebView 已从 {} 迁至 {}",
                        candidate.display(),
                        new_profile.display()
                    );
                    return Ok(());
                }
            }
        }
    }

    // 极旧：exe/WebViewCache/<label> 即 profile 根
    if legacy_cache.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&legacy_cache) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    std::fs::rename(&path, &new_profile).map_err(|e| e.to_string())?;
                    eprintln!(
                        "[portable] WebView 已从 {} 迁至 {}",
                        path.display(),
                        new_profile.display()
                    );
                    return Ok(());
                }
            }
        }
    }

    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn migrate_file_if_missing(from: &Path, to: &Path) -> Result<(), String> {
    if !from.is_file() || to.exists() {
        return Ok(());
    }
    if let Some(parent) = to.parent() {
        ensure_dir(parent)?;
    }
    match std::fs::rename(from, to) {
        Ok(()) => {
            eprintln!(
                "[portable] 已迁移 {} -> {}",
                from.display(),
                to.display()
            );
            Ok(())
        }
        Err(_) => {
            std::fs::copy(from, to).map_err(|e| e.to_string())?;
            std::fs::remove_file(from).ok();
            eprintln!(
                "[portable] 已复制迁移 {} -> {}",
                from.display(),
                to.display()
            );
            Ok(())
        }
    }
}

/// Windows 上 `$EXE` 在 capability 中无法解析；启动时把 exe 目录（及可选 dataDir）加入 FS 作用域。
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn register_portable_fs_scope(app: &AppHandle, data_root: &Path) -> Result<(), String> {
    use tauri_plugin_fs::FsExt;

    let exe = exe_dir()?;
    app.fs_scope()
        .allow_directory(&exe, true)
        .map_err(|e| format!("FS 作用域：允许 exe 目录失败: {e}"))?;

    let app_data = default_data_root()?;
    if app_data != exe {
        app.fs_scope()
            .allow_directory(&app_data, true)
            .map_err(|e| format!("FS 作用域：允许 AppData 失败: {e}"))?;
    }

    if data_root != exe && data_root != app_data && !data_root.starts_with(&exe) {
        app.fs_scope()
            .allow_directory(data_root, true)
            .map_err(|e| format!("FS 作用域：允许目录 {} 失败: {e}", data_root.display()))?;
    }
    Ok(())
}

/// 额外放行目录（如自定义 webviewDataDir）
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn allow_fs_directory(app: &AppHandle, path: &Path) -> Result<(), String> {
    use tauri_plugin_fs::FsExt;
    let exe = exe_dir()?;
    if path.starts_with(&exe) {
        return Ok(());
    }
    app.fs_scope()
        .allow_directory(path, true)
        .map_err(|e| format!("FS 作用域：允许目录 {} 失败: {e}", path.display()))
}
