//! 桌面迷你播放窗（对齐 MusicFree MiniMode）

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod imp {
    use tauri::{AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};

    const LABEL: &str = "music-mini-player";
    const MIN_WINDOW_WIDTH: u32 = 280;
    const MIN_WINDOW_HEIGHT: u32 = 64;

    pub async fn ensure_created(
        app: &AppHandle,
        width: Option<f64>,
        height: Option<f64>,
        x: Option<f64>,
        y: Option<f64>,
        always_on_top: Option<bool>,
    ) -> Result<(), String> {
        if app.get_webview_window(LABEL).is_some() {
            return Ok(());
        }
        let w = width.unwrap_or(380.0).clamp(280.0, 720.0);
        let h = height.unwrap_or(88.0).clamp(64.0, 240.0);
        let on_top = always_on_top.unwrap_or(true);
        let mut builder = WebviewWindowBuilder::new(
            app,
            LABEL,
            WebviewUrl::App("index.html#music-mini-player".into()),
        )
        .title("迷你播放")
        .inner_size(w, h)
        .min_inner_size(280.0, 64.0)
        .always_on_top(on_top)
        .decorations(false)
        .resizable(true)
        .visible(false)
        .skip_taskbar(true);

        #[cfg(not(target_os = "macos"))]
        {
            builder = builder.transparent(true);
            #[cfg(windows)]
            {
                builder = builder.shadow(false);
            }
        }

        if let (Some(px), Some(py)) = (x, y) {
            builder = builder.position(px, py);
        }

        builder
            .build()
            .map_err(|e| format!("music mini player window: {e}"))?;
        Ok(())
    }

    fn resolve_monitor(
        window: &tauri::WebviewWindow,
        x: i32,
        y: i32,
    ) -> Option<tauri::Monitor> {
        if let Ok(monitors) = window.available_monitors() {
            for m in &monitors {
                let pos = m.position();
                let size = m.size();
                let mx1 = pos.x + size.width as i32;
                let my1 = pos.y + size.height as i32;
                if x >= pos.x && y >= pos.y && x < mx1 && y < my1 {
                    return Some(m.clone());
                }
            }
            if let Ok(Some(m)) = window.current_monitor() {
                return Some(m);
            }
            return monitors.first().cloned();
        }
        window.current_monitor().ok().flatten()
    }

    fn monitor_work_area(monitor: &tauri::Monitor) -> (i32, i32, u32, u32) {
        let area = monitor.work_area();
        (
            area.position.x,
            area.position.y,
            area.size.width,
            area.size.height,
        )
    }

    fn clamp_bounds_to_screen(
        window: &tauri::WebviewWindow,
        x: i32,
        y: i32,
        width: u32,
        height: u32,
    ) -> Result<(i32, i32, u32, u32), String> {
        let Some(monitor) = resolve_monitor(window, x, y) else {
            return Ok((x, y, width, height));
        };
        let (area_x, area_y, area_w, area_h) = monitor_work_area(&monitor);
        let max_w = area_w.max(MIN_WINDOW_WIDTH);
        let max_h = area_h.max(MIN_WINDOW_HEIGHT);
        let width = width.clamp(MIN_WINDOW_WIDTH, max_w);
        let height = height.clamp(MIN_WINDOW_HEIGHT, max_h);
        let max_x = area_x + max_w as i32 - width as i32;
        let max_y = area_y + max_h as i32 - height as i32;
        let x = x.clamp(area_x, max_x.max(area_x));
        let y = y.clamp(area_y, max_y.max(area_y));
        Ok((x, y, width, height))
    }

    #[cfg(windows)]
    fn apply_bounds(
        window: &tauri::WebviewWindow,
        x: i32,
        y: i32,
        width: u32,
        height: u32,
    ) -> Result<(), String> {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER};
        let hwnd = window.hwnd().map_err(|e| format!("hwnd: {e}"))?;
        let ok = unsafe {
            SetWindowPos(
                HWND(hwnd.0),
                None,
                x,
                y,
                width.max(MIN_WINDOW_WIDTH) as i32,
                height.max(MIN_WINDOW_HEIGHT) as i32,
                SWP_NOZORDER | SWP_NOACTIVATE,
            )
        };
        ok.map_err(|e| format!("SetWindowPos: {e}"))?;
        Ok(())
    }

    #[cfg(not(windows))]
    fn apply_bounds(
        window: &tauri::WebviewWindow,
        x: i32,
        y: i32,
        width: u32,
        height: u32,
    ) -> Result<(), String> {
        window
            .set_position(PhysicalPosition::new(x, y))
            .map_err(|e| format!("set_position: {e}"))?;
        window
            .set_size(PhysicalSize::new(
                width.max(MIN_WINDOW_WIDTH),
                height.max(MIN_WINDOW_HEIGHT),
            ))
            .map_err(|e| format!("set_size: {e}"))?;
        Ok(())
    }

    pub fn clamp_to_screen(app: AppHandle) -> Result<(), String> {
        let w = app
            .get_webview_window(LABEL)
            .ok_or_else(|| "迷你播放窗未创建".to_string())?;
        let pos = w
            .outer_position()
            .map_err(|e| format!("outer_position: {e}"))?;
        let size = w
            .outer_size()
            .map_err(|e| format!("outer_size: {e}"))?;
        let (next_x, next_y, next_w, next_h) =
            clamp_bounds_to_screen(&w, pos.x, pos.y, size.width, size.height)?;
        if next_x != pos.x || next_y != pos.y || next_w != size.width || next_h != size.height {
            apply_bounds(&w, next_x, next_y, next_w, next_h)?;
        }
        Ok(())
    }

    pub fn set_bounds(
        app: AppHandle,
        x: Option<i32>,
        y: Option<i32>,
        width: Option<u32>,
        height: Option<u32>,
    ) -> Result<(), String> {
        let w = app
            .get_webview_window(LABEL)
            .ok_or_else(|| "迷你播放窗未创建".to_string())?;
        if let (Some(width), Some(height)) = (width, height) {
            let (next_x, next_y, next_w, next_h) = if let (Some(x), Some(y)) = (x, y) {
                clamp_bounds_to_screen(&w, x, y, width, height)?
            } else {
                let pos = w
                    .outer_position()
                    .map_err(|e| format!("outer_position: {e}"))?;
                clamp_bounds_to_screen(&w, pos.x, pos.y, width, height)?
            };
            return apply_bounds(&w, next_x, next_y, next_w, next_h);
        }
        if let (Some(x), Some(y)) = (x, y) {
            let size = w
                .outer_size()
                .map_err(|e| format!("outer_size: {e}"))?;
            let (next_x, next_y, _, _) =
                clamp_bounds_to_screen(&w, x, y, size.width, size.height)?;
            w.set_position(PhysicalPosition::new(next_x, next_y))
                .map_err(|e| format!("set_position: {e}"))?;
        }
        Ok(())
    }

    pub async fn open(
        app: AppHandle,
        width: Option<f64>,
        height: Option<f64>,
        x: Option<f64>,
        y: Option<f64>,
        always_on_top: Option<bool>,
    ) -> Result<(), String> {
        ensure_created(&app, width, height, x, y, always_on_top).await?;
        if let Some(w) = app.get_webview_window(LABEL) {
            if let (Some(px), Some(py), Some(pw), Some(ph)) = (x, y, width, height) {
                let _ = set_bounds(
                    app.clone(),
                    Some(px.round() as i32),
                    Some(py.round() as i32),
                    Some(pw.round() as u32),
                    Some(ph.round() as u32),
                );
            }
            w.show().map_err(|e| format!("show: {e}"))?;
            clamp_to_screen(app)?;
        }
        Ok(())
    }

    pub fn close(app: AppHandle) {
        if let Some(w) = app.get_webview_window(LABEL) {
            let _ = w.hide();
        }
    }

    pub fn destroy(app: AppHandle) {
        if let Some(w) = app.get_webview_window(LABEL) {
            let _ = w.close();
        }
    }

    pub fn is_open(app: &AppHandle) -> bool {
        app.get_webview_window(LABEL)
            .map(|w| w.is_visible().unwrap_or(false))
            .unwrap_or(false)
    }
}

#[tauri::command]
pub async fn precreate_music_mini_player_window(
    app: tauri::AppHandle,
    width: Option<f64>,
    height: Option<f64>,
    x: Option<f64>,
    y: Option<f64>,
    always_on_top: Option<bool>,
) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        return imp::ensure_created(&app, width, height, x, y, always_on_top).await;
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (app, width, height, x, y, always_on_top);
        Err("迷你播放窗仅桌面端可用".into())
    }
}

#[tauri::command]
pub async fn open_music_mini_player_window(
    app: tauri::AppHandle,
    width: Option<f64>,
    height: Option<f64>,
    x: Option<f64>,
    y: Option<f64>,
    always_on_top: Option<bool>,
) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        return imp::open(app, width, height, x, y, always_on_top).await;
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (app, width, height, x, y, always_on_top);
        Err("迷你播放窗仅桌面端可用".into())
    }
}

#[tauri::command]
pub fn close_music_mini_player_window(app: tauri::AppHandle) {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    imp::close(app);
    #[cfg(any(target_os = "android", target_os = "ios"))]
    let _ = app;
}

#[tauri::command]
pub fn destroy_music_mini_player_window(app: tauri::AppHandle) {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    imp::destroy(app);
    #[cfg(any(target_os = "android", target_os = "ios"))]
    let _ = app;
}

#[tauri::command]
pub fn is_music_mini_player_window_open(app: tauri::AppHandle) -> bool {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        return imp::is_open(&app);
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = app;
        false
    }
}

#[tauri::command]
pub fn clamp_music_mini_player_to_screen(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        return imp::clamp_to_screen(app);
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = app;
        Ok(())
    }
}

#[tauri::command]
pub fn set_music_mini_player_bounds(
    app: tauri::AppHandle,
    x: Option<i32>,
    y: Option<i32>,
    width: Option<u32>,
    height: Option<u32>,
) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        return imp::set_bounds(app, x, y, width, height);
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (app, x, y, width, height);
        Err("迷你播放窗仅桌面端可用".into())
    }
}
