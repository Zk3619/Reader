//! 桌面悬浮歌词第二窗口

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod imp {
    use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

    pub fn open(app: AppHandle) -> Result<(), String> {
        if app.get_webview_window("desktop-lyric").is_some() {
            return Ok(());
        }
        WebviewWindowBuilder::new(
            &app,
            "desktop-lyric",
            WebviewUrl::App("index.html#lyric-desktop".into()),
        )
        .title("歌词")
        .inner_size(600.0, 200.0)
        .always_on_top(true)
        .decorations(false)
        .resizable(true)
        .build()
        .map_err(|e| format!("desktop lyric window: {e}"))?;
        Ok(())
    }

    pub fn close(app: AppHandle) {
        if let Some(w) = app.get_webview_window("desktop-lyric") {
            let _ = w.close();
        }
    }

    pub fn set_ignore_cursor(app: AppHandle, ignore: bool) -> Result<(), String> {
        let w = app
            .get_webview_window("desktop-lyric")
            .ok_or_else(|| "桌面歌词窗口未打开".to_string())?;
        w.set_ignore_cursor_events(ignore)
            .map_err(|e| format!("set_ignore_cursor_events: {e}"))
    }
}

#[tauri::command]
pub fn open_desktop_lyric_window(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        return imp::open(app);
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = app;
        Err("桌面歌词仅 Windows/macOS/Linux 可用".into())
    }
}

#[tauri::command]
pub fn close_desktop_lyric_window(app: tauri::AppHandle) {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    imp::close(app);
    #[cfg(any(target_os = "android", target_os = "ios"))]
    let _ = app;
}

#[tauri::command]
pub fn set_desktop_lyric_ignore_cursor(app: tauri::AppHandle, ignore: bool) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        return imp::set_ignore_cursor(app, ignore);
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (app, ignore);
        Err("桌面歌词仅桌面端可用".into())
    }
}
