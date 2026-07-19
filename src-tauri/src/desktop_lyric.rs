//! 桌面悬浮歌词第二窗口
//!
//! Windows：禁止在同步 command 里 `WebviewWindowBuilder::build()`，否则易死锁白屏。
//! 鼠标穿透：全局光标轮询；窗内默认穿透；未锁定时顶栏热区可点；
//! 锁定时仅解锁按钮热区可点；「无视顶栏」时整窗穿透且不亮任何控制（含解锁）。

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod imp {
    use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
    use std::thread;
    use std::time::Duration;

    use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

    static PENETRATE_ENABLED: AtomicBool = AtomicBool::new(false);
    static IGNORE_CHROME: AtomicBool = AtomicBool::new(false);
    static LOCKED: AtomicBool = AtomicBool::new(false);
    static SUPERVISOR_STARTED: AtomicBool = AtomicBool::new(false);
    /// 策略变更时递增，迫使 supervisor 即使 hit 不变也重放 apply（如开启无视顶栏）
    static POLICY_GEN: AtomicU64 = AtomicU64::new(0);

    pub async fn open(
        app: AppHandle,
        width: Option<f64>,
        height: Option<f64>,
        x: Option<f64>,
        y: Option<f64>,
    ) -> Result<(), String> {
        if app.get_webview_window("desktop-lyric").is_some() {
            return Ok(());
        }
        let w = width.unwrap_or(600.0).clamp(240.0, 4000.0);
        let h = height.unwrap_or(200.0).clamp(80.0, 2000.0);
        let mut builder = WebviewWindowBuilder::new(
            &app,
            "desktop-lyric",
            WebviewUrl::App("index.html#lyric-desktop".into()),
        )
        .title("歌词")
        .inner_size(w, h)
        .always_on_top(true)
        .decorations(false)
        .resizable(true)
        .skip_taskbar(true);

        // 对齐 LX：透明窗 + 无阴影，避免白底块；macOS 需 private-api 才支持 builder.transparent
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

        // async command：避免 Windows 同步建窗死锁（白屏 + invoke 挂起）
        builder
            .build()
            .map_err(|e| format!("desktop lyric window: {e}"))?;
        Ok(())
    }

    pub fn close(app: AppHandle) {
        PENETRATE_ENABLED.store(false, Ordering::SeqCst);
        IGNORE_CHROME.store(false, Ordering::SeqCst);
        if let Some(w) = app.get_webview_window("desktop-lyric") {
            let _ = w.set_ignore_cursor_events(false);
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

    #[cfg(windows)]
    fn global_cursor_pos() -> Option<(i32, i32)> {
        use windows::Win32::Foundation::POINT;
        use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
        let mut pt = POINT::default();
        unsafe {
            if GetCursorPos(&mut pt).is_ok() {
                Some((pt.x, pt.y))
            } else {
                None
            }
        }
    }

    #[cfg(not(windows))]
    fn global_cursor_pos() -> Option<(i32, i32)> {
        None
    }

    /// 穿透模式下光标相对歌词窗的位置。
    /// Body：仍穿透；Chrome：临时取消穿透以便点按钮。
    #[derive(Clone, Copy, PartialEq, Eq)]
    enum CursorHit {
        Outside,
        Body,
        Chrome,
    }

    fn cursor_hit(app: &AppHandle) -> CursorHit {
        let Some(w) = app.get_webview_window("desktop-lyric") else {
            return CursorHit::Outside;
        };
        let Ok(pos) = w.outer_position() else {
            return CursorHit::Outside;
        };
        let Ok(size) = w.outer_size() else {
            return CursorHit::Outside;
        };
        let Some((cx, cy)) = global_cursor_pos() else {
            return CursorHit::Outside;
        };
        let x0 = pos.x;
        let y0 = pos.y;
        let x1 = pos.x.saturating_add(size.width as i32);
        let y1 = pos.y.saturating_add(size.height as i32);
        if !(cx >= x0 && cy >= y0 && cx < x1 && cy < y1) {
            return CursorHit::Outside;
        }

        let scale = w.scale_factor().unwrap_or(1.0);

        // 无视顶栏：整窗穿透，含锁定时的解锁按钮也不拦截、不亮栏
        if IGNORE_CHROME.load(Ordering::SeqCst) {
            return CursorHit::Body;
        }

        // 锁定：仅右上解锁按钮（约 36×36 逻辑像素）可拦截
        if LOCKED.load(Ordering::SeqCst) {
            let unlock_w = ((40.0_f64 * scale).round() as i32).max(32);
            let unlock_h = ((40.0_f64 * scale).round() as i32).max(32);
            if cx >= x1.saturating_sub(unlock_w) && cy < y0.saturating_add(unlock_h) {
                return CursorHit::Chrome;
            }
            return CursorHit::Body;
        }

        // 未锁定：顶部整条热区可点顶栏
        let chrome_h = ((56.0_f64 * scale).round() as i32).max(40);
        if cy < y0.saturating_add(chrome_h) {
            CursorHit::Chrome
        } else {
            CursorHit::Body
        }
    }

    fn apply_cursor_hit(app: &AppHandle, hit: CursorHit) {
        let ignore_chrome = IGNORE_CHROME.load(Ordering::SeqCst);
        match hit {
            CursorHit::Outside => {
                let _ = set_ignore_cursor(app.clone(), true);
                let _ = app.emit("desktop-lyric-penetrate-hover", false);
            }
            CursorHit::Body => {
                let _ = set_ignore_cursor(app.clone(), true);
                // 无视顶栏：不亮控制栏；否则悬停歌词区仍提示顶栏
                let _ = app.emit("desktop-lyric-penetrate-hover", !ignore_chrome);
            }
            CursorHit::Chrome => {
                let _ = set_ignore_cursor(app.clone(), false);
                let _ = app.emit("desktop-lyric-penetrate-hover", true);
            }
        }
    }

    fn ensure_penetrate_supervisor(app: AppHandle) {
        if SUPERVISOR_STARTED.swap(true, Ordering::SeqCst) {
            return;
        }
        thread::spawn(move || {
            let mut last_hit: Option<CursorHit> = None;
            let mut last_gen: u64 = 0;
            loop {
                if app.get_webview_window("desktop-lyric").is_none() {
                    if PENETRATE_ENABLED.swap(false, Ordering::SeqCst) {
                        last_hit = None;
                        let _ = app.emit("desktop-lyric-penetrate-hover", false);
                    }
                    thread::sleep(Duration::from_millis(80));
                    continue;
                }

                if !PENETRATE_ENABLED.load(Ordering::SeqCst) {
                    if last_hit.take().is_some() {
                        let _ = set_ignore_cursor(app.clone(), false);
                        let _ = app.emit("desktop-lyric-penetrate-hover", false);
                    }
                    thread::sleep(Duration::from_millis(80));
                    continue;
                }

                let gen = POLICY_GEN.load(Ordering::SeqCst);
                let hit = cursor_hit(&app);
                if last_hit != Some(hit) || last_gen != gen {
                    last_hit = Some(hit);
                    last_gen = gen;
                    apply_cursor_hit(&app, hit);
                }
                thread::sleep(Duration::from_millis(32));
            }
        });
    }

    /// 启用/关闭穿透；`ignore_chrome` 为「无视顶栏」高级选项。
    pub fn set_penetrate_mode(
        app: AppHandle,
        enabled: bool,
        ignore_chrome: Option<bool>,
    ) -> Result<(), String> {
        if let Some(v) = ignore_chrome {
            IGNORE_CHROME.store(v, Ordering::SeqCst);
        }
        PENETRATE_ENABLED.store(enabled, Ordering::SeqCst);
        POLICY_GEN.fetch_add(1, Ordering::SeqCst);
        if !enabled {
            let _ = set_ignore_cursor(app.clone(), false);
            let _ = app.emit("desktop-lyric-penetrate-hover", false);
            return Ok(());
        }
        ensure_penetrate_supervisor(app.clone());
        apply_cursor_hit(&app, cursor_hit(&app));
        Ok(())
    }

    pub fn set_options(
        app: AppHandle,
        always_on_top: bool,
        locked: bool,
    ) -> Result<(), String> {
        LOCKED.store(locked, Ordering::SeqCst);
        POLICY_GEN.fetch_add(1, Ordering::SeqCst);
        let w = app
            .get_webview_window("desktop-lyric")
            .ok_or_else(|| "桌面歌词窗口未打开".to_string())?;
        w.set_always_on_top(always_on_top)
            .map_err(|e| format!("set_always_on_top: {e}"))?;
        w.set_resizable(!locked)
            .map_err(|e| format!("set_resizable: {e}"))?;
        // 锁定状态影响穿透热区，立即重算
        if PENETRATE_ENABLED.load(Ordering::SeqCst) {
            apply_cursor_hit(&app, cursor_hit(&app));
        }
        Ok(())
    }

    pub fn set_resizable(app: AppHandle, resizable: bool) -> Result<(), String> {
        let w = app
            .get_webview_window("desktop-lyric")
            .ok_or_else(|| "桌面歌词窗口未打开".to_string())?;
        w.set_resizable(resizable)
            .map_err(|e| format!("set_resizable: {e}"))
    }

    pub fn set_bounds(
        app: AppHandle,
        x: Option<i32>,
        y: Option<i32>,
        width: Option<u32>,
        height: Option<u32>,
    ) -> Result<(), String> {
        let w = app
            .get_webview_window("desktop-lyric")
            .ok_or_else(|| "桌面歌词窗口未打开".to_string())?;
        if let (Some(width), Some(height)) = (width, height) {
            w.set_size(PhysicalSize::new(width.max(240), height.max(80)))
                .map_err(|e| format!("set_size: {e}"))?;
        }
        if let (Some(x), Some(y)) = (x, y) {
            w.set_position(PhysicalPosition::new(x, y))
                .map_err(|e| format!("set_position: {e}"))?;
        }
        Ok(())
    }

    pub fn reset_geometry(app: AppHandle) -> Result<(), String> {
        let w = app
            .get_webview_window("desktop-lyric")
            .ok_or_else(|| "桌面歌词窗口未打开".to_string())?;
        w.set_size(PhysicalSize::new(600_u32, 200_u32))
            .map_err(|e| format!("set_size: {e}"))?;
        w.center().map_err(|e| format!("center: {e}"))
    }

    pub fn is_open(app: AppHandle) -> bool {
        app.get_webview_window("desktop-lyric").is_some()
    }
}

#[tauri::command]
pub async fn open_desktop_lyric_window(
    app: tauri::AppHandle,
    width: Option<f64>,
    height: Option<f64>,
    x: Option<f64>,
    y: Option<f64>,
) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        return imp::open(app, width, height, x, y).await;
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (app, width, height, x, y);
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

#[tauri::command]
pub fn set_desktop_lyric_penetrate_mode(
    app: tauri::AppHandle,
    enabled: bool,
    ignore_chrome: Option<bool>,
) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        return imp::set_penetrate_mode(app, enabled, ignore_chrome);
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (app, enabled, ignore_chrome);
        Err("桌面歌词仅桌面端可用".into())
    }
}

#[tauri::command]
pub fn set_desktop_lyric_window_options(
    app: tauri::AppHandle,
    always_on_top: bool,
    locked: bool,
) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        return imp::set_options(app, always_on_top, locked);
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (app, always_on_top, locked);
        Err("桌面歌词仅桌面端可用".into())
    }
}

#[tauri::command]
pub fn set_desktop_lyric_resizable(app: tauri::AppHandle, resizable: bool) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        return imp::set_resizable(app, resizable);
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (app, resizable);
        Err("桌面歌词仅桌面端可用".into())
    }
}

#[tauri::command]
pub fn set_desktop_lyric_bounds(
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
        Err("桌面歌词仅桌面端可用".into())
    }
}

#[tauri::command]
pub fn reset_desktop_lyric_window_geometry(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        return imp::reset_geometry(app);
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = app;
        Err("桌面歌词仅桌面端可用".into())
    }
}

#[tauri::command]
pub fn is_desktop_lyric_window_open(app: tauri::AppHandle) -> bool {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        return imp::is_open(app);
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = app;
        false
    }
}
