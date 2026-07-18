//! 数据目录迁移：事务性复制、进度事件、空间预检、失败回退

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use std::path::{Path, PathBuf};
#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri::Manager;

const DB_FILE: &str = "reader.db";
const LEGACY_DB_ALIASES: &[&str] = &["reader.db", "legado.db"];
const DATA_DIR_MIGRATION_SOURCE_KEY: &str = "dataDirMigrationSource";
const DATA_DIR_MIGRATION_BACKUP_KEY: &str = "dataDirMigrationBackup";
const WEBVIEW_DIR_MIGRATION_SOURCE_KEY: &str = "webviewDataDirMigrationSource";
const USER_DATA_DIRS: &[&str] = &["cover-cache", "book-cache"];
const USER_DATA_FILES: &[&str] = &[".cookies"];
const MIGRATION_COMPLETE_MARKER: &str = ".migration_complete_v1";
const PROGRESS_EVENT: &str = "data-migration-progress";
const COMPLETE_EVENT: &str = "data-migration-complete";
const ERROR_EVENT: &str = "data-migration-error";
const FALLBACK_EVENT: &str = "data-dir-fallback";
/// 旧库至少达到此大小才认为值得迁移
const MIN_LEGACY_DB_BYTES: u64 = 32 * 1024;
/// 磁盘预留：需要源数据大小的 110%
const DISK_HEADROOM_NUM: u64 = 11;
const DISK_HEADROOM_DEN: u64 = 10;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataMigrationResult {
    pub migrated: bool,
    pub message: String,
    pub copied: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationProgress {
    pub phase: String,
    pub copied_bytes: u64,
    pub total_bytes: u64,
    pub current_file: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationPrecheck {
    pub source_bytes: u64,
    pub target_free_bytes: Option<u64>,
    pub can_proceed: bool,
    pub message: String,
}

pub(crate) fn migrate_legacy_data_if_needed(app: &AppHandle) -> Result<DataMigrationResult, String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = app;
        return Ok(DataMigrationResult {
            migrated: false,
            message: "移动端不执行桌面数据迁移".into(),
            copied: vec![],
        });
    }

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        migrate_desktop_legacy_only(app)
    }
}

/// 启动时：校验数据目录，必要时回退到默认路径
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub(crate) fn validate_and_fallback_data_dir(app: &AppHandle) -> Result<(), String> {
    let config_path = crate::portable_paths::config_file_path()?;
    crate::ensure_config_exists(&config_path)?;

    if pending_relocation(&config_path)? {
        return Ok(());
    }

    let default_base = crate::default_app_data_base(app)?;
    let target_root = crate::effective_data_dir_from_config(&config_path, &default_base)?;

    if is_data_dir_usable(&target_root) {
        return Ok(());
    }

    let config = read_config_json(&config_path)?;
    let configured = config
        .get("dataDir")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());

    let Some(_) = configured else {
        return Ok(());
    };

    let mut config = read_config_json(&config_path)?;
    if let Some(obj) = config.as_object_mut() {
        obj.remove("dataDir");
        obj.remove(DATA_DIR_MIGRATION_SOURCE_KEY);
    }
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(&config_path, json.as_bytes()).map_err(|e| e.to_string())?;

    let msg = format!(
        "配置的数据目录 {} 不可用或为空，已自动切换回默认目录 {}",
        target_root.display(),
        default_base.display()
    );
    eprintln!("[data-migration] {msg}");
    let _ = app.emit(FALLBACK_EVENT, &msg);
    Ok(())
}

/// 是否存在待执行的 dataDir 搬迁（用户在设置中改了目录）
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub(crate) fn has_pending_relocation(_app: &AppHandle) -> Result<bool, String> {
    let config_path = crate::portable_paths::config_file_path()?;
    crate::ensure_config_exists(&config_path)?;
    clear_stale_webview_migration_marker(&config_path)?;
    Ok(pending_relocation(&config_path)?)
}

/// 异步执行搬迁迁移（由 setup 在迁移 Splash 窗口创建后 spawn）
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub(crate) fn spawn_relocation_migration(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        match perform_safe_relocation(&app) {
            Ok(result) => {
                let _ = app.emit(COMPLETE_EVENT, &result);
                if let Err(e) = crate::create_main_window_if_missing(&app) {
                    let _ = app.emit(ERROR_EVENT, format!("迁移完成但无法打开主窗口: {e}"));
                    return;
                }
                run_post_main_startup(&app);
                if let Some(splash) = app.get_webview_window("migration_splash") {
                    let _ = splash.close();
                }
                if let Some(main) = app.get_webview_window("main") {
                    let _ = main.show();
                    let _ = main.set_focus();
                }
            }
            Err(e) => {
                let _ = app.emit(ERROR_EVENT, e);
            }
        }
    });
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn run_post_main_startup(app: &AppHandle) {
    if let Ok(config_path) = crate::portable_paths::config_file_path() {
        if let Ok(default_base) = crate::default_app_data_base(app) {
            if let Ok(data_root) =
                crate::effective_data_dir_from_config(&config_path, &default_base)
            {
                let _ = crate::portable_paths::register_portable_fs_scope(app, &data_root);
                let _ = crate::portable_paths::allow_fs_directory(app, &data_root);
            }
            if let Ok(web_root) = crate::portable_paths::effective_webview_data_root(&config_path)
            {
                let _ = crate::portable_paths::allow_fs_directory(app, &web_root);
            }
        }
        if let Ok(log_dir) = crate::portable_paths::log_directory() {
            let _ = crate::portable_paths::allow_fs_directory(app, &log_dir);
        }
    }
    match migrate_legacy_data_if_needed(app) {
        Ok(result) if result.migrated || !result.copied.is_empty() => {
            eprintln!("[data-migration] {}", result.message);
            let _ = app.emit("reader-data-migrated", &result);
        }
        Ok(_) => {}
        Err(e) => eprintln!("[data-migration] 旧版目录迁移失败: {e}"),
    }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub(crate) fn run_startup_migration(app: &AppHandle) {
    match migrate_legacy_data_if_needed(app) {
        Ok(result) if result.migrated || !result.copied.is_empty() => {
            eprintln!("[data-migration] {}", result.message);
            for item in &result.copied {
                eprintln!("[data-migration] copied: {item}");
            }
            let _ = app.emit("reader-data-migrated", &result);
        }
        Ok(_) => {}
        Err(e) => eprintln!("[data-migration] 失败: {e}"),
    }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn perform_safe_relocation(app: &AppHandle) -> Result<DataMigrationResult, String> {
    let config_path = crate::portable_paths::config_file_path()?;
    let config = read_config_json(&config_path)?;
    let Some(source_str) = config
        .get(DATA_DIR_MIGRATION_SOURCE_KEY)
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
    else {
        return Ok(DataMigrationResult {
            migrated: false,
            message: "无待迁移任务".into(),
            copied: vec![],
        });
    };

    let default_base = crate::default_app_data_base(app)?;
    let target_root = crate::effective_data_dir_from_config(&config_path, &default_base)?;
    let source_root = PathBuf::from(source_str);

    if paths_equal(&source_root, &target_root) {
        clear_config_key(&config_path, DATA_DIR_MIGRATION_SOURCE_KEY)?;
        return Ok(DataMigrationResult {
            migrated: false,
            message: String::new(),
            copied: vec![],
        });
    }

    if !source_root.exists() {
        clear_config_key(&config_path, DATA_DIR_MIGRATION_SOURCE_KEY)?;
        return Err(format!("原数据目录已不存在: {}", source_root.display()));
    }

    let marker = target_root.join(MIGRATION_COMPLETE_MARKER);
    if marker.exists() && is_data_dir_usable(&target_root) {
        finalize_relocation_config(&config_path, &source_root)?;
        let _ = crate::portable_paths::allow_fs_directory(app, &target_root);
        return Ok(DataMigrationResult {
            migrated: true,
            message: format!("数据目录已就绪: {}", target_root.display()),
            copied: vec![],
        });
    }

    let total_bytes = dir_size_bytes(&source_root)?;
    let precheck = build_precheck(&source_root, &target_root, total_bytes)?;
    if !precheck.can_proceed {
        return Err(precheck.message);
    }

    emit_progress(app, 0, total_bytes, "准备迁移", None);

    let mut copied = Vec::new();
    let copied_counter = AtomicU64::new(0);
    let last_emit = std::sync::Mutex::new(Instant::now());

    std::fs::create_dir_all(&target_root).map_err(|e| e.to_string())?;

    if let Some(src_db) = find_source_db(&source_root) {
        let dst_db = target_root.join(DB_FILE);
        emit_progress(app, copied_counter.load(Ordering::Relaxed), total_bytes, "复制数据库", Some(DB_FILE.into()));
        copy_sqlite_bundle(&src_db, &dst_db)?;
        let db_size = file_size(&src_db)
            + file_size(&PathBuf::from(format!("{}-wal", src_db.display())))
            + file_size(&PathBuf::from(format!("{}-shm", src_db.display())));
        copied_counter.fetch_add(db_size, Ordering::Relaxed);
        copied.push(format!("{} -> {}", src_db.display(), dst_db.display()));
        maybe_emit_progress(
            app,
            &copied_counter,
            &last_emit,
            total_bytes,
            "复制数据库",
            Some(DB_FILE),
        );
    }

    for name in USER_DATA_DIRS {
        let src = source_root.join(name);
        if !src.is_dir() {
            continue;
        }
        let dst = target_root.join(name);
        if dst.exists() {
            std::fs::remove_dir_all(&dst).ok();
        }
        copy_dir_with_progress(
            app,
            &src,
            &dst,
            total_bytes,
            &copied_counter,
            &last_emit,
            name,
        )?;
        copied.push(format!("{name}/"));
    }

    for name in USER_DATA_FILES {
        let src = source_root.join(name);
        let dst = target_root.join(name);
        if src.is_file() {
            std::fs::copy(&src, &dst).map_err(|e| e.to_string())?;
            copied.push(name.to_string());
        }
    }

    std::fs::write(&marker, b"ok").map_err(|e| format!("写入迁移完成标记失败: {e}"))?;
    finalize_relocation_config(&config_path, &source_root)?;
    let _ = crate::portable_paths::allow_fs_directory(app, &target_root);

    emit_progress(app, total_bytes, total_bytes, "完成", None);

    Ok(DataMigrationResult {
        migrated: true,
        message: format!(
            "程序数据已从 {} 安全迁移至 {}；原目录已保留为备份",
            source_root.display(),
            target_root.display()
        ),
        copied,
    })
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn finalize_relocation_config(config_path: &Path, source_root: &Path) -> Result<(), String> {
    let mut config = read_config_json(config_path)?;
    if let Some(obj) = config.as_object_mut() {
        obj.insert(
            DATA_DIR_MIGRATION_BACKUP_KEY.to_string(),
            serde_json::Value::String(source_root.display().to_string()),
        );
        obj.remove(DATA_DIR_MIGRATION_SOURCE_KEY);
    }
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(config_path, json.as_bytes()).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn pending_relocation(config_path: &Path) -> Result<bool, String> {
    let config = read_config_json(config_path)?;
    Ok(config
        .get(DATA_DIR_MIGRATION_SOURCE_KEY)
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .is_some())
}

/// WebView 缓存不迁移，仅清除待迁移标记
#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn clear_stale_webview_migration_marker(config_path: &Path) -> Result<(), String> {
    let config = read_config_json(config_path)?;
    if config.get(WEBVIEW_DIR_MIGRATION_SOURCE_KEY).is_none() {
        return Ok(());
    }
    clear_config_key(config_path, WEBVIEW_DIR_MIGRATION_SOURCE_KEY)?;
    eprintln!("[data-migration] WebView 目录变更不迁移缓存，重启后将重新生成");
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn is_data_dir_usable(path: &Path) -> bool {
    path.join(MIGRATION_COMPLETE_MARKER).exists()
        || find_source_db(path).is_some()
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn migrate_desktop_legacy_only(app: &AppHandle) -> Result<DataMigrationResult, String> {
    let legacy_root = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法解析系统数据目录: {e}"))?;
    let config_path = crate::portable_paths::config_file_path()?;
    crate::ensure_config_exists(&config_path)?;

    let mut copied = Vec::new();
    let mut migrated = false;

    if normalize_config_data_dir(&config_path, &legacy_root)? {
        copied.push("settings.json:dataDir 已规范化".into());
    }

    let default_base = crate::default_app_data_base(app)?;
    let target_root = crate::effective_data_dir_from_config(&config_path, &default_base)?;

    if paths_equal(&legacy_root, &target_root) {
        return Ok(DataMigrationResult {
            migrated: false,
            message: "数据目录已与系统默认目录相同，无需迁移".into(),
            copied,
        });
    }

    let target_db = target_root.join(DB_FILE);
    let exe_dir = crate::portable_paths::exe_dir()?;

    let legacy_db = find_source_db(&legacy_root);
    let exe_db = find_source_db(&exe_dir);

    let src_db = if let Some(ref leg) = legacy_db {
        if should_replace_target_db(&target_db, leg) {
            Some(leg.clone())
        } else {
            None
        }
    } else {
        None
    };

    let src_db = src_db.or_else(|| {
        exe_db.as_ref().and_then(|exe| {
            if should_replace_target_db(&target_db, exe) {
                Some(exe.clone())
            } else {
                None
            }
        })
    });

    if let Some(src_db) = src_db {
        copy_sqlite_bundle(&src_db, &target_db)?;
        copied.push(format!("{} -> {}", src_db.display(), target_db.display()));
        migrated = true;
    } else if legacy_db.is_some() || exe_db.is_some() {
        return Ok(DataMigrationResult {
            migrated: false,
            message: format!(
                "便携目录已有较完整的数据（{}），未覆盖旧目录数据",
                target_db.display()
            ),
            copied,
        });
    }

    if migrated {
        for name in USER_DATA_DIRS {
            let src = legacy_root.join(name);
            let dst = target_root.join(name);
            if copy_tree_if_absent_or_empty(&src, &dst)? {
                copied.push(format!("{name}/"));
            }
        }
        for name in USER_DATA_FILES {
            let src = legacy_root.join(name);
            let dst = target_root.join(name);
            if copy_file_if_absent_or_empty(&src, &dst)? {
                copied.push(name.to_string());
            }
        }
        if merge_config_from_legacy(&config_path, &legacy_root.join("settings.json"))?
            || merge_config_from_legacy(&config_path, &legacy_root.join("config.json"))?
        {
            copied.push("settings.json（自旧目录合并）".into());
        }
    }

    let message = if migrated {
        format!(
            "已从 {} 迁移数据到 {}",
            legacy_root.display(),
            target_root.display()
        )
    } else if !copied.is_empty() {
        "已修正配置，但未发现可迁移的数据库文件".into()
    } else {
        format!(
            "便携目录无数据，旧目录 {} 中也未找到可用 {}",
            legacy_root.display(),
            DB_FILE
        )
    };

    Ok(DataMigrationResult {
        migrated,
        message,
        copied,
    })
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn build_precheck(_source: &Path, target: &Path, source_bytes: u64) -> Result<MigrationPrecheck, String> {
    let required = source_bytes
        .saturating_mul(DISK_HEADROOM_NUM)
        .saturating_div(DISK_HEADROOM_DEN);
    let target_free = disk_free_bytes(target);
    let can_proceed = match target_free {
        Some(free) => free >= required,
        None => true,
    };
    let message = match target_free {
        Some(free) if free < required => format!(
            "目标磁盘剩余 {}，需要至少 {} 才能完成迁移",
            format_bytes(free),
            format_bytes(required)
        ),
        Some(free) => format!(
            "约 {} 数据将迁移，目标磁盘剩余 {}",
            format_bytes(source_bytes),
            format_bytes(free)
        ),
        None => format!("约 {} 数据将迁移", format_bytes(source_bytes)),
    };
    Ok(MigrationPrecheck {
        source_bytes,
        target_free_bytes: target_free,
        can_proceed,
        message,
    })
}

fn format_bytes(n: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;
    if n >= GB {
        format!("{:.1} GB", n as f64 / GB as f64)
    } else if n >= MB {
        format!("{:.1} MB", n as f64 / MB as f64)
    } else if n >= KB {
        format!("{:.1} KB", n as f64 / KB as f64)
    } else {
        format!("{n} B")
    }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn dir_size_bytes(path: &Path) -> Result<u64, String> {
    if !path.exists() {
        return Ok(0);
    }
    let mut total = 0u64;
    if path.is_file() {
        return Ok(file_size(path));
    }
    for entry in walkdir_entries(path)? {
        if entry.file_type().map_err(|e| e.to_string())?.is_file() {
            total = total.saturating_add(file_size(&entry.path()));
        }
    }
    Ok(total)
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn walkdir_entries(path: &Path) -> Result<Vec<std::fs::DirEntry>, String> {
    let mut out = Vec::new();
    let mut stack = vec![path.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            if entry.file_type().map_err(|e| e.to_string())?.is_dir() {
                stack.push(entry.path());
            }
            out.push(entry);
        }
    }
    Ok(out)
}

#[cfg(windows)]
fn disk_free_bytes(path: &Path) -> Option<u64> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

    let root = if path.is_dir() {
        path.to_path_buf()
    } else {
        path.parent()?.to_path_buf()
    };
    let mut wide: Vec<u16> = root.as_os_str().encode_wide().chain(Some(0)).collect();
    let mut free_bytes = 0u64;
    let mut _total = 0u64;
    let mut _avail = 0u64;
    unsafe {
        GetDiskFreeSpaceExW(
            PCWSTR(wide.as_mut_ptr()),
            Some(&mut free_bytes),
            Some(&mut _total),
            Some(&mut _avail),
        )
        .ok()?;
    }
    Some(free_bytes)
}

#[cfg(all(not(windows), not(any(target_os = "android", target_os = "ios"))))]
fn disk_free_bytes(_path: &Path) -> Option<u64> {
    None
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn copy_dir_with_progress(
    app: &AppHandle,
    src: &Path,
    dst: &Path,
    total_bytes: u64,
    copied_counter: &AtomicU64,
    last_emit: &std::sync::Mutex<Instant>,
    phase_label: &str,
) -> Result<(), String> {
    std::fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name();
        let src_path = entry.path();
        let dst_path = dst.join(&name);
        if entry.file_type().map_err(|e| e.to_string())?.is_dir() {
            copy_dir_with_progress(
                app,
                &src_path,
                &dst_path,
                total_bytes,
                copied_counter,
                last_emit,
                phase_label,
            )?;
        } else {
            std::fs::copy(&src_path, &dst_path).map_err(|e| e.to_string())?;
            copied_counter.fetch_add(file_size(&src_path), Ordering::Relaxed);
            maybe_emit_progress(
                app,
                copied_counter,
                last_emit,
                total_bytes,
                phase_label,
                Some(name.to_string_lossy().as_ref()),
            );
        }
    }
    Ok(())
}

fn emit_progress(
    app: &AppHandle,
    copied: u64,
    total: u64,
    phase: &str,
    current_file: Option<String>,
) {
    let _ = app.emit(
        PROGRESS_EVENT,
        MigrationProgress {
            phase: phase.into(),
            copied_bytes: copied,
            total_bytes: total,
            current_file,
        },
    );
}

fn maybe_emit_progress(
    app: &AppHandle,
    counter: &AtomicU64,
    last_emit: &std::sync::Mutex<Instant>,
    total: u64,
    phase: &str,
    file: Option<&str>,
) {
    let mut guard = last_emit.lock().unwrap();
    if guard.elapsed() < Duration::from_millis(120) {
        return;
    }
    *guard = Instant::now();
    emit_progress(
        app,
        counter.load(Ordering::Relaxed),
        total,
        phase,
        file.map(|s| s.to_string()),
    );
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn read_config_json(config_path: &Path) -> Result<serde_json::Value, String> {
    let s = std::fs::read_to_string(config_path).unwrap_or_else(|_| "{}".into());
    serde_json::from_str(&s).map_err(|e| format!("解析 settings.json 失败: {e}"))
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn clear_config_key(config_path: &Path, key: &str) -> Result<(), String> {
    let mut config = read_config_json(config_path)?;
    if let Some(obj) = config.as_object_mut() {
        obj.remove(key);
    }
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(config_path, json.as_bytes()).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn normalize_config_data_dir(config_path: &Path, legacy_root: &Path) -> Result<bool, String> {
    let s = std::fs::read_to_string(config_path).unwrap_or_else(|_| "{}".into());
    let mut config: serde_json::Value =
        serde_json::from_str(&s).unwrap_or(serde_json::Value::Object(Default::default()));
    let Some(data_dir) = config
        .get("dataDir")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|d| !d.is_empty())
    else {
        return Ok(false);
    };

    let configured = PathBuf::from(data_dir);
    let points_to_legacy = paths_equal(&configured, legacy_root)
        || legacy_root
            .canonicalize()
            .ok()
            .zip(configured.canonicalize().ok())
            .map(|(a, b)| a == b)
            .unwrap_or(false);

    if !points_to_legacy {
        return Ok(false);
    }

    if let Some(obj) = config.as_object_mut() {
        obj.remove("dataDir");
    }
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(config_path, json.as_bytes()).map_err(|e| e.to_string())?;
    Ok(true)
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn merge_config_from_legacy(portable_config: &Path, legacy_config: &Path) -> Result<bool, String> {
    if !legacy_config.exists() {
        return Ok(false);
    }
    let portable_s = std::fs::read_to_string(portable_config).unwrap_or_else(|_| "{}".into());
    let portable: serde_json::Value =
        serde_json::from_str(&portable_s).unwrap_or(serde_json::Value::Object(Default::default()));
    let portable_keys = portable.as_object().map(|o| o.len()).unwrap_or(0);
    if portable_keys > 2 {
        return Ok(false);
    }

    let legacy_s = std::fs::read_to_string(legacy_config).map_err(|e| e.to_string())?;
    let mut legacy: serde_json::Value =
        serde_json::from_str(&legacy_s).map_err(|e| format!("解析旧 settings/config.json 失败: {e}"))?;
    if let Some(obj) = legacy.as_object_mut() {
        obj.remove("dataDir");
    }
    let json = serde_json::to_string_pretty(&legacy).map_err(|e| e.to_string())?;
    std::fs::write(portable_config, json.as_bytes()).map_err(|e| e.to_string())?;
    Ok(true)
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn find_source_db(dir: &Path) -> Option<PathBuf> {
    for name in LEGACY_DB_ALIASES {
        let path = dir.join(name);
        if file_size(&path) >= MIN_LEGACY_DB_BYTES {
            return Some(path);
        }
    }
    None
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn should_replace_target_db(target: &Path, legacy: &Path) -> bool {
    let legacy_size = file_size(legacy);
    if legacy_size < MIN_LEGACY_DB_BYTES {
        return false;
    }
    let target_size = file_size(target);
    if target_size == 0 {
        return true;
    }
    legacy_size > target_size + target_size / 2
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn file_size(path: &Path) -> u64 {
    std::fs::metadata(path).ok().map(|m| m.len()).unwrap_or(0)
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn copy_sqlite_bundle(src_db: &Path, dst_db: &Path) -> Result<(), String> {
    if let Some(parent) = dst_db.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::copy(src_db, dst_db).map_err(|e| format!("复制数据库失败: {e}"))?;
    for suffix in ["-wal", "-shm"] {
        let src = PathBuf::from(format!("{}{}", src_db.display(), suffix));
        if src.exists() {
            let dst = PathBuf::from(format!("{}{}", dst_db.display(), suffix));
            std::fs::copy(&src, &dst).map_err(|e| format!("复制 {suffix} 失败: {e}"))?;
        }
    }
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn copy_file_if_absent_or_empty(src: &Path, dst: &Path) -> Result<bool, String> {
    if !src.is_file() {
        return Ok(false);
    }
    if dst.exists() && file_size(dst) > 0 {
        return Ok(false);
    }
    if let Some(parent) = dst.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::copy(src, dst).map_err(|e| e.to_string())?;
    Ok(true)
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn copy_tree_if_absent_or_empty(src: &Path, dst: &Path) -> Result<bool, String> {
    if !src.is_dir() {
        return Ok(false);
    }
    if dst.exists() && !dir_is_empty(dst)? {
        return Ok(false);
    }
    if dst.exists() {
        std::fs::remove_dir_all(dst).ok();
    }
    copy_dir_all(src, dst).map_err(|e| e.to_string())?;
    Ok(true)
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn dir_is_empty(path: &Path) -> Result<bool, String> {
    let mut entries = std::fs::read_dir(path).map_err(|e| e.to_string())?;
    Ok(entries.next().is_none())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let dest = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &dest)?;
        } else {
            std::fs::copy(entry.path(), dest)?;
        }
    }
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn paths_equal(a: &Path, b: &Path) -> bool {
    a == b
        || a.canonicalize()
            .ok()
            .zip(b.canonicalize().ok())
            .map(|(x, y)| x == y)
            .unwrap_or(false)
}

/// 更改目录前的空间与容量预检（设置页调用）
#[tauri::command]
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn precheck_data_dir_migration(
    source: String,
    target: String,
) -> Result<MigrationPrecheck, String> {
    let source_path = PathBuf::from(source.trim());
    let target_path = PathBuf::from(target.trim());
    let source_bytes = dir_size_bytes(&source_path)?;
    build_precheck(&source_path, &target_path, source_bytes)
}

/// 手动触发旧版目录迁移（设置页）
#[tauri::command]
pub fn run_legacy_data_migration(app: tauri::AppHandle) -> Result<DataMigrationResult, String> {
    let result = migrate_legacy_data_if_needed(&app)?;
    if result.migrated {
        let _ = app.emit("reader-data-migrated", &result);
    }
    Ok(result)
}

/// 迁移失败后恢复原 dataDir 并打开主窗口
#[tauri::command]
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn revert_pending_data_dir_migration(app: tauri::AppHandle) -> Result<(), String> {
    let config_path = crate::portable_paths::config_file_path()?;
    let config = read_config_json(&config_path)?;
    let Some(source_str) = config
        .get(DATA_DIR_MIGRATION_SOURCE_KEY)
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
    else {
        return Err("无待恢复的迁移任务".into());
    };

    let default_base = crate::default_app_data_base(&app)?;
    let source = PathBuf::from(source_str);
    let mut config = read_config_json(&config_path)?;
    if let Some(obj) = config.as_object_mut() {
        obj.remove(DATA_DIR_MIGRATION_SOURCE_KEY);
        if paths_equal(&source, &default_base) {
            obj.remove("dataDir");
        } else {
            obj.insert(
                "dataDir".to_string(),
                serde_json::Value::String(source.display().to_string()),
            );
        }
    }
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(&config_path, json.as_bytes()).map_err(|e| e.to_string())?;

    crate::create_main_window_if_missing(&app)?;
    run_post_main_startup(&app);
    if let Some(splash) = app.get_webview_window("migration_splash") {
        let _ = splash.close();
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
    Ok(())
}

/// 重试待执行的搬迁迁移（迁移 Splash 页）
#[tauri::command]
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn retry_pending_relocation_migration(app: tauri::AppHandle) -> Result<(), String> {
    spawn_relocation_migration(app);
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationBackupInfo {
    pub path: String,
    pub bytes: u64,
}

#[tauri::command]
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn get_data_dir_migration_backup(app: tauri::AppHandle) -> Result<Option<MigrationBackupInfo>, String> {
    let _ = app;
    let config_path = crate::portable_paths::config_file_path()?;
    let config = read_config_json(&config_path)?;
    let Some(path_str) = config
        .get(DATA_DIR_MIGRATION_BACKUP_KEY)
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
    else {
        return Ok(None);
    };
    let path = PathBuf::from(path_str);
    if !path.exists() {
        clear_config_key(&config_path, DATA_DIR_MIGRATION_BACKUP_KEY)?;
        return Ok(None);
    }
    Ok(Some(MigrationBackupInfo {
        path: path_str.to_string(),
        bytes: dir_size_bytes(&path)?,
    }))
}

/// 用户确认后删除迁移备份目录
#[tauri::command]
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn clear_data_dir_migration_backup(app: tauri::AppHandle) -> Result<(), String> {
    let _ = app;
    let config_path = crate::portable_paths::config_file_path()?;
    let config = read_config_json(&config_path)?;
    let Some(path_str) = config
        .get(DATA_DIR_MIGRATION_BACKUP_KEY)
        .and_then(|v| v.as_str())
    else {
        return Ok(());
    };
    let path = PathBuf::from(path_str);
    if path.exists() {
        std::fs::remove_dir_all(&path).map_err(|e| format!("删除备份目录失败: {e}"))?;
    }
    clear_config_key(&config_path, DATA_DIR_MIGRATION_BACKUP_KEY)?;
    Ok(())
}
