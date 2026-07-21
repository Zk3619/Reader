//! 桌面悬浮歌词第二窗口
//!
//! Windows：禁止在同步 command 里 `WebviewWindowBuilder::build()`，否则易死锁白屏。
//! 鼠标穿透：全局光标轮询；窗内默认穿透；未锁定时顶栏热区可点；
//! 锁定时仅解锁按钮热区可点；「无视顶栏」时整窗穿透且不亮任何控制（含解锁）。

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod imp {
    use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
    use std::sync::Mutex;
    use std::thread;
    use std::time::Duration;

    use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

    static PENETRATE_ENABLED: AtomicBool = AtomicBool::new(false);
    static IGNORE_CHROME: AtomicBool = AtomicBool::new(false);
    static LOCKED: AtomicBool = AtomicBool::new(false);
    static SHOW_TASKBAR: AtomicBool = AtomicBool::new(false);
    static ALWAYS_ON_TOP: AtomicBool = AtomicBool::new(true);
    static ALWAYS_ON_TOP_LOOP: AtomicBool = AtomicBool::new(false);
    static LOCK_SCREEN: AtomicBool = AtomicBool::new(false);
    static SUPERVISOR_STARTED: AtomicBool = AtomicBool::new(false);
    static ALWAYS_ON_TOP_LOOP_STARTED: AtomicBool = AtomicBool::new(false);
    /// 策略变更时递增，迫使 supervisor 即使 hit 不变也重放 apply（如开启无视顶栏）
    static POLICY_GEN: AtomicU64 = AtomicU64::new(0);

    struct PenetrateSupervisorState {
        last_hit: Option<CursorHit>,
        last_gen: u64,
        tick_pending: bool,
    }

    static PENETRATE_SUPERVISOR: Mutex<PenetrateSupervisorState> = Mutex::new(PenetrateSupervisorState {
        last_hit: None,
        last_gen: 0,
        tick_pending: false,
    });

    /// 确保窗口已创建（隐藏）；若已存在则不重复创建。
    pub async fn ensure_created(
        app: &AppHandle,
        width: Option<f64>,
        height: Option<f64>,
        x: Option<f64>,
        y: Option<f64>,
        show_taskbar: Option<bool>,
        always_on_top: Option<bool>,
        always_on_top_loop: Option<bool>,
        lock_screen: Option<bool>,
    ) -> Result<(), String> {
        if app.get_webview_window("desktop-lyric").is_some() {
            return Ok(());
        }
        if let Some(v) = show_taskbar {
            SHOW_TASKBAR.store(v, Ordering::SeqCst);
        }
        if let Some(v) = always_on_top {
            ALWAYS_ON_TOP.store(v, Ordering::SeqCst);
        }
        if let Some(v) = always_on_top_loop {
            ALWAYS_ON_TOP_LOOP.store(v, Ordering::SeqCst);
        }
        if let Some(v) = lock_screen {
            LOCK_SCREEN.store(v, Ordering::SeqCst);
        }
        let w = width.unwrap_or(600.0).clamp(240.0, 4000.0);
        let h = height.unwrap_or(200.0).clamp(80.0, 2000.0);
        let on_top = ALWAYS_ON_TOP.load(Ordering::SeqCst);
        let mut builder = WebviewWindowBuilder::new(
            app,
            "desktop-lyric",
            WebviewUrl::App("index.html#lyric-desktop".into()),
        )
        .title("歌词")
        .inner_size(w, h)
        .always_on_top(on_top)
        .decorations(false)
        .resizable(true)
        .visible(false)
        .skip_taskbar(!SHOW_TASKBAR.load(Ordering::SeqCst));

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
            .map_err(|e| format!("desktop lyric window: {e}"))?;
        if on_top && ALWAYS_ON_TOP_LOOP.load(Ordering::SeqCst) {
            ensure_always_on_top_loop(app.clone());
        }
        Ok(())
    }

    pub async fn open(
        app: AppHandle,
        width: Option<f64>,
        height: Option<f64>,
        x: Option<f64>,
        y: Option<f64>,
        show_taskbar: Option<bool>,
        always_on_top: Option<bool>,
        always_on_top_loop: Option<bool>,
        lock_screen: Option<bool>,
    ) -> Result<(), String> {
        ensure_created(&app, width, height, x, y, show_taskbar, always_on_top, always_on_top_loop, lock_screen).await?;
        if let Some(w) = app.get_webview_window("desktop-lyric") {
            w.show().map_err(|e| format!("show: {e}"))?;
        }
        Ok(())
    }

    pub fn close(app: AppHandle) {
        PENETRATE_ENABLED.store(false, Ordering::SeqCst);
        IGNORE_CHROME.store(false, Ordering::SeqCst);
        if let Some(w) = app.get_webview_window("desktop-lyric") {
            let _ = w.set_ignore_cursor_events(false);
            let _ = w.hide();
        }
    }

    pub fn destroy(app: AppHandle) {
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

    /// 穿透轮询 tick：所有 WebView 窗口 API 必须在主线程执行。
    fn run_penetrate_tick(app: &AppHandle) {
        if app.get_webview_window("desktop-lyric").is_none() {
            if PENETRATE_ENABLED.swap(false, Ordering::SeqCst) {
                let mut st = PENETRATE_SUPERVISOR.lock().unwrap_or_else(|e| e.into_inner());
                st.last_hit = None;
                let _ = app.emit("desktop-lyric-penetrate-hover", false);
            }
            return;
        }

        if !PENETRATE_ENABLED.load(Ordering::SeqCst) {
            let mut st = PENETRATE_SUPERVISOR.lock().unwrap_or_else(|e| e.into_inner());
            if st.last_hit.take().is_some() {
                let _ = set_ignore_cursor(app.clone(), false);
                let _ = app.emit("desktop-lyric-penetrate-hover", false);
            }
            return;
        }

        let gen = POLICY_GEN.load(Ordering::SeqCst);
        let hit = cursor_hit(app);
        let mut st = PENETRATE_SUPERVISOR.lock().unwrap_or_else(|e| e.into_inner());
        if st.last_hit != Some(hit) || st.last_gen != gen {
            st.last_hit = Some(hit);
            st.last_gen = gen;
            apply_cursor_hit(app, hit);
        }
    }

    fn schedule_penetrate_tick(app: &AppHandle) {
        {
            let mut st = PENETRATE_SUPERVISOR.lock().unwrap_or_else(|e| e.into_inner());
            if st.tick_pending {
                return;
            }
            st.tick_pending = true;
        }
        let app = app.clone();
        let _ = app.clone().run_on_main_thread(move || {
            {
                let mut st = PENETRATE_SUPERVISOR.lock().unwrap_or_else(|e| e.into_inner());
                st.tick_pending = false;
            }
            run_penetrate_tick(&app);
        });
    }

    fn ensure_penetrate_supervisor(app: AppHandle) {
        if SUPERVISOR_STARTED.swap(true, Ordering::SeqCst) {
            return;
        }
        thread::spawn(move || {
            loop {
                let delay = if PENETRATE_ENABLED.load(Ordering::SeqCst) {
                    32
                } else {
                    80
                };
                thread::sleep(Duration::from_millis(delay));
                schedule_penetrate_tick(&app);
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

    fn ensure_always_on_top_loop(app: AppHandle) {
        if ALWAYS_ON_TOP_LOOP_STARTED.swap(true, Ordering::SeqCst) {
            return;
        }
        thread::spawn(move || {
            loop {
                thread::sleep(Duration::from_millis(2500));
                if !ALWAYS_ON_TOP_LOOP.load(Ordering::SeqCst)
                    || !ALWAYS_ON_TOP.load(Ordering::SeqCst)
                {
                    continue;
                }
                let app = app.clone();
                let _ = app.clone().run_on_main_thread(move || {
                    if let Some(w) = app.get_webview_window("desktop-lyric") {
                        let _ = w.set_always_on_top(true);
                    }
                });
            }
        });
    }

    fn resolve_monitor(
        window: &tauri::WebviewWindow,
        x: i32,
        y: i32,
    ) -> Option<tauri::Monitor> {
        if let Ok(Some(m)) = window.current_monitor() {
            return Some(m);
        }
        if let Ok(monitors) = window.available_monitors() {
            let fallback = monitors.first().cloned();
            for m in &monitors {
                let pos = m.position();
                let size = m.size();
                let mx1 = pos.x + size.width as i32;
                let my1 = pos.y + size.height as i32;
                if x >= pos.x && y >= pos.y && x < mx1 && y < my1 {
                    return Some(m.clone());
                }
            }
            return fallback;
        }
        None
    }

    fn clamp_bounds_to_screen(
        window: &tauri::WebviewWindow,
        x: i32,
        y: i32,
        width: u32,
        height: u32,
    ) -> Result<(i32, i32, u32, u32), String> {
        if !LOCK_SCREEN.load(Ordering::SeqCst) {
            return Ok((x, y, width, height));
        }
        let Some(monitor) = resolve_monitor(window, x, y) else {
            return Ok((x, y, width, height));
        };
        let pos = monitor.position();
        let size = monitor.size();
        let max_w = size.width.max(240);
        let max_h = size.height.max(80);
        let width = width.clamp(240, max_w);
        let height = height.clamp(80, max_h);
        let max_x = pos.x + max_w as i32 - width as i32;
        let max_y = pos.y + max_h as i32 - height as i32;
        let x = x.clamp(pos.x, max_x.max(pos.x));
        let y = y.clamp(pos.y, max_y.max(pos.y));
        Ok((x, y, width, height))
    }

    pub fn clamp_to_screen(app: AppHandle) -> Result<(), String> {
        if !LOCK_SCREEN.load(Ordering::SeqCst) {
            return Ok(());
        }
        let w = app
            .get_webview_window("desktop-lyric")
            .ok_or_else(|| "桌面歌词窗口未打开".to_string())?;
        let pos = w
            .outer_position()
            .map_err(|e| format!("outer_position: {e}"))?;
        let size = w
            .outer_size()
            .map_err(|e| format!("outer_size: {e}"))?;
        let (next_x, next_y, _, _) =
            clamp_bounds_to_screen(&w, pos.x, pos.y, size.width, size.height)?;
        if next_x != pos.x || next_y != pos.y {
            w.set_position(PhysicalPosition::new(next_x, next_y))
                .map_err(|e| format!("set_position: {e}"))?;
        }
        Ok(())
    }

    pub fn set_options(
        app: AppHandle,
        always_on_top: bool,
        locked: bool,
        show_taskbar: Option<bool>,
        always_on_top_loop: Option<bool>,
        lock_screen: Option<bool>,
    ) -> Result<(), String> {
        LOCKED.store(locked, Ordering::SeqCst);
        ALWAYS_ON_TOP.store(always_on_top, Ordering::SeqCst);
        if let Some(v) = show_taskbar {
            SHOW_TASKBAR.store(v, Ordering::SeqCst);
        }
        if let Some(v) = always_on_top_loop {
            ALWAYS_ON_TOP_LOOP.store(v, Ordering::SeqCst);
        }
        if let Some(v) = lock_screen {
            LOCK_SCREEN.store(v, Ordering::SeqCst);
        }
        POLICY_GEN.fetch_add(1, Ordering::SeqCst);
        let w = app
            .get_webview_window("desktop-lyric")
            .ok_or_else(|| "桌面歌词窗口未打开".to_string())?;
        w.set_always_on_top(always_on_top)
            .map_err(|e| format!("set_always_on_top: {e}"))?;
        w.set_resizable(!locked)
            .map_err(|e| format!("set_resizable: {e}"))?;
        if let Some(v) = show_taskbar {
            w.set_skip_taskbar(!v)
                .map_err(|e| format!("set_skip_taskbar: {e}"))?;
        }
        if always_on_top && ALWAYS_ON_TOP_LOOP.load(Ordering::SeqCst) {
            ensure_always_on_top_loop(app.clone());
        }
        // 锁定状态影响穿透热区，立即重算
        if PENETRATE_ENABLED.load(Ordering::SeqCst) {
            apply_cursor_hit(&app, cursor_hit(&app));
        }
        if LOCK_SCREEN.load(Ordering::SeqCst) {
            let _ = clamp_to_screen(app);
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
            let (next_x, next_y, next_w, next_h) = if let (Some(x), Some(y)) = (x, y) {
                clamp_bounds_to_screen(&w, x, y, width, height)?
            } else {
                let pos = w
                    .outer_position()
                    .map_err(|e| format!("outer_position: {e}"))?;
                clamp_bounds_to_screen(&w, pos.x, pos.y, width, height)?
            };
            w.set_size(PhysicalSize::new(next_w.max(240), next_h.max(80)))
                .map_err(|e| format!("set_size: {e}"))?;
            w.set_position(PhysicalPosition::new(next_x, next_y))
                .map_err(|e| format!("set_position: {e}"))?;
            return Ok(());
        }
        if let (Some(x), Some(y)) = (x, y) {
            let (next_x, next_y) = if LOCK_SCREEN.load(Ordering::SeqCst) {
                let size = w
                    .outer_size()
                    .map_err(|e| format!("outer_size: {e}"))?;
                let clamped = clamp_bounds_to_screen(&w, x, y, size.width, size.height)?;
                (clamped.0, clamped.1)
            } else {
                (x, y)
            };
            w.set_position(PhysicalPosition::new(next_x, next_y))
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

    pub fn is_open(app: &AppHandle) -> bool {
        app.get_webview_window("desktop-lyric")
            .map(|w| w.is_visible().unwrap_or(false))
            .unwrap_or(false)
    }
}

#[tauri::command]
pub async fn open_desktop_lyric_window(
    app: tauri::AppHandle,
    width: Option<f64>,
    height: Option<f64>,
    x: Option<f64>,
    y: Option<f64>,
    show_taskbar: Option<bool>,
    always_on_top: Option<bool>,
    always_on_top_loop: Option<bool>,
    lock_screen: Option<bool>,
) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        return imp::open(
            app,
            width,
            height,
            x,
            y,
            show_taskbar,
            always_on_top,
            always_on_top_loop,
            lock_screen,
        )
        .await;
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (
            app,
            width,
            height,
            x,
            y,
            show_taskbar,
            always_on_top,
            always_on_top_loop,
            lock_screen,
        );
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
    show_taskbar: Option<bool>,
    always_on_top_loop: Option<bool>,
    lock_screen: Option<bool>,
) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        return imp::set_options(
            app,
            always_on_top,
            locked,
            show_taskbar,
            always_on_top_loop,
            lock_screen,
        );
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (
            app,
            always_on_top,
            locked,
            show_taskbar,
            always_on_top_loop,
            lock_screen,
        );
        Err("桌面歌词仅桌面端可用".into())
    }
}

#[tauri::command]
pub fn clamp_desktop_lyric_to_screen(app: tauri::AppHandle) -> Result<(), String> {
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
        return imp::is_open(&app);
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = app;
        false
    }
}

#[tauri::command]
pub async fn precreate_desktop_lyric_window(
    app: tauri::AppHandle,
    width: Option<f64>,
    height: Option<f64>,
    x: Option<f64>,
    y: Option<f64>,
    show_taskbar: Option<bool>,
    always_on_top: Option<bool>,
    always_on_top_loop: Option<bool>,
    lock_screen: Option<bool>,
) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        return imp::ensure_created(
            &app, width, height, x, y,
            show_taskbar, always_on_top, always_on_top_loop, lock_screen,
        ).await;
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (app, width, height, x, y, show_taskbar, always_on_top, always_on_top_loop, lock_screen);
        Err("桌面歌词仅 Windows/macOS/Linux 可用".into())
    }
}

#[tauri::command]
pub fn destroy_desktop_lyric_window(app: tauri::AppHandle) {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    imp::destroy(app);
    #[cfg(any(target_os = "android", target_os = "ios"))]
    let _ = app;
}
