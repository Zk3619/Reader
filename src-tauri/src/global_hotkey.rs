//! 全局音乐快捷键（桌面）

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod imp {
    use std::collections::HashMap;
    use std::str::FromStr;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Mutex, OnceLock};
    use std::thread::{self, JoinHandle};

    use global_hotkey::hotkey::{Code, HotKey, Modifiers};
    use global_hotkey::{GlobalHotKeyEvent, GlobalHotKeyManager};
    use tauri::{AppHandle, Emitter};

    static STOP: AtomicBool = AtomicBool::new(false);
    static HANDLE: OnceLock<Mutex<Option<JoinHandle<()>>>> = OnceLock::new();

    fn parse_hotkey(spec: &str) -> Option<HotKey> {
        let trimmed = spec.trim();
        if trimmed.is_empty() {
            return None;
        }
        let parts: Vec<&str> = trimmed.split('+').map(|s| s.trim()).collect();
        let mut mods = Modifiers::empty();
        let mut code: Option<Code> = None;
        for part in parts {
            match part.to_lowercase().as_str() {
                "ctrl" | "control" => mods |= Modifiers::CONTROL,
                "alt" => mods |= Modifiers::ALT,
                "shift" => mods |= Modifiers::SHIFT,
                "meta" | "win" | "super" => mods |= Modifiers::SUPER,
                key => {
                    code = match key.to_uppercase().as_str() {
                        "SPACE" => Some(Code::Space),
                        "LEFT" => Some(Code::ArrowLeft),
                        "RIGHT" => Some(Code::ArrowRight),
                        "UP" => Some(Code::ArrowUp),
                        "DOWN" => Some(Code::ArrowDown),
                        "[" | "BRACKETLEFT" => Some(Code::BracketLeft),
                        "]" | "BRACKETRIGHT" => Some(Code::BracketRight),
                        c if c.len() == 1 => {
                            let ch = c.chars().next()?;
                            if ch.is_ascii_alphabetic() {
                                Some(Code::from_str(&format!("Key{ch}")).ok()?)
                            } else if ch.is_ascii_digit() {
                                Some(Code::from_str(&format!("Digit{ch}")).ok()?)
                            } else {
                                None
                            }
                        }
                        _ => None,
                    };
                }
            }
        }
        code.map(|c| HotKey::new(Some(mods), c))
    }

    pub fn register(app: AppHandle, specs: &[(&str, String)]) -> Result<(), String> {
        unregister();
        STOP.store(false, Ordering::SeqCst);
        let owned: Vec<(String, String)> = specs
            .iter()
            .map(|(a, s)| (a.to_string(), s.clone()))
            .collect();
        let handle = thread::spawn(move || {
            let manager = match GlobalHotKeyManager::new() {
                Ok(m) => m,
                Err(e) => {
                    log::error!("hotkey manager: {e}");
                    return;
                }
            };
            let mut map = HashMap::new();
            for (action, spec) in &owned {
                if spec.is_empty() {
                    continue;
                }
                if let Some(hk) = parse_hotkey(spec) {
                    let id = hk.id();
                    if manager.register(hk).is_ok() {
                        map.insert(id, action.to_string());
                    }
                }
            }
            while !STOP.load(Ordering::SeqCst) {
                if let Ok(event) = GlobalHotKeyEvent::receiver().try_recv() {
                    if let Some(action) = map.get(&event.id) {
                        let _ = app.emit("music-hotkey", serde_json::json!({ "action": action }));
                    }
                }
                thread::sleep(std::time::Duration::from_millis(50));
            }
            drop(manager);
        });
        HANDLE
            .get_or_init(|| Mutex::new(None))
            .lock()
            .unwrap()
            .replace(handle);
        log::info!("music hotkeys registered");
        Ok(())
    }

    pub fn unregister() {
        STOP.store(true, Ordering::SeqCst);
        if let Some(lock) = HANDLE.get() {
            if let Some(h) = lock.lock().unwrap().take() {
                let _ = h.join();
            }
        }
        log::info!("music hotkeys unregistered");
    }
}

#[tauri::command]
pub fn register_music_hotkeys(
    app: tauri::AppHandle,
    play: String,
    pause: String,
    next: String,
    prev: String,
    vol_up: Option<String>,
    vol_down: Option<String>,
    mute: Option<String>,
    collect: Option<String>,
    lyric_toggle: Option<String>,
    seek_forward: Option<String>,
    seek_back: Option<String>,
) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        return imp::register(
            app,
            &[
                ("play", play),
                ("pause", pause),
                ("next", next),
                ("prev", prev),
                ("vol_up", vol_up.unwrap_or_default()),
                ("vol_down", vol_down.unwrap_or_default()),
                ("mute", mute.unwrap_or_default()),
                ("collect", collect.unwrap_or_default()),
                ("lyric_toggle", lyric_toggle.unwrap_or_default()),
                ("seek_forward", seek_forward.unwrap_or_default()),
                ("seek_back", seek_back.unwrap_or_default()),
            ],
        );
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (app, play, pause, next, prev, vol_up, vol_down, mute, collect, lyric_toggle, seek_forward, seek_back);
        Err("全局热键仅桌面端可用".into())
    }
}

#[tauri::command]
pub fn unregister_music_hotkeys() {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    imp::unregister();
}
