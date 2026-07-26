//! 桌面迷你播放窗（对齐 MusicFree MiniMode）

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod imp {
    use std::sync::atomic::{AtomicBool, AtomicI32, AtomicU32, AtomicU8, Ordering};
    use tauri::{
        AppHandle, LogicalSize, Manager, PhysicalPosition, Size, WebviewUrl, WebviewWindowBuilder,
    };
    #[cfg(not(windows))]
    use tauri::PhysicalSize;

    const LABEL: &str = "music-mini-player";
    const MIN_WINDOW_WIDTH: u32 = 280;
    const MIN_WINDOW_HEIGHT: u32 = 64;
    /// 贴边收起后细条厚度（逻辑像素）：左右收起时为宽度，上下收起时为高度
    const EDGE_PEEK_LOGICAL: f64 = 14.0;
    /// 收起 / 展开动画时长与步数
    const EDGE_ANIM_MS: u64 = 170;
    const EDGE_ANIM_STEPS: u32 = 14;

    static LOCK_SCREEN: AtomicBool = AtomicBool::new(cfg!(windows));
    /// true = 工作区（任务栏之上）；false = 真实屏幕边缘
    static LOCK_SCREEN_USE_WORK_AREA: AtomicBool = AtomicBool::new(true);
    /// 贴边自动收起：拖到边界后仍外推时，松手收起（左/右/顶/底）
    static EDGE_AUTO_HIDE: AtomicBool = AtomicBool::new(true);
    /// 用户正在拖/缩：跳过被动 clamp，避免与主动 set_bounds 互拉
    static INTERACTING: AtomicBool = AtomicBool::new(false);
    /// 贴边收起态：窗口缩为贴边细条
    static EDGE_COLLAPSED: AtomicBool = AtomicBool::new(false);
    /// 0=none 1=left 2=right 3=top 4=bottom
    static EDGE_SIDE: AtomicU8 = AtomicU8::new(0);
    /// 收起 / 展开动画代号：新动画作废旧动画
    static ANIM_GEN: AtomicU32 = AtomicU32::new(0);
    /// 动画进行中：跳过最小尺寸夹紧，否则中间帧会被顶回最小宽高
    static ANIMATING: AtomicBool = AtomicBool::new(false);
    /// 本轮拖拽期间累计的最大外推量（物理像素）
    static DRAG_MAX_OUTWARD_LEFT: AtomicI32 = AtomicI32::new(0);
    static DRAG_MAX_OUTWARD_RIGHT: AtomicI32 = AtomicI32::new(0);
    static DRAG_MAX_OUTWARD_TOP: AtomicI32 = AtomicI32::new(0);
    static DRAG_MAX_OUTWARD_BOTTOM: AtomicI32 = AtomicI32::new(0);
    /// 本轮拖拽是否曾顶住各边界
    static DRAG_FLUSH_LEFT: AtomicBool = AtomicBool::new(false);
    static DRAG_FLUSH_RIGHT: AtomicBool = AtomicBool::new(false);
    static DRAG_FLUSH_TOP: AtomicBool = AtomicBool::new(false);
    static DRAG_FLUSH_BOTTOM: AtomicBool = AtomicBool::new(false);
    /// 收起前展开态几何（物理像素），用于还原
    static SAVED_X: AtomicI32 = AtomicI32::new(0);
    static SAVED_Y: AtomicI32 = AtomicI32::new(0);
    static SAVED_W: AtomicU32 = AtomicU32::new(0);
    static SAVED_H: AtomicU32 = AtomicU32::new(0);
    static HAS_SAVED_BOUNDS: AtomicBool = AtomicBool::new(false);

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
            // 点已越出某屏时：选中心距该点最近的显示器，避免 clamp 失效
            let mut best: Option<(i64, tauri::Monitor)> = None;
            for m in &monitors {
                let pos = m.position();
                let size = m.size();
                let cx = pos.x + size.width as i32 / 2;
                let cy = pos.y + size.height as i32 / 2;
                let dist = (i64::from(cx) - i64::from(x)).pow(2)
                    + (i64::from(cy) - i64::from(y)).pow(2);
                if best.as_ref().map(|(d, _)| dist < *d).unwrap_or(true) {
                    best = Some((dist, m.clone()));
                }
            }
            if let Some((_, m)) = best {
                return Some(m);
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
        // 收起态 / 动画中：细条可以很薄，不能按展开态最小尺寸夹
        if EDGE_COLLAPSED.load(Ordering::SeqCst) || ANIMATING.load(Ordering::SeqCst) {
            let peek = (EDGE_PEEK_LOGICAL * scale).round().max(8.0) as u32;
            return (peek, peek);
        }
        (
            ((MIN_WINDOW_WIDTH as f64) * scale).round().max(1.0) as u32,
            ((MIN_WINDOW_HEIGHT as f64) * scale).round().max(1.0) as u32,
        )
    }

    fn edge_peek_physical(window: &tauri::WebviewWindow) -> u32 {
        let scale = window.scale_factor().unwrap_or(1.0).max(0.5);
        (EDGE_PEEK_LOGICAL * scale).round().max(8.0) as u32
    }

    fn apply_normal_min_size(window: &tauri::WebviewWindow) {
        let _ = window.set_min_size(Some(Size::Logical(LogicalSize::new(
            MIN_WINDOW_WIDTH as f64,
            MIN_WINDOW_HEIGHT as f64,
        ))));
    }

    fn apply_collapsed_min_size(window: &tauri::WebviewWindow) {
        let _ = window.set_min_size(Some(Size::Logical(LogicalSize::new(
            EDGE_PEEK_LOGICAL,
            EDGE_PEEK_LOGICAL,
        ))));
    }

    /// 在主线程上按缓动逐帧改窗口几何，做出收起 / 展开动画。
    /// `on_done` 在最后一帧后于主线程执行（用于恢复最小尺寸等收尾）。
    fn animate_bounds(
        app: AppHandle,
        from: (i32, i32, u32, u32),
        to: (i32, i32, u32, u32),
        on_done: impl FnOnce(&tauri::WebviewWindow) + Send + 'static,
    ) {
        let gen = ANIM_GEN.fetch_add(1, Ordering::SeqCst) + 1;
        ANIMATING.store(true, Ordering::SeqCst);
        std::thread::spawn(move || {
            let step_ms = (EDGE_ANIM_MS / EDGE_ANIM_STEPS as u64).max(8);
            for i in 1..=EDGE_ANIM_STEPS {
                if ANIM_GEN.load(Ordering::SeqCst) != gen {
                    return;
                }
                let t = i as f64 / EDGE_ANIM_STEPS as f64;
                // ease-out cubic
                let e = 1.0 - (1.0 - t).powi(3);
                let lerp_i = |a: i32, b: i32| a + (((b - a) as f64) * e).round() as i32;
                let lerp_u = |a: u32, b: u32| {
                    let a = a as f64;
                    (a + ((b as f64) - a) * e).round().max(1.0) as u32
                };
                let frame = (
                    lerp_i(from.0, to.0),
                    lerp_i(from.1, to.1),
                    lerp_u(from.2, to.2),
                    lerp_u(from.3, to.3),
                );
                let app_frame = app.clone();
                let _ = app.run_on_main_thread(move || {
                    if let Some(w) = app_frame.get_webview_window(LABEL) {
                        let _ = apply_bounds_raw(&w, frame.0, frame.1, frame.2, frame.3);
                    }
                });
                std::thread::sleep(std::time::Duration::from_millis(step_ms));
            }
            if ANIM_GEN.load(Ordering::SeqCst) != gen {
                return;
            }
            let app_end = app.clone();
            let _ = app.run_on_main_thread(move || {
                if let Some(w) = app_end.get_webview_window(LABEL) {
                    let _ = apply_bounds_raw(&w, to.0, to.1, to.2, to.3);
                    ANIMATING.store(false, Ordering::SeqCst);
                    on_done(&w);
                } else {
                    ANIMATING.store(false, Ordering::SeqCst);
                }
            });
        });
    }

    fn remember_expanded_bounds(x: i32, y: i32, width: u32, height: u32) {
        // 避免把收起细条尺寸记成展开尺寸
        if width < MIN_WINDOW_WIDTH || height < MIN_WINDOW_HEIGHT {
            return;
        }
        SAVED_X.store(x, Ordering::SeqCst);
        SAVED_Y.store(y, Ordering::SeqCst);
        SAVED_W.store(width, Ordering::SeqCst);
        SAVED_H.store(height, Ordering::SeqCst);
        HAS_SAVED_BOUNDS.store(true, Ordering::SeqCst);
    }

    /// 夹紧结果 + 相对四条边界的外推量（物理像素）
    struct ClampOutcome {
        x: i32,
        y: i32,
        width: u32,
        height: u32,
        outward_left: i32,
        outward_right: i32,
        outward_top: i32,
        outward_bottom: i32,
    }

    /// 相对可用区域计算夹紧结果，以及相对四边的外推量（物理像素）。
    fn clamp_against_monitor(
        window: &tauri::WebviewWindow,
        x: i32,
        y: i32,
        width: u32,
        height: u32,
    ) -> Result<ClampOutcome, String> {
        let (min_w, min_h) = min_physical_size(window);
        let width = width.max(min_w);
        let height = height.max(min_h);
        let probe_x = x + width as i32 / 2;
        let probe_y = y + height as i32 / 2;
        let Some(monitor) = resolve_monitor(window, probe_x, probe_y) else {
            return Ok(ClampOutcome {
                x,
                y,
                width,
                height,
                outward_left: 0,
                outward_right: 0,
                outward_top: 0,
                outward_bottom: 0,
            });
        };
        let (area_x, area_y, area_w, area_h) = monitor_clamp_rect(&monitor);
        let max_w = area_w.max(min_w);
        let max_h = area_h.max(min_h);
        let width = width.clamp(min_w, max_w);
        let height = height.clamp(min_h, max_h);
        let max_x = area_x + max_w as i32 - width as i32;
        let max_y = area_y + max_h as i32 - height as i32;
        let clamped_x = x.clamp(area_x, max_x.max(area_x));
        let clamped_y = y.clamp(area_y, max_y.max(area_y));
        Ok(ClampOutcome {
            x: clamped_x,
            y: clamped_y,
            width,
            height,
            outward_left: (area_x - x).max(0),
            outward_right: (x - max_x.max(area_x)).max(0),
            outward_top: (area_y - y).max(0),
            outward_bottom: (y - max_y.max(area_y)).max(0),
        })
    }

    /// 始终保证不小于最小宽；锁定屏幕 / 贴边收起开启且非收起态时夹到可用区域。
    fn clamp_bounds_to_screen(
        window: &tauri::WebviewWindow,
        x: i32,
        y: i32,
        width: u32,
        height: u32,
    ) -> Result<(i32, i32, u32, u32), String> {
        let (min_w, min_h) = min_physical_size(window);
        let width = width.max(min_w);
        let height = height.max(min_h);
        // 贴边收起态允许越界露出细条
        if EDGE_COLLAPSED.load(Ordering::SeqCst) {
            return Ok((x, y, width, height));
        }
        if !LOCK_SCREEN.load(Ordering::SeqCst) && !EDGE_AUTO_HIDE.load(Ordering::SeqCst) {
            return Ok((x, y, width, height));
        }
        let c = clamp_against_monitor(window, x, y, width, height)?;
        Ok((c.x, c.y, c.width, c.height))
    }

    #[cfg(windows)]
    fn apply_bounds_raw(
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
                width.max(1) as i32,
                height.max(1) as i32,
                SWP_NOZORDER | SWP_NOACTIVATE,
            )
        };
        ok.map_err(|e| format!("SetWindowPos: {e}"))?;
        Ok(())
    }

    #[cfg(not(windows))]
    fn apply_bounds_raw(
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
            .set_size(PhysicalSize::new(width.max(1), height.max(1)))
            .map_err(|e| format!("set_size: {e}"))?;
        Ok(())
    }

    fn apply_bounds(
        window: &tauri::WebviewWindow,
        x: i32,
        y: i32,
        width: u32,
        height: u32,
    ) -> Result<(), String> {
        let (min_w, min_h) = min_physical_size(window);
        apply_bounds_raw(window, x, y, width.max(min_w), height.max(min_h))
    }

    pub fn set_interacting(interacting: bool) {
        INTERACTING.store(interacting, Ordering::SeqCst);
        if interacting {
            DRAG_MAX_OUTWARD_LEFT.store(0, Ordering::SeqCst);
            DRAG_MAX_OUTWARD_RIGHT.store(0, Ordering::SeqCst);
            DRAG_MAX_OUTWARD_TOP.store(0, Ordering::SeqCst);
            DRAG_MAX_OUTWARD_BOTTOM.store(0, Ordering::SeqCst);
            DRAG_FLUSH_LEFT.store(false, Ordering::SeqCst);
            DRAG_FLUSH_RIGHT.store(false, Ordering::SeqCst);
            DRAG_FLUSH_TOP.store(false, Ordering::SeqCst);
            DRAG_FLUSH_BOTTOM.store(false, Ordering::SeqCst);
        }
    }

    #[derive(Clone, serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct DragBoundsResult {
        pub x: i32,
        pub y: i32,
        pub width: u32,
        pub height: u32,
        pub outward_left: i32,
        pub outward_right: i32,
        pub outward_top: i32,
        pub outward_bottom: i32,
        /// 窗口已顶住该侧边界且仍在向外推（含光标被系统钉在屏幕边缘的情况）
        pub press_left: bool,
        pub press_right: bool,
        pub press_top: bool,
        pub press_bottom: bool,
    }

    pub fn set_options(
        app: AppHandle,
        always_on_top: Option<bool>,
        lock_screen: Option<bool>,
        lock_screen_use_work_area: Option<bool>,
        edge_auto_hide: Option<bool>,
    ) -> Result<(), String> {
        if let Some(v) = lock_screen {
            LOCK_SCREEN.store(v, Ordering::SeqCst);
        }
        if let Some(v) = lock_screen_use_work_area {
            LOCK_SCREEN_USE_WORK_AREA.store(v, Ordering::SeqCst);
        }
        if let Some(v) = edge_auto_hide {
            EDGE_AUTO_HIDE.store(v, Ordering::SeqCst);
        }
        if let Some(w) = app.get_webview_window(LABEL) {
            if let Some(on_top) = always_on_top {
                w.set_always_on_top(on_top)
                    .map_err(|e| format!("set_always_on_top: {e}"))?;
            }
        }
        if LOCK_SCREEN.load(Ordering::SeqCst) && !EDGE_COLLAPSED.load(Ordering::SeqCst) {
            let _ = clamp_to_screen(app);
        }
        Ok(())
    }

    /// 拖拽帧：按 lock / 贴边收起策略夹紧，并累计外推量供松手判定。
    pub fn set_bounds_for_drag(
        app: AppHandle,
        x: i32,
        y: i32,
        width: u32,
        height: u32,
    ) -> Result<DragBoundsResult, String> {
        let w = app
            .get_webview_window(LABEL)
            .ok_or_else(|| "迷你播放窗未创建".to_string())?;
        let c = clamp_against_monitor(&w, x, y, width, height)?;
        let (cx, cy, cw, ch) = (c.x, c.y, c.width, c.height);
        let lock = LOCK_SCREEN.load(Ordering::SeqCst);
        let edge_hide = EDGE_AUTO_HIDE.load(Ordering::SeqCst);
        // 贴边收起或锁定时四向夹紧，才能产生「顶边后仍外推」的差值
        let clamp_all = lock || edge_hide;
        let apply_x = if clamp_all { cx } else { x };
        let apply_y = if clamp_all { cy } else { y };
        apply_bounds(&w, apply_x, apply_y, cw, ch)?;

        if let Some(monitor) = resolve_monitor(&w, apply_x + cw as i32 / 2, apply_y + ch as i32 / 2)
        {
            let (area_x, area_y, area_w, area_h) = monitor_clamp_rect(&monitor);
            if apply_x <= area_x + 1 {
                DRAG_FLUSH_LEFT.store(true, Ordering::SeqCst);
            }
            if apply_x + cw as i32 >= area_x + area_w as i32 - 1 {
                DRAG_FLUSH_RIGHT.store(true, Ordering::SeqCst);
            }
            if apply_y <= area_y + 1 {
                DRAG_FLUSH_TOP.store(true, Ordering::SeqCst);
            }
            if apply_y + ch as i32 >= area_y + area_h as i32 - 1 {
                DRAG_FLUSH_BOTTOM.store(true, Ordering::SeqCst);
            }
        }

        // 请求位置相对夹紧位置的外推（不依赖光标；钉边后 movement=0 也能保留历史最大值）
        let accumulate = |cell: &AtomicI32, value: i32| {
            if value > cell.load(Ordering::SeqCst) {
                cell.store(value, Ordering::SeqCst);
            }
            cell.load(Ordering::SeqCst)
        };
        let max_l = accumulate(
            &DRAG_MAX_OUTWARD_LEFT,
            c.outward_left.max((cx - x).max(0)),
        );
        let max_r = accumulate(
            &DRAG_MAX_OUTWARD_RIGHT,
            c.outward_right.max((x - cx).max(0)),
        );
        let max_t = accumulate(&DRAG_MAX_OUTWARD_TOP, c.outward_top.max((cy - y).max(0)));
        let max_b = accumulate(
            &DRAG_MAX_OUTWARD_BOTTOM,
            c.outward_bottom.max((y - cy).max(0)),
        );

        Ok(DragBoundsResult {
            x: apply_x,
            y: apply_y,
            width: cw,
            height: ch,
            outward_left: max_l,
            outward_right: max_r,
            outward_top: max_t,
            outward_bottom: max_b,
            press_left: DRAG_FLUSH_LEFT.load(Ordering::SeqCst) && max_l > 0,
            press_right: DRAG_FLUSH_RIGHT.load(Ordering::SeqCst) && max_r > 0,
            press_top: DRAG_FLUSH_TOP.load(Ordering::SeqCst) && max_t > 0,
            press_bottom: DRAG_FLUSH_BOTTOM.load(Ordering::SeqCst) && max_b > 0,
        })
    }

    /// 拖拽松手：判定是否贴边收起。返回 "left" | "right" | "top" | "bottom" | ""。
    /// 判定优先级：本轮外推累计 → 松手时窗口顶边且光标压在屏幕边缘。
    /// 后者可覆盖「光标被系统钉在边缘导致 movement 归零、外推没累计上」的情况。
    pub fn finish_drag(app: AppHandle) -> Result<String, String> {
        let out_l = DRAG_MAX_OUTWARD_LEFT.swap(0, Ordering::SeqCst);
        let out_r = DRAG_MAX_OUTWARD_RIGHT.swap(0, Ordering::SeqCst);
        let out_t = DRAG_MAX_OUTWARD_TOP.swap(0, Ordering::SeqCst);
        let out_b = DRAG_MAX_OUTWARD_BOTTOM.swap(0, Ordering::SeqCst);
        let flush_l = DRAG_FLUSH_LEFT.swap(false, Ordering::SeqCst);
        let flush_r = DRAG_FLUSH_RIGHT.swap(false, Ordering::SeqCst);
        let flush_t = DRAG_FLUSH_TOP.swap(false, Ordering::SeqCst);
        let flush_b = DRAG_FLUSH_BOTTOM.swap(false, Ordering::SeqCst);

        if !EDGE_AUTO_HIDE.load(Ordering::SeqCst) {
            return Ok(String::new());
        }

        let w = app
            .get_webview_window(LABEL)
            .ok_or_else(|| "迷你播放窗未创建".to_string())?;
        let scale = w.scale_factor().unwrap_or(1.0).max(0.5);
        let out_thresh = (8.0 * scale).round().max(6.0) as i32;

        // 松手时窗口的真实位置 + 光标位置，做同步兜底判定
        let (mut cur_flush_l, mut cur_flush_r, mut cur_flush_t, mut cur_flush_b) =
            (false, false, false, false);
        let (mut cursor_l, mut cursor_r, mut cursor_t, mut cursor_b) =
            (false, false, false, false);
        if let (Ok(pos), Ok(size)) = (w.outer_position(), w.outer_size()) {
            if let Some(monitor) =
                resolve_monitor(&w, pos.x + size.width as i32 / 2, pos.y + size.height as i32 / 2)
            {
                let (area_x, area_y, area_w, area_h) = monitor_clamp_rect(&monitor);
                let edge_slop = (2.0 * scale).round().max(2.0) as i32;
                cur_flush_l = pos.x <= area_x + edge_slop;
                cur_flush_r = pos.x + size.width as i32 >= area_x + area_w as i32 - edge_slop;
                cur_flush_t = pos.y <= area_y + edge_slop;
                cur_flush_b = pos.y + size.height as i32 >= area_y + area_h as i32 - edge_slop;
                let m_pos = monitor.position();
                let m_size = monitor.size();
                let cursor_slop = (2.0 * scale).round().max(2.0) as i32;
                if let Ok(c) = app.cursor_position() {
                    let cx = c.x.round() as i32;
                    let cy = c.y.round() as i32;
                    cursor_l = cx <= m_pos.x + cursor_slop;
                    cursor_r = cx >= m_pos.x + m_size.width as i32 - 1 - cursor_slop;
                    cursor_t = cy <= m_pos.y + cursor_slop;
                    cursor_b = cy >= m_pos.y + m_size.height as i32 - 1 - cursor_slop;
                }
            }
        }

        let want_left = (flush_l && out_l >= out_thresh) || (cur_flush_l && cursor_l);
        let want_right = (flush_r && out_r >= out_thresh) || (cur_flush_r && cursor_r);
        let want_top = (flush_t && out_t >= out_thresh) || (cur_flush_t && cursor_t);
        let want_bottom = (flush_b && out_b >= out_thresh) || (cur_flush_b && cursor_b);

        // 选外推量最大的一侧；平手时左右优先于上下
        let mut best_side = "";
        let mut best_score = 0i32;
        let consider = |side: &'static str, want: bool, score: i32, best_side: &mut &str, best_score: &mut i32| {
            if want && (score > *best_score || (*best_side).is_empty()) {
                *best_side = side;
                *best_score = score;
            }
        };
        consider("left", want_left, out_l.max(1), &mut best_side, &mut best_score);
        consider("right", want_right, out_r.max(1), &mut best_side, &mut best_score);
        consider("top", want_top, out_t.max(1), &mut best_side, &mut best_score);
        consider(
            "bottom",
            want_bottom,
            out_b.max(1),
            &mut best_side,
            &mut best_score,
        );

        if best_side.is_empty() {
            return Ok(String::new());
        }
        set_edge_collapsed(app, best_side, true)?;
        Ok(best_side.to_string())
    }

    pub fn clamp_to_screen(app: AppHandle) -> Result<(), String> {
        if !LOCK_SCREEN.load(Ordering::SeqCst)
            || INTERACTING.load(Ordering::SeqCst)
            || EDGE_COLLAPSED.load(Ordering::SeqCst)
        {
            return Ok(());
        }
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

    /// 贴边收起 / 展开。side: "left" | "right" | "top" | "bottom" | "none"
    /// `animate=false` 用于重启恢复：直接落到目标几何，避免先闪完整窗再收起。
    pub fn set_edge_collapsed(app: AppHandle, side: &str, animate: bool) -> Result<(), String> {
        let w = app
            .get_webview_window(LABEL)
            .ok_or_else(|| "迷你播放窗未创建".to_string())?;
        let pos = w
            .outer_position()
            .map_err(|e| format!("outer_position: {e}"))?;
        let size = w
            .outer_size()
            .map_err(|e| format!("outer_size: {e}"))?;
        let probe_x = pos.x + size.width as i32 / 2;
        let probe_y = pos.y + size.height as i32 / 2;
        let Some(monitor) = resolve_monitor(&w, probe_x, probe_y) else {
            EDGE_COLLAPSED.store(false, Ordering::SeqCst);
            EDGE_SIDE.store(0, Ordering::SeqCst);
            return Ok(());
        };
        let (area_x, area_y, area_w, area_h) = monitor_clamp_rect(&monitor);
        let from = (pos.x, pos.y, size.width, size.height);

        let apply_target = |app: AppHandle, to: (i32, i32, u32, u32), on_done: Box<dyn FnOnce(&tauri::WebviewWindow) + Send>| {
            if animate {
                animate_bounds(app, from, to, move |win| on_done(win));
            } else {
                ANIM_GEN.fetch_add(1, Ordering::SeqCst);
                ANIMATING.store(false, Ordering::SeqCst);
                let _ = apply_bounds_raw(&w, to.0, to.1, to.2, to.3);
                on_done(&w);
            }
        };

        match side {
            "left" | "right" | "top" | "bottom" => {
                if !EDGE_COLLAPSED.load(Ordering::SeqCst) {
                    remember_expanded_bounds(pos.x, pos.y, size.width, size.height);
                }
                apply_collapsed_min_size(&w);
                EDGE_COLLAPSED.store(true, Ordering::SeqCst);
                let side_code: u8 = match side {
                    "left" => 1,
                    "right" => 2,
                    "top" => 3,
                    _ => 4,
                };
                EDGE_SIDE.store(side_code, Ordering::SeqCst);

                let peek = edge_peek_physical(&w);
                let to = match side {
                    "left" => {
                        let height = size.height.max(peek).min(area_h);
                        let y = pos.y.clamp(area_y, area_y + area_h as i32 - height as i32);
                        (area_x, y, peek, height)
                    }
                    "right" => {
                        let height = size.height.max(peek).min(area_h);
                        let y = pos.y.clamp(area_y, area_y + area_h as i32 - height as i32);
                        (area_x + area_w as i32 - peek as i32, y, peek, height)
                    }
                    "top" => {
                        let width = size.width.max(peek).min(area_w);
                        let x = pos.x.clamp(area_x, area_x + area_w as i32 - width as i32);
                        (x, area_y, width, peek)
                    }
                    _ => {
                        let width = size.width.max(peek).min(area_w);
                        let x = pos.x.clamp(area_x, area_x + area_w as i32 - width as i32);
                        (
                            x,
                            area_y + area_h as i32 - peek as i32,
                            width,
                            peek,
                        )
                    }
                };
                apply_target(app, to, Box::new(|_| {}));
            }
            _ => {
                let side_code = EDGE_SIDE.load(Ordering::SeqCst);
                EDGE_COLLAPSED.store(false, Ordering::SeqCst);
                EDGE_SIDE.store(0, Ordering::SeqCst);

                // 展开过程中先放开最小尺寸，最后一帧再恢复正常最小尺寸
                apply_collapsed_min_size(&w);

                let (min_w, min_h) = (
                    ((MIN_WINDOW_WIDTH as f64) * w.scale_factor().unwrap_or(1.0).max(0.5))
                        .round()
                        .max(1.0) as u32,
                    ((MIN_WINDOW_HEIGHT as f64) * w.scale_factor().unwrap_or(1.0).max(0.5))
                        .round()
                        .max(1.0) as u32,
                );
                let (mut width, mut height) = if HAS_SAVED_BOUNDS.load(Ordering::SeqCst) {
                    (
                        SAVED_W.load(Ordering::SeqCst).max(min_w),
                        SAVED_H.load(Ordering::SeqCst).max(min_h),
                    )
                } else {
                    (size.width.max(min_w), size.height.max(min_h))
                };
                width = width.min(area_w).max(min_w);
                height = height.min(area_h).max(min_h);

                let max_x = area_x + area_w as i32 - width as i32;
                let max_y = area_y + area_h as i32 - height as i32;

                let (x, y) = if HAS_SAVED_BOUNDS.load(Ordering::SeqCst) {
                    (
                        SAVED_X
                            .load(Ordering::SeqCst)
                            .clamp(area_x, max_x.max(area_x)),
                        SAVED_Y
                            .load(Ordering::SeqCst)
                            .clamp(area_y, max_y.max(area_y)),
                    )
                } else {
                    match side_code {
                        1 => (area_x, pos.y.clamp(area_y, max_y.max(area_y))),
                        2 => (max_x.max(area_x), pos.y.clamp(area_y, max_y.max(area_y))),
                        3 => (pos.x.clamp(area_x, max_x.max(area_x)), area_y),
                        4 => (pos.x.clamp(area_x, max_x.max(area_x)), max_y.max(area_y)),
                        _ => {
                            let x = if probe_x < area_x + area_w as i32 / 2 {
                                area_x
                            } else {
                                max_x.max(area_x)
                            };
                            (x, pos.y.clamp(area_y, max_y.max(area_y)))
                        }
                    }
                };
                apply_target(
                    app,
                    (x, y, width, height),
                    Box::new(|win| {
                        apply_normal_min_size(win);
                    }),
                );
            }
        }
        Ok(())
    }

    /// 根据当前位置判断是否应贴边收起；返回 "left" | "right" | "top" | "bottom" | ""
    pub fn detect_edge_side(app: AppHandle) -> Result<String, String> {
        let w = app
            .get_webview_window(LABEL)
            .ok_or_else(|| "迷你播放窗未创建".to_string())?;
        let pos = w
            .outer_position()
            .map_err(|e| format!("outer_position: {e}"))?;
        let size = w
            .outer_size()
            .map_err(|e| format!("outer_size: {e}"))?;
        let Some(monitor) =
            resolve_monitor(&w, pos.x + size.width as i32 / 2, pos.y + size.height as i32 / 2)
        else {
            return Ok(String::new());
        };
        let (area_x, area_y, area_w, area_h) = monitor_clamp_rect(&monitor);
        let scale = w.scale_factor().unwrap_or(1.0).max(0.5);
        let threshold = (48.0 * scale).round() as i32;
        let left_gap = pos.x - area_x;
        let right_gap = (area_x + area_w as i32) - (pos.x + size.width as i32);
        let top_gap = pos.y - area_y;
        let bottom_gap = (area_y + area_h as i32) - (pos.y + size.height as i32);

        let mut best = "";
        let mut best_gap = i32::MAX;
        let consider = |side: &'static str, gap: i32, best: &mut &str, best_gap: &mut i32| {
            if gap <= threshold && gap < *best_gap {
                *best = side;
                *best_gap = gap;
            }
        };
        consider("left", left_gap, &mut best, &mut best_gap);
        consider("right", right_gap, &mut best, &mut best_gap);
        consider("top", top_gap, &mut best, &mut best_gap);
        consider("bottom", bottom_gap, &mut best, &mut best_gap);
        Ok(best.to_string())
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
                let scale = w.scale_factor().unwrap_or(1.0).max(0.5);
                let _ = set_bounds(
                    app.clone(),
                    Some((px * scale).round() as i32),
                    Some((py * scale).round() as i32),
                    Some((pw * scale).round() as u32),
                    Some((ph * scale).round() as u32),
                );
            }
            w.show().map_err(|e| format!("show: {e}"))?;
            EDGE_COLLAPSED.store(false, Ordering::SeqCst);
            EDGE_SIDE.store(0, Ordering::SeqCst);
            apply_normal_min_size(&w);
            clamp_to_screen(app)?;
        }
        Ok(())
    }

    pub fn close(app: AppHandle) {
        ANIM_GEN.fetch_add(1, Ordering::SeqCst);
        ANIMATING.store(false, Ordering::SeqCst);
        EDGE_COLLAPSED.store(false, Ordering::SeqCst);
        EDGE_SIDE.store(0, Ordering::SeqCst);
        if let Some(w) = app.get_webview_window(LABEL) {
            apply_normal_min_size(&w);
            let _ = w.hide();
        }
    }

    pub fn destroy(app: AppHandle) {
        ANIM_GEN.fetch_add(1, Ordering::SeqCst);
        ANIMATING.store(false, Ordering::SeqCst);
        EDGE_COLLAPSED.store(false, Ordering::SeqCst);
        EDGE_SIDE.store(0, Ordering::SeqCst);
        if let Some(w) = app.get_webview_window(LABEL) {
            let _ = w.close();
        }
    }

    pub fn is_open(app: &AppHandle) -> bool {
        app.get_webview_window(LABEL)
            .map(|w| w.is_visible().unwrap_or(false))
            .unwrap_or(false)
    }

    pub fn is_edge_collapsed() -> bool {
        EDGE_COLLAPSED.load(Ordering::SeqCst)
    }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub use imp::DragBoundsResult;

#[cfg(any(target_os = "android", target_os = "ios"))]
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DragBoundsResult {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub press_left: bool,
    pub press_right: bool,
    pub press_top: bool,
    pub press_bottom: bool,
    pub outward_left: i32,
    pub outward_right: i32,
    pub outward_top: i32,
    pub outward_bottom: i32,
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

#[tauri::command]
pub fn set_music_mini_player_options(
    app: tauri::AppHandle,
    always_on_top: Option<bool>,
    lock_screen: Option<bool>,
    lock_screen_use_work_area: Option<bool>,
    edge_auto_hide: Option<bool>,
) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        return imp::set_options(
            app,
            always_on_top,
            lock_screen,
            lock_screen_use_work_area,
            edge_auto_hide,
        );
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (
            app,
            always_on_top,
            lock_screen,
            lock_screen_use_work_area,
            edge_auto_hide,
        );
        Ok(())
    }
}

#[tauri::command]
pub fn set_music_mini_player_bounds_for_drag(
    app: tauri::AppHandle,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<DragBoundsResult, String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        return imp::set_bounds_for_drag(app, x, y, width, height);
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (app, x, y, width, height);
        Err("迷你播放窗仅桌面端可用".into())
    }
}

/// 拖拽松手后尝试贴边收起；返回 "left" | "right" | ""
#[tauri::command]
pub fn finish_music_mini_player_drag(app: tauri::AppHandle) -> Result<String, String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        return imp::finish_drag(app);
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = app;
        Ok(String::new())
    }
}

#[tauri::command]
pub fn set_music_mini_player_interacting(
    _app: tauri::AppHandle,
    interacting: bool,
) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        imp::set_interacting(interacting);
        return Ok(());
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = interacting;
        Ok(())
    }
}

#[tauri::command]
pub fn set_music_mini_player_edge_collapsed(
    app: tauri::AppHandle,
    side: String,
    animate: Option<bool>,
) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        return imp::set_edge_collapsed(app, side.as_str(), animate.unwrap_or(true));
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (app, side, animate);
        Ok(())
    }
}

#[tauri::command]
pub fn detect_music_mini_player_edge_side(app: tauri::AppHandle) -> Result<String, String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        return imp::detect_edge_side(app);
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = app;
        Ok(String::new())
    }
}

#[tauri::command]
pub fn is_music_mini_player_edge_collapsed(_app: tauri::AppHandle) -> bool {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        return imp::is_edge_collapsed();
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        false
    }
}
