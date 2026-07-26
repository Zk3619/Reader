//! 桌面悬浮歌词第二窗口
//!
//! Windows：禁止在同步 command 里 `WebviewWindowBuilder::build()`，否则易死锁白屏。
//! 鼠标穿透：全局光标轮询；窗内默认穿透；未锁定时顶栏热区可点；
//! 锁定时仅解锁按钮热区可点；「无视顶栏」时整窗穿透且不亮任何控制（含解锁）。

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod imp {
    use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
    use std::sync::Mutex;
    use std::thread;
    use std::time::Duration;

    use tauri::{
        AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, PhysicalSize, Size, WebviewUrl,
        WebviewWindowBuilder,
    };

    /// 五个播放控制按钮并排时的顶栏最小宽度（逻辑像素，与前端 h-9 w-9 × 5 对齐）
    const MIN_WINDOW_WIDTH: u32 = 180;
    const MIN_WINDOW_HEIGHT: u32 = 80;
    /// 穿透模式下顶栏可点热区默认高度（逻辑像素，单行按钮）
    const DEFAULT_CHROME_HEIGHT_PX: u32 = 36;

    static PENETRATE_ENABLED: AtomicBool = AtomicBool::new(false);
    static IGNORE_CHROME: AtomicBool = AtomicBool::new(false);
    static LOCKED: AtomicBool = AtomicBool::new(false);
    static SHOW_TASKBAR: AtomicBool = AtomicBool::new(false);
    static ALWAYS_ON_TOP: AtomicBool = AtomicBool::new(true);
    static ALWAYS_ON_TOP_LOOP: AtomicBool = AtomicBool::new(false);
    static LOCK_SCREEN: AtomicBool = AtomicBool::new(false);
    /// true = 工作区（任务栏之上）；false = 真实屏幕边缘
    static LOCK_SCREEN_USE_WORK_AREA: AtomicBool = AtomicBool::new(true);
    /// 穿透模式下顶栏热区高度（逻辑像素），由前端按实际顶栏高度上报
    static CHROME_HEIGHT_PX: AtomicU32 = AtomicU32::new(DEFAULT_CHROME_HEIGHT_PX);
    /// 动态最小高度（逻辑像素）；单/双行含副歌词时由前端上调，避免 OS 缩放到固定 80
    static MIN_HEIGHT_LOGICAL: AtomicU32 = AtomicU32::new(MIN_WINDOW_HEIGHT);
    static SUPERVISOR_STARTED: AtomicBool = AtomicBool::new(false);
    static ALWAYS_ON_TOP_LOOP_STARTED: AtomicBool = AtomicBool::new(false);
    /// 用户正在拖/缩：跳过 lockScreen clamp，避免与 OS 拖动 / 每帧 set_bounds 互拉导致抖动
    static INTERACTING: AtomicBool = AtomicBool::new(false);
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

    fn current_min_height_logical() -> u32 {
        MIN_HEIGHT_LOGICAL
            .load(Ordering::SeqCst)
            .max(MIN_WINDOW_HEIGHT)
    }

    fn apply_min_size(window: &tauri::WebviewWindow) {
        let _ = window.set_min_size(Some(Size::Logical(LogicalSize::new(
            MIN_WINDOW_WIDTH as f64,
            current_min_height_logical() as f64,
        ))));
    }

    /// 前端按布局/副歌词内容上报最小高度（逻辑像素）
    pub fn set_min_height(app: AppHandle, height_px: f64) -> Result<(), String> {
        let h = height_px
            .round()
            .clamp(MIN_WINDOW_HEIGHT as f64, 4000.0) as u32;
        MIN_HEIGHT_LOGICAL.store(h, Ordering::SeqCst);
        if let Some(w) = app.get_webview_window("desktop-lyric") {
            apply_min_size(&w);
            // 若当前已低于新下限则抬高（不改位置）
            let _ = enforce_min_size(&w);
        }
        Ok(())
    }

    /// 若当前尺寸小于最小值则放大（修复旧会话过窄几何 / 缺 min_size 的预创建窗）
    fn enforce_min_size(window: &tauri::WebviewWindow) -> Result<(), String> {
        apply_min_size(window);
        let (min_w, min_h) = min_physical_size(window);
        let size = window
            .outer_size()
            .map_err(|e| format!("outer_size: {e}"))?;
        if size.width >= min_w && size.height >= min_h {
            return Ok(());
        }
        let pos = window
            .outer_position()
            .map_err(|e| format!("outer_position: {e}"))?;
        apply_bounds(
            window,
            pos.x,
            pos.y,
            size.width.max(min_w),
            size.height.max(min_h),
        )
    }

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
            if let Some(w) = app.get_webview_window("desktop-lyric") {
                let _ = enforce_min_size(&w);
            }
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
        let w = width.unwrap_or(600.0).clamp(MIN_WINDOW_WIDTH as f64, 4000.0);
        let h = height.unwrap_or(200.0).clamp(MIN_WINDOW_HEIGHT as f64, 2000.0);
        let on_top = ALWAYS_ON_TOP.load(Ordering::SeqCst);
        let mut builder = WebviewWindowBuilder::new(
            app,
            "desktop-lyric",
            WebviewUrl::App("index.html#lyric-desktop".into()),
        )
        .title("歌词")
        .inner_size(w, h)
        .min_inner_size(MIN_WINDOW_WIDTH as f64, current_min_height_logical() as f64)
        .always_on_top(on_top)
        .decorations(false)
        // 仅用前端自定义缩放手柄，避免 OS 边框沿用固定 80 下限、绕过副歌词下限
        .resizable(false)
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
        if let Some(w) = app.get_webview_window("desktop-lyric") {
            apply_min_size(&w);
        }
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
            let _ = enforce_min_size(&w);
            w.show().map_err(|e| format!("show: {e}"))?;
        }
        Ok(())
    }

    pub fn close(app: AppHandle) {
        INTERACTING.store(false, Ordering::SeqCst);
        PENETRATE_ENABLED.store(false, Ordering::SeqCst);
        IGNORE_CHROME.store(false, Ordering::SeqCst);
        if let Some(w) = app.get_webview_window("desktop-lyric") {
            let _ = w.set_ignore_cursor_events(false);
            let _ = w.hide();
        }
    }

    pub fn destroy(app: AppHandle) {
        INTERACTING.store(false, Ordering::SeqCst);
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

        // 锁定：仅左上解锁按钮（约 36×36 逻辑像素）可拦截
        if LOCKED.load(Ordering::SeqCst) {
            let unlock_w = ((40.0_f64 * scale).round() as i32).max(32);
            let unlock_h = ((40.0_f64 * scale).round() as i32).max(32);
            if cx < x0.saturating_add(unlock_w) && cy < y0.saturating_add(unlock_h) {
                return CursorHit::Chrome;
            }
            return CursorHit::Body;
        }

        // 未锁定：热区高度跟随前端上报的顶栏实际高度（避免多余死区或漏点）
        let logical_h = CHROME_HEIGHT_PX
            .load(Ordering::SeqCst)
            .max(DEFAULT_CHROME_HEIGHT_PX) as f64;
        let chrome_h = ((logical_h * scale).round() as i32).max(32);
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
        if INTERACTING.load(Ordering::SeqCst) {
            return;
        }
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

    /// 前端上报顶栏实际高度（逻辑像素），用于穿透热区。
    pub fn set_chrome_height(height_px: f64) {
        let h = height_px.round().clamp(8.0, 400.0) as u32;
        let prev = CHROME_HEIGHT_PX.swap(h.max(8), Ordering::SeqCst);
        if prev != h {
            POLICY_GEN.fetch_add(1, Ordering::SeqCst);
        }
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

    pub fn set_interacting(interacting: bool) {
        INTERACTING.store(interacting, Ordering::SeqCst);
    }

    fn resolve_monitor(
        window: &tauri::WebviewWindow,
        x: i32,
        y: i32,
    ) -> Option<tauri::Monitor> {
        // 先按目标点选屏，避免 current_monitor 在跨屏边缘来回跳导致 clamp 目标抖动
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

    fn monitor_clamp_rect(monitor: &tauri::Monitor) -> (i32, i32, u32, u32) {
        if LOCK_SCREEN_USE_WORK_AREA.load(Ordering::SeqCst) {
            let area = monitor.work_area();
            (
                area.position.x,
                area.position.y,
                area.size.width,
                area.size.height,
            )
        } else {
            let pos = monitor.position();
            let size = monitor.size();
            (pos.x, pos.y, size.width, size.height)
        }
    }

    fn min_physical_size(window: &tauri::WebviewWindow) -> (u32, u32) {
        let scale = window.scale_factor().unwrap_or(1.0).max(0.5);
        let min_h = current_min_height_logical();
        (
            ((MIN_WINDOW_WIDTH as f64) * scale).round().max(1.0) as u32,
            ((min_h as f64) * scale).round().max(1.0) as u32,
        )
    }

    /// 始终保证不小于五按钮最小宽；锁定屏幕时再夹到可用区域。
    fn clamp_bounds_to_screen(
        window: &tauri::WebviewWindow,
        x: i32,
        y: i32,
        width: u32,
        height: u32,
    ) -> Result<(i32, i32, u32, u32), String> {
        let (min_w, min_h) = min_physical_size(window);
        if !LOCK_SCREEN.load(Ordering::SeqCst) {
            return Ok((x, y, width.max(min_w), height.max(min_h)));
        }
        let Some(monitor) = resolve_monitor(window, x, y) else {
            return Ok((x, y, width.max(min_w), height.max(min_h)));
        };
        let (area_x, area_y, area_w, area_h) = monitor_clamp_rect(&monitor);
        let max_w = area_w.max(min_w);
        let max_h = area_h.max(min_h);
        let width = width.clamp(min_w, max_w);
        let height = height.clamp(min_h, max_h);
        let max_x = area_x + max_w as i32 - width as i32;
        let max_y = area_y + max_h as i32 - height as i32;
        let x = x.clamp(area_x, max_x.max(area_x));
        let y = y.clamp(area_y, max_y.max(area_y));
        Ok((x, y, width, height))
    }

    /// Windows：一次 SetWindowPos 同时改位置与尺寸，避免分两次 set 导致左/上边缘闪烁。
    #[cfg(windows)]
    fn apply_bounds(
        window: &tauri::WebviewWindow,
        x: i32,
        y: i32,
        width: u32,
        height: u32,
    ) -> Result<(), String> {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{
            SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER,
        };
        let (min_w, min_h) = min_physical_size(window);
        let hwnd = window.hwnd().map_err(|e| format!("hwnd: {e}"))?;
        let ok = unsafe {
            SetWindowPos(
                HWND(hwnd.0),
                None,
                x,
                y,
                width.max(min_w) as i32,
                height.max(min_h) as i32,
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
        let (min_w, min_h) = min_physical_size(window);
        window
            .set_position(PhysicalPosition::new(x, y))
            .map_err(|e| format!("set_position: {e}"))?;
        window
            .set_size(PhysicalSize::new(width.max(min_w), height.max(min_h)))
            .map_err(|e| format!("set_size: {e}"))?;
        Ok(())
    }

    pub fn clamp_to_screen(app: AppHandle) -> Result<(), String> {
        // 用户拖/缩中跳过被动 clamp，避免与主动 set_bounds 互拉
        if !LOCK_SCREEN.load(Ordering::SeqCst) || INTERACTING.load(Ordering::SeqCst) {
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
        let (next_x, next_y, next_w, next_h) =
            clamp_bounds_to_screen(&w, pos.x, pos.y, size.width, size.height)?;
        if next_x != pos.x || next_y != pos.y || next_w != size.width || next_h != size.height {
            apply_bounds(&w, next_x, next_y, next_w, next_h)?;
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
        lock_screen_use_work_area: Option<bool>,
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
        if let Some(v) = lock_screen_use_work_area {
            LOCK_SCREEN_USE_WORK_AREA.store(v, Ordering::SeqCst);
        }
        POLICY_GEN.fetch_add(1, Ordering::SeqCst);
        let w = app
            .get_webview_window("desktop-lyric")
            .ok_or_else(|| "桌面歌词窗口未打开".to_string())?;
        w.set_always_on_top(always_on_top)
            .map_err(|e| format!("set_always_on_top: {e}"))?;
        // 始终关闭 OS 缩放：高度下限由前端 set_min_size / 自定义手柄负责（含翻译/罗马音）
        w.set_resizable(false)
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
pub fn set_desktop_lyric_chrome_height(height_px: f64) {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    imp::set_chrome_height(height_px);
    #[cfg(any(target_os = "android", target_os = "ios"))]
    let _ = height_px;
}

#[tauri::command]
pub fn set_desktop_lyric_min_height(app: tauri::AppHandle, height_px: f64) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        return imp::set_min_height(app, height_px);
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (app, height_px);
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
    lock_screen_use_work_area: Option<bool>,
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
            lock_screen_use_work_area,
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
            lock_screen_use_work_area,
        );
        Err("桌面歌词仅桌面端可用".into())
    }
}

#[tauri::command]
pub fn set_desktop_lyric_interacting(interacting: bool) {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    imp::set_interacting(interacting);
    #[cfg(any(target_os = "android", target_os = "ios"))]
    let _ = interacting;
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
