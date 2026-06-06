//! 主窗口状态持久化：读写 exe 旁 `.window-state.json`（不依赖 window-state 插件）

use std::sync::atomic::AtomicU64;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
use std::sync::atomic::Ordering;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use std::path::PathBuf;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
use std::time::Duration;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri::{
    LogicalSize, Manager, Monitor, PhysicalPosition, PhysicalSize, Position, Size, State,
    WebviewWindow, WindowEvent,
};

pub const MAIN_WINDOW_LABEL: &str = "main";
const DEBOUNCE_MS: u64 = 400;
/// 等待窗口/DPI 就绪后再恢复（对齐官方 window-state 的 on_window_ready）
const RESTORE_DELAY_MS: u64 = 120;
const MIN_WINDOW_WIDTH: u32 = 240;
const MIN_WINDOW_HEIGHT: u32 = 180;

/// 内存缓存 + 恢复互斥 + 防抖序号
pub struct WindowStateStore {
    cache: Mutex<WindowStateInner>,
    /// 恢复期间阻止 Moved/Resized 污染缓存
    restoring: Mutex<()>,
    debounce_seq: AtomicU64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct WindowStateInner {
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    #[serde(default)]
    prev_x: i32,
    #[serde(default)]
    prev_y: i32,
    maximized: bool,
    visible: bool,
    /// 新格式为逻辑像素（与 tauri.conf width/height 一致）；旧存档无此字段时按物理像素恢复
    #[serde(default)]
    use_logical_size: bool,
}

impl Default for WindowStateInner {
    fn default() -> Self {
        Self {
            width: 0,
            height: 0,
            x: 0,
            y: 0,
            prev_x: 0,
            prev_y: 0,
            maximized: false,
            visible: true,
            use_logical_size: false,
        }
    }
}

impl WindowStateInner {
    fn normalize_prev_coords(&mut self) {
        if self.prev_x == 0 && self.prev_y == 0 {
            self.prev_x = self.x;
            self.prev_y = self.y;
        }
    }

    fn has_meaningful_size(&self) -> bool {
        self.width >= MIN_WINDOW_WIDTH && self.height >= MIN_WINDOW_HEIGHT
    }

    fn should_restore(&self) -> bool {
        self.has_meaningful_size() || self.maximized
    }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn window_state_file_path() -> Result<PathBuf, String> {
    crate::portable_paths::window_state_file_path()
}

/// 兼容官方插件 `{"main":{...}}` 与当前扁平格式
#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn load_from_disk() -> Result<Option<WindowStateInner>, String> {
    let path = window_state_file_path()?;
    if !path.exists() {
        return Ok(None);
    }
    let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let root: serde_json::Value =
        serde_json::from_str(&data).map_err(|e| format!("解析窗口状态失败: {e}"))?;

    let mut state: WindowStateInner = if let Some(main) = root.get(MAIN_WINDOW_LABEL) {
        serde_json::from_value(main.clone())
            .map_err(|e| format!("解析窗口状态 main 节点失败: {e}"))?
    } else {
        serde_json::from_value(root).map_err(|e| format!("解析窗口状态失败: {e}"))?
    };

    state.normalize_prev_coords();
    if !state.should_restore() {
        return Ok(None);
    }
    Ok(Some(state))
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn logical_size_from_window(window: &WebviewWindow) -> Result<(u32, u32), String> {
    let physical = window.inner_size().map_err(|e| e.to_string())?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    if scale <= 0.0 {
        return Ok((physical.width, physical.height));
    }
    Ok((
        (physical.width as f64 / scale).round().max(1.0) as u32,
        (physical.height as f64 / scale).round().max(1.0) as u32,
    ))
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn flush_cache_to_disk(state: &WindowStateInner) -> Result<(), String> {
    let path = window_state_file_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    std::fs::write(&path, json.as_bytes()).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn is_effectively_maximized(window: &WebviewWindow) -> bool {
    #[cfg(target_os = "macos")]
    {
        if !window.is_decorated().unwrap_or(true) || !window.is_resizable().unwrap_or(true) {
            return false;
        }
    }
    window.is_maximized().unwrap_or(false)
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn update_cache_from_window(cache: &mut WindowStateInner, window: &WebviewWindow) -> Result<(), String> {
    let is_maximized = is_effectively_maximized(window);
    let is_minimized = window.is_minimized().unwrap_or(false);

    cache.maximized = is_maximized;
    cache.visible = window.is_visible().map_err(|e| e.to_string())?;
    cache.use_logical_size = true;

    if !is_maximized && !is_minimized {
        let (width, height) = logical_size_from_window(window)?;
        if width >= MIN_WINDOW_WIDTH && height >= MIN_WINDOW_HEIGHT {
            cache.width = width;
            cache.height = height;
        }
        let pos = window.outer_position().map_err(|e| e.to_string())?;
        cache.x = pos.x;
        cache.y = pos.y;
    }

    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
trait MonitorExt {
    fn intersects(&self, position: PhysicalPosition<i32>, size: PhysicalSize<u32>) -> bool;
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
impl MonitorExt for Monitor {
    fn intersects(&self, position: PhysicalPosition<i32>, size: PhysicalSize<u32>) -> bool {
        let pos = self.position();
        let mon_size = self.size();
        let left = pos.x;
        let right = pos.x + mon_size.width as i32;
        let top = pos.y;
        let bottom = pos.y + mon_size.height as i32;

        [
            (position.x, position.y),
            (position.x + size.width as i32, position.y),
            (position.x, position.y + size.height as i32),
            (
                position.x + size.width as i32,
                position.y + size.height as i32,
            ),
        ]
        .into_iter()
        .any(|(x, y)| x >= left && x < right && y >= top && y < bottom)
    }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn physical_size_for_monitor_check(
    window: &WebviewWindow,
    width: u32,
    height: u32,
    use_logical: bool,
) -> Result<PhysicalSize<u32>, String> {
    if use_logical {
        let scale = window.scale_factor().map_err(|e| e.to_string())?;
        Ok(PhysicalSize::new(
            (width as f64 * scale).round().max(1.0) as u32,
            (height as f64 * scale).round().max(1.0) as u32,
        ))
    } else {
        Ok(PhysicalSize::new(width.max(1), height.max(1)))
    }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn clamp_size_to_monitor(
    window: &WebviewWindow,
    width: u32,
    height: u32,
    use_logical: bool,
) -> Result<(u32, u32), String> {
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let monitors = window.available_monitors().map_err(|e| e.to_string())?;
    let Some(primary) = monitors.first() else {
        return Ok((width, height));
    };
    let mon = primary.size();
    let max_logical_w = (mon.width as f64 / scale * 0.95).round() as u32;
    let max_logical_h = (mon.height as f64 / scale * 0.95).round() as u32;

    if use_logical {
        Ok((
            width.clamp(MIN_WINDOW_WIDTH, max_logical_w.max(MIN_WINDOW_WIDTH)),
            height.clamp(MIN_WINDOW_HEIGHT, max_logical_h.max(MIN_WINDOW_HEIGHT)),
        ))
    } else {
        Ok((
            width.clamp(
                (MIN_WINDOW_WIDTH as f64 * scale).round() as u32,
                (max_logical_w as f64 * scale).round() as u32,
            ),
            height.clamp(
                (MIN_WINDOW_HEIGHT as f64 * scale).round() as u32,
                (max_logical_h as f64 * scale).round() as u32,
            ),
        ))
    }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn set_window_size(window: &WebviewWindow, width: u32, height: u32, use_logical: bool) -> Result<(), String> {
    if use_logical {
        window
            .set_size(Size::Logical(LogicalSize::new(
                width as f64,
                height as f64,
            )))
            .map_err(|e| e.to_string())
    } else {
        window
            .set_size(Size::Physical(PhysicalSize::new(width, height)))
            .map_err(|e| e.to_string())
    }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn position_on_available_monitor(
    window: &WebviewWindow,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    use_logical: bool,
) -> Result<bool, String> {
    let position = PhysicalPosition::new(x, y);
    let size = physical_size_for_monitor_check(window, width, height, use_logical)?;
    let monitors = window.available_monitors().map_err(|e| e.to_string())?;
    Ok(monitors.iter().any(|m| m.intersects(position, size)))
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn apply_window_state(window: &WebviewWindow, state: &WindowStateInner) -> Result<(), String> {
    if !state.should_restore() {
        return Ok(());
    }

    let (width, height) =
        clamp_size_to_monitor(window, state.width, state.height, state.use_logical_size)?;
    let pos_x = if state.maximized { state.prev_x } else { state.x };
    let pos_y = if state.maximized { state.prev_y } else { state.y };

    // 官方顺序：先位置，再尺寸，再最大化
    if position_on_available_monitor(window, pos_x, pos_y, width, height, state.use_logical_size)? {
        window
            .set_position(Position::Physical(PhysicalPosition::new(pos_x, pos_y)))
            .map_err(|e| e.to_string())?;
    }

    if !state.maximized {
        if window.is_maximized().unwrap_or(false) {
            let _ = window.unmaximize();
        }
        set_window_size(window, width, height, state.use_logical_size)?;
    }

    if state.maximized {
        window.maximize().map_err(|e| e.to_string())?;
    }

    if state.visible {
        window.show().map_err(|e| e.to_string())?;
    } else {
        window.hide().map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn ensure_store(app: &AppHandle) -> Result<(), String> {
    if app.try_state::<WindowStateStore>().is_some() {
        return Ok(());
    }

    let initial = load_from_disk()?.unwrap_or_default();

    app.manage(WindowStateStore {
        cache: Mutex::new(initial),
        restoring: Mutex::new(()),
        debounce_seq: AtomicU64::new(0),
    });
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn store<'a>(app: &'a AppHandle) -> Result<State<'a, WindowStateStore>, String> {
    app.try_state::<WindowStateStore>()
        .ok_or_else(|| "WindowStateStore 未初始化".to_string())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn flush_store_immediately(app: &AppHandle, window: &WebviewWindow) -> Result<(), String> {
    let store = store(app)?;
    {
        let mut cache = store.cache.lock().map_err(|e| e.to_string())?;
        update_cache_from_window(&mut cache, window)?;
    }
    let cache = store.cache.lock().map_err(|e| e.to_string())?;
    flush_cache_to_disk(&cache)
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn schedule_debounced_flush(app: AppHandle) {
    let Some(store) = app.try_state::<WindowStateStore>() else {
        return;
    };
    let seq = store.debounce_seq.fetch_add(1, Ordering::SeqCst) + 1;
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(DEBOUNCE_MS)).await;
        let Some(store) = app.try_state::<WindowStateStore>() else {
            return;
        };
        if store.debounce_seq.load(Ordering::SeqCst) != seq {
            return;
        }
        if let Some(win) = app.get_webview_window(MAIN_WINDOW_LABEL) {
            if let Err(e) = flush_store_immediately(&app, &win) {
                eprintln!("[window-state] 防抖写入失败: {e}");
            }
        }
    });
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn restore_from_store(app: &AppHandle, window: &WebviewWindow) -> Result<bool, String> {
    let store = store(app)?;
    let _guard = store.restoring.lock().map_err(|e| e.to_string())?;

    let state = store.cache.lock().map_err(|e| e.to_string())?.clone();
    if !state.should_restore() {
        return Ok(false);
    }

    apply_window_state(window, &state)?;
    Ok(true)
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn schedule_deferred_restore(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(RESTORE_DELAY_MS)).await;
        let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
            return;
        };
        if let Err(e) = restore_from_store(&app, &window) {
            eprintln!("[window-state] 恢复失败: {e}");
        }
    });
}

/// 主窗口创建后：延迟恢复状态并监听事件
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn restore_and_attach(app: &AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return Ok(());
    };

    ensure_store(app)?;
    attach_main_window_listeners(app);

    // 不在 build() 同步恢复：此时 DPI/布局未就绪，易写入错误尺寸
    let app_clone = app.clone();
    let _ = window;
    schedule_deferred_restore(app_clone);

    Ok(())
}

#[cfg(any(target_os = "android", target_os = "ios"))]
pub fn restore_and_attach(_app: &AppHandle) -> Result<(), String> {
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn attach_main_window_listeners(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };
    let app_handle = app.clone();
    window.on_window_event(move |event| {
        let store = match app_handle.try_state::<WindowStateStore>() {
            Some(s) => s,
            None => return,
        };

        match event {
            WindowEvent::CloseRequested { .. } => {
                if let Some(win) = app_handle.get_webview_window(MAIN_WINDOW_LABEL) {
                    if let Err(e) = flush_store_immediately(&app_handle, &win) {
                        eprintln!("[window-state] 关闭保存失败: {e}");
                    }
                }
            }
            WindowEvent::Moved(position) => {
                if store.restoring.try_lock().is_err() {
                    return;
                }
                if let Some(win) = app_handle.get_webview_window(MAIN_WINDOW_LABEL) {
                    if win.is_minimized().unwrap_or(false) {
                        return;
                    }
                }
                if let Ok(mut cache) = store.cache.lock() {
                    cache.prev_x = cache.x;
                    cache.prev_y = cache.y;
                    cache.x = position.x;
                    cache.y = position.y;
                }
                schedule_debounced_flush(app_handle.clone());
            }
            WindowEvent::Resized(size) => {
                if store.restoring.try_lock().is_err() {
                    return;
                }
                let Some(win) = app_handle.get_webview_window(MAIN_WINDOW_LABEL) else {
                    return;
                };
                if win.is_minimized().unwrap_or(false) || is_effectively_maximized(&win) {
                    return;
                }
                if let Ok(scale) = win.scale_factor() {
                    if scale > 0.0 {
                        let w = (size.width as f64 / scale).round().max(1.0) as u32;
                        let h = (size.height as f64 / scale).round().max(1.0) as u32;
                        if w >= MIN_WINDOW_WIDTH && h >= MIN_WINDOW_HEIGHT {
                            if let Ok(mut cache) = store.cache.lock() {
                                cache.width = w;
                                cache.height = h;
                                cache.use_logical_size = true;
                            }
                        }
                    }
                }
                schedule_debounced_flush(app_handle.clone());
            }
            _ => {}
        }
    });
}

/// 应用退出前兜底保存
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn save_on_exit(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        if app.try_state::<WindowStateStore>().is_none() {
            let _ = ensure_store(app);
        }
        if let Err(e) = flush_store_immediately(app, &win) {
            eprintln!("[window-state] 退出保存失败: {e}");
        }
    }
}

#[cfg(any(target_os = "android", target_os = "ios"))]
pub fn save_on_exit(_app: &AppHandle) {}

/// 前端在隐藏/显示托盘等场景主动保存
#[tauri::command]
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn save_window_state(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "主窗口不存在".to_string())?;
    if app.try_state::<WindowStateStore>().is_none() {
        ensure_store(&app)?;
    }
    flush_store_immediately(&app, &window)
}

#[tauri::command]
#[cfg(any(target_os = "android", target_os = "ios"))]
pub fn save_window_state(_app: tauri::AppHandle) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_legacy_plugin_format() {
        let json = r#"{"main":{"width":960,"height":640,"x":100,"y":80,"prevX":100,"prevY":80,"maximized":false,"visible":true}}"#;
        let root: serde_json::Value = serde_json::from_str(json).unwrap();
        let state: WindowStateInner = serde_json::from_value(root.get("main").unwrap().clone()).unwrap();
        assert_eq!(state.width, 960);
        assert_eq!(state.height, 640);
    }
}
