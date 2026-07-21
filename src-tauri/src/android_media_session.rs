//! Android 锁屏/通知栏 MediaSession（Tauri 命令桥接）

#[cfg(target_os = "android")]
mod imp {
    use std::sync::{Mutex, OnceLock};
    use tauri::AppHandle;
    use tauri::Emitter;

    #[derive(Clone, Debug, Default)]
    pub struct MediaSessionSnapshot {
        pub playing: bool,
        pub title: String,
        pub artist: String,
        pub cover_url: String,
        pub position_sec: f64,
        pub duration_sec: f64,
    }

    static LAST_SESSION: OnceLock<Mutex<MediaSessionSnapshot>> = OnceLock::new();
    static PENDING_ACTION: OnceLock<Mutex<Option<String>>> = OnceLock::new();

    pub fn session_lock() -> &'static Mutex<MediaSessionSnapshot> {
        LAST_SESSION.get_or_init(|| Mutex::new(MediaSessionSnapshot::default()))
    }

    fn action_lock() -> &'static Mutex<Option<String>> {
        PENDING_ACTION.get_or_init(|| Mutex::new(None))
    }

    pub fn update(
        playing: bool,
        title: String,
        artist: String,
        cover_url: String,
        position_sec: f64,
        duration_sec: f64,
    ) {
        if let Ok(mut guard) = session_lock().lock() {
            *guard = MediaSessionSnapshot {
                playing,
                title,
                artist,
                cover_url,
                position_sec,
                duration_sec,
            };
        }
    }

    pub fn snapshot() -> (bool, String, String, String, f64, f64) {
        session_lock()
            .lock()
            .map(|s| {
                (
                    s.playing,
                    s.title.clone(),
                    s.artist.clone(),
                    s.cover_url.clone(),
                    s.position_sec,
                    s.duration_sec,
                )
            })
            .unwrap_or((false, String::new(), String::new(), String::new(), 0.0, 0.0))
    }

    pub fn report_action(app: &AppHandle, action: String) {
        if let Ok(mut guard) = action_lock().lock() {
            *guard = Some(action.clone());
        }
        let _ = app.emit("android-media-action", serde_json::json!({ "action": action }));
    }

    pub fn take_pending_action() -> Option<String> {
        action_lock().lock().ok()?.take()
    }
}

/// 全平台注册：非 Android 为 no-op，避免前端 invoke 报错。
#[tauri::command]
pub fn sync_android_media_session(
    app: tauri::AppHandle,
    playing: bool,
    title: String,
    artist: String,
    cover_url: Option<String>,
    position_sec: Option<f64>,
    duration_sec: Option<f64>,
) {
    #[cfg(target_os = "android")]
    {
        let cover = cover_url.clone().unwrap_or_default();
        imp::update(
            playing,
            title.clone(),
            artist.clone(),
            cover.clone(),
            position_sec.unwrap_or(0.0),
            duration_sec.unwrap_or(0.0),
        );
        let _ = crate::platform::android::music_media::sync_music_notification(
            &app,
            playing,
            &title,
            &artist,
            &cover,
            position_sec.unwrap_or(0.0),
            duration_sec.unwrap_or(0.0),
        );
        log::debug!(
            "android_media_session: playing={playing} title={title} artist={artist}"
        );
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, playing, title, artist, cover_url, position_sec, duration_sec);
    }
}

/// Android 通知栏/锁屏控制回传（play/pause/next/prev）
#[tauri::command]
pub fn report_android_media_action(app: tauri::AppHandle, action: String) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        imp::report_action(&app, action);
        return Ok(());
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, action);
        Ok(())
    }
}

/// 供 Android 原生层读取当前 MediaSession 状态（锁屏/通知栏）。
#[cfg(target_os = "android")]
#[tauri::command]
pub fn get_android_media_session_snapshot() -> (bool, String, String, String, f64, f64) {
    imp::snapshot()
}

#[cfg(target_os = "android")]
#[tauri::command]
pub fn take_android_media_pending_action() -> Option<String> {
    imp::take_pending_action()
}

#[tauri::command]
pub fn request_android_overlay_permission(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        return crate::platform::android::music_media::request_overlay_permission(&app);
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(())
    }
}

#[tauri::command]
pub fn request_android_ignore_battery_optimizations(
    app: tauri::AppHandle,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        return crate::platform::android::music_media::request_ignore_battery_optimizations(&app);
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(())
    }
}

#[tauri::command]
pub fn check_android_overlay_permission(app: tauri::AppHandle) -> Result<bool, String> {
    #[cfg(target_os = "android")]
    {
        return crate::platform::android::music_media::check_overlay_permission(&app);
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(false)
    }
}

#[tauri::command]
pub fn show_android_desktop_lyric(
    app: tauri::AppHandle,
    locked: Option<bool>,
    text_size_sp: Option<f32>,
    color: Option<String>,
    alpha: Option<f32>,
    align: Option<String>,
    x: Option<i32>,
    y: Option<i32>,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        return crate::platform::android::music_media::show_desktop_lyric(
            &app,
            crate::platform::android::music_media::DesktopLyricShowArgs {
                locked: locked.unwrap_or(false),
                text_size_sp: text_size_sp.unwrap_or(20.0),
                color: color.unwrap_or_else(|| "#FFFFFF".into()),
                alpha: alpha.unwrap_or(0.9),
                align: align.unwrap_or_else(|| "center".into()),
                x: x.unwrap_or(-1),
                y: y.unwrap_or(-1),
            },
        );
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, locked, text_size_sp, color, alpha, align, x, y);
        Err("仅 Android 可用".into())
    }
}

#[tauri::command]
pub fn hide_android_desktop_lyric(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        return crate::platform::android::music_media::hide_desktop_lyric(&app);
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(())
    }
}

#[tauri::command]
pub fn set_android_desktop_lyric_text(
    app: tauri::AppHandle,
    line: String,
    meta: String,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        return crate::platform::android::music_media::set_desktop_lyric_text(&app, &line, &meta);
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, line, meta);
        Ok(())
    }
}

#[tauri::command]
pub fn set_android_desktop_lyric_style(
    app: tauri::AppHandle,
    text_size_sp: Option<f32>,
    color: Option<String>,
    alpha: Option<f32>,
    align: Option<String>,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        return crate::platform::android::music_media::set_desktop_lyric_style(
            &app,
            crate::platform::android::music_media::DesktopLyricStyleArgs {
                text_size_sp: text_size_sp.unwrap_or(0.0),
                color: color.unwrap_or_default(),
                alpha: alpha.unwrap_or(-1.0),
                align: align.unwrap_or_else(|| "center".into()),
            },
        );
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, text_size_sp, color, alpha, align);
        Ok(())
    }
}

#[tauri::command]
pub fn set_android_desktop_lyric_lock(
    app: tauri::AppHandle,
    locked: bool,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        return crate::platform::android::music_media::set_desktop_lyric_lock(&app, locked);
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, locked);
        Ok(())
    }
}

#[tauri::command]
pub fn is_android_desktop_lyric_shown(app: tauri::AppHandle) -> Result<bool, String> {
    #[cfg(target_os = "android")]
    {
        return crate::platform::android::music_media::is_desktop_lyric_shown(&app);
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(false)
    }
}
