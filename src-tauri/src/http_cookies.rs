//! 将 tauri-plugin-http 的 `.cookies` 接入便携 dataDir
//!
//! 插件硬编码路径为 `app.path().app_cache_dir()/.cookies`（Windows 即
//! `%LOCALAPPDATA%/<bundle_id>/.cookies`），无公开配置项。
//! 启动时在系统路径与 `{dataDir}/.cookies` 之间建立符号链接（失败则回退为复制），
//! 退出时再兜底同步回 dataDir。

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use std::path::{Path, PathBuf};

pub const HTTP_COOKIES_FILENAME: &str = ".cookies";
/// 与 tauri.conf.json identifier 一致
pub const BUNDLE_IDENTIFIER: &str = "com.zkingz.reader";

/// 业务数据目录下的 plugin-http Cookie 仓（真源）
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn portable_http_cookies_path() -> Result<PathBuf, String> {
    let data_root = crate::effective_data_dir_at_startup()?;
    Ok(data_root.join(HTTP_COOKIES_FILENAME))
}

/// tauri-plugin-http 实际读写的系统路径
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn system_http_cookies_path() -> Result<PathBuf, String> {
    let cache_dir = system_app_cache_dir(BUNDLE_IDENTIFIER)?;
    Ok(cache_dir.join(HTTP_COOKIES_FILENAME))
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn system_app_cache_dir(identifier: &str) -> Result<PathBuf, String> {
    #[cfg(windows)]
    {
        let local = std::env::var("LOCALAPPDATA")
            .map_err(|e| format!("无法解析 LOCALAPPDATA: {e}"))?;
        return Ok(PathBuf::from(local).join(identifier));
    }
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").map_err(|e| format!("无法解析 HOME: {e}"))?;
        return Ok(PathBuf::from(home)
            .join("Library/Caches")
            .join(identifier));
    }
    #[cfg(target_os = "linux")]
    {
        let home = std::env::var("HOME").map_err(|e| format!("无法解析 HOME: {e}"))?;
        let cache = std::env::var("XDG_CACHE_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from(&home).join(".cache"));
        return Ok(cache.join(identifier));
    }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn is_symlink(path: &Path) -> bool {
    std::fs::symlink_metadata(path)
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false)
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn symlink_points_to(link: &Path, target: &Path) -> bool {
    if !is_symlink(link) {
        return false;
    }
    std::fs::read_link(link)
        .ok()
        .and_then(|p| {
            if p.is_absolute() {
                Some(p == target)
            } else {
                link.parent().map(|parent| parent.join(&p) == target)
            }
        })
        .unwrap_or(false)
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn ensure_parent(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn touch_cookie_file(path: &Path) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }
    std::fs::File::create(path).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn try_symlink(target: &Path, link: &Path) -> bool {
    #[cfg(windows)]
    {
        std::os::windows::fs::symlink_file(target, link).is_ok()
    }
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(target, link).is_ok()
    }
    #[cfg(not(any(windows, unix)))]
    {
        let _ = (target, link);
        false
    }
}

/// 在 tauri-plugin-http 初始化之前调用
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn preflight_install_http_cookies_bridge() {
    match install_http_cookies_bridge() {
        Ok(mode) => eprintln!("[http-cookies] 已接入 dataDir（{mode}）"),
        Err(e) => eprintln!("[http-cookies] 接入 dataDir 失败，将使用系统目录: {e}"),
    }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn install_http_cookies_bridge() -> Result<&'static str, String> {
    let portable = portable_http_cookies_path()?;
    let system = system_http_cookies_path()?;

    ensure_parent(&portable)?;
    ensure_parent(&system)?;

    // 旧版：仅系统目录有 cookie → 迁入 dataDir
    if !portable.exists() && system.exists() && !is_symlink(&system) {
        std::fs::copy(&system, &portable).map_err(|e| e.to_string())?;
        eprintln!(
            "[http-cookies] 已从系统目录迁入 dataDir: {}",
            portable.display()
        );
    }

    touch_cookie_file(&portable)?;

    if symlink_points_to(&system, &portable) {
        return Ok("symlink");
    }

    if system.exists() {
        if is_symlink(&system) {
            std::fs::remove_file(&system).map_err(|e| e.to_string())?;
        } else if portable.metadata().map(|m| m.len()).unwrap_or(0) == 0 {
            let sys_len = system.metadata().map(|m| m.len()).unwrap_or(0);
            if sys_len > 0 {
                std::fs::copy(&system, &portable).map_err(|e| e.to_string())?;
            }
            std::fs::remove_file(&system).map_err(|e| e.to_string())?;
        } else {
            std::fs::remove_file(&system).map_err(|e| e.to_string())?;
        }
    }

    if try_symlink(&portable, &system) {
        return Ok("symlink");
    }

    std::fs::copy(&portable, &system).map_err(|e| e.to_string())?;
    Ok("copy")
}

/// 退出时兜底：非符号链接模式下将系统文件同步回 dataDir
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn finalize_http_cookies_to_portable() {
    let Ok(portable) = portable_http_cookies_path() else {
        return;
    };
    let Ok(system) = system_http_cookies_path() else {
        return;
    };
    if symlink_points_to(&system, &portable) {
        return;
    }
    if system.exists() && !is_symlink(&system) {
        if let Err(e) = std::fs::copy(&system, &portable) {
            eprintln!("[http-cookies] 退出同步失败: {e}");
        }
    }
}

#[cfg(any(target_os = "android", target_os = "ios"))]
pub fn preflight_install_http_cookies_bridge() {}

#[cfg(any(target_os = "android", target_os = "ios"))]
pub fn finalize_http_cookies_to_portable() {}
