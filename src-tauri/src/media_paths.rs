//! 与前端 MediaRoot 对齐的路径解析（读取 settings.json 中的 app_settings）

use std::path::{Path, PathBuf};

#[cfg(not(target_os = "android"))]
fn read_config_value(config_path: &Path) -> serde_json::Value {
    let s = std::fs::read_to_string(config_path).unwrap_or_else(|_| "{}".to_string());
    serde_json::from_str(&s).unwrap_or(serde_json::Value::Object(Default::default()))
}

#[cfg(not(target_os = "android"))]
fn app_settings(config: &serde_json::Value) -> &serde_json::Value {
    config
        .get("app_settings")
        .unwrap_or(&serde_json::Value::Null)
}

#[cfg(not(target_os = "android"))]
fn resolve_global_media_root(app: &serde_json::Value, data_root: &Path) -> PathBuf {
    if let Some(dir) = app
        .get("mediaRootDirectory")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        return PathBuf::from(dir);
    }
    data_root.join("Media")
}

#[cfg(not(target_os = "android"))]
fn module_subdir(module: &str) -> &str {
    match module {
        "reading" => "Reader",
        "music" => "Audio",
        "video" => "Video",
        _ => module,
    }
}

#[cfg(not(target_os = "android"))]
fn legacy_module_subdir(module: &str) -> &str {
    match module {
        "reading" => "reading",
        "music" => "music",
        "video" => "video",
        _ => module,
    }
}

#[cfg(not(target_os = "android"))]
pub fn resolve_module_media_root(
    app: &serde_json::Value,
    data_root: &Path,
    module: &str,
) -> PathBuf {
    let (use_global_key, custom_key) = match module {
        "reading" => ("readingUseGlobalMediaRoot", "readingMediaRootDirectory"),
        "music" => ("musicUseGlobalMediaRoot", "musicMediaRootDirectory"),
        "video" => ("videoUseGlobalMediaRoot", "videoMediaRootDirectory"),
        _ => return resolve_global_media_root(app, data_root).join(module_subdir(module)),
    };
    let use_global = app
        .get(use_global_key)
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    if !use_global {
        if let Some(custom) = app
            .get(custom_key)
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            return PathBuf::from(custom);
        }
    }
    resolve_global_media_root(app, data_root).join(module_subdir(module))
}

#[cfg(not(target_os = "android"))]
pub fn resolve_video_cache_dir() -> Result<PathBuf, String> {
    let config_path = crate::portable_paths::config_file_path()?;
    let default_base = crate::portable_paths::default_data_root()?;
    let data_root = crate::effective_data_dir_from_config(&config_path, &default_base)?;
    let config = read_config_value(&config_path);
    let app = app_settings(&config);
    let video_root = resolve_module_media_root(app, &data_root, "video");
    let dir = video_root.join("Cache");
    crate::portable_paths::ensure_dir(&dir)?;
    migrate_legacy_tv_jar_cache(&dir, &data_root, &video_root);
    Ok(dir)
}

/// 旧版 tv-jar-cache → MediaRoot/Video/Cache
#[cfg(not(target_os = "android"))]
fn migrate_legacy_tv_jar_cache(target: &Path, data_root: &Path, video_root: &Path) {
    let legacy_names = ["tv-jar-cache"];
    let legacy_roots = [
        data_root.join("tv-jar-cache"),
        video_root.join("tv-jar-cache"),
        video_root.join(legacy_module_subdir("video")).join("tv-jar-cache"),
    ];
    if target_empty_or_missing(target) {
        for legacy in legacy_roots {
            if legacy.is_dir() {
                copy_tree_into(&legacy, target);
            }
        }
    }
    for name in legacy_names {
        let legacy_home = std::env::var_os("USERPROFILE")
            .or_else(|| std::env::var_os("HOME"))
            .map(|home| {
                PathBuf::from(home)
                    .join(".reader")
                    .join(name)
            });
        if let Some(legacy) = legacy_home.filter(|p| p.is_dir()) {
            copy_tree_into(&legacy, target);
        }
    }
}

#[cfg(not(target_os = "android"))]
fn target_empty_or_missing(target: &Path) -> bool {
    !target.exists()
        || std::fs::read_dir(target)
            .map(|mut rd| rd.next().is_none())
            .unwrap_or(true)
}

#[cfg(not(target_os = "android"))]
fn copy_tree_into(source: &Path, target: &Path) {
    if let (Ok(a), Ok(b)) = (source.canonicalize(), target.canonicalize()) {
        if a == b {
            return;
        }
    }
    let Ok(entries) = std::fs::read_dir(source) else {
        return;
    };
    let _ = crate::portable_paths::ensure_dir(target);
    for entry in entries.flatten() {
        let from = entry.path();
        let to = target.join(entry.file_name());
        if to.exists() {
            continue;
        }
        if from.is_dir() {
            copy_tree_into(&from, &to);
        } else if std::fs::copy(&from, &to).is_ok() {
            let _ = std::fs::remove_file(&from);
        }
    }
}
