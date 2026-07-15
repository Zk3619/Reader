//! Music OpenAPI HTTP 服务（LX 对齐：status/SSE/collect/mute/lyric）

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod imp {
    use std::io::{Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Mutex, OnceLock};
    use std::thread::{self, JoinHandle};

    use serde::{Deserialize, Serialize};
    use tauri::{AppHandle, Emitter};

    #[derive(Clone, Serialize, Deserialize, Default)]
    pub struct PlayerState {
        pub playing: bool,
        pub position: f64,
        pub duration: f64,
        pub volume: f64,
        pub muted: bool,
        pub collected: bool,
        #[serde(default)]
        pub track_name: Option<String>,
        #[serde(default)]
        pub track_artist: Option<String>,
        #[serde(default)]
        pub track_source: Option<String>,
        #[serde(default)]
        pub lyric: Option<String>,
        #[serde(default)]
        pub lyric_all: Option<serde_json::Value>,
    }

    static RUNNING: AtomicBool = AtomicBool::new(false);
    static HANDLE: OnceLock<Mutex<Option<JoinHandle<()>>>> = OnceLock::new();
    static STATE: OnceLock<Mutex<PlayerState>> = OnceLock::new();
    static BIND_IP: OnceLock<String> = OnceLock::new();

    fn state() -> &'static Mutex<PlayerState> {
        STATE.get_or_init(|| Mutex::new(PlayerState::default()))
    }

    pub fn update_state(s: PlayerState) {
        if let Ok(mut guard) = state().lock() {
            *guard = s;
        }
    }

    fn status_json() -> String {
        let guard = state().lock().unwrap();
        serde_json::json!({
            "code": 0,
            "status": "ok",
            "playing": guard.playing,
            "position": guard.position,
            "duration": guard.duration,
            "volume": guard.volume,
            "muted": guard.muted,
            "collected": guard.collected,
            "track": {
                "name": guard.track_name,
                "artist": guard.track_artist,
                "source": guard.track_source,
            }
        })
        .to_string()
    }

    fn parse_request(req: &str) -> (String, String, String) {
        let first = req.lines().next().unwrap_or("");
        let parts: Vec<&str> = first.split_whitespace().collect();
        let method = parts.first().copied().unwrap_or("GET").to_string();
        let path = parts.get(1).copied().unwrap_or("/").to_string();
        let mut body = String::new();
        if let Some(idx) = req.find("\r\n\r\n") {
            body = req[idx + 4..].trim().to_string();
        }
        (method, path, body)
    }

    fn emit_action(app: &AppHandle, action: &str, payload: serde_json::Value) {
        let _ = app.emit(
            "music-openapi-command",
            serde_json::json!({ "action": action, "payload": payload }),
        );
    }

    fn handle_sse(mut stream: TcpStream) {
        let _ = stream.write_all(
            b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\nConnection: keep-alive\r\nAccess-Control-Allow-Origin: *\r\n\r\n",
        );
        for _ in 0..120 {
            if !RUNNING.load(Ordering::SeqCst) {
                break;
            }
            let data = format!("data: {}\n\n", status_json());
            if stream.write_all(data.as_bytes()).is_err() {
                break;
            }
            let _ = stream.flush();
            thread::sleep(std::time::Duration::from_secs(1));
        }
    }

    fn handle_client(app: AppHandle, mut stream: TcpStream) {
        let mut buf = [0u8; 16384];
        let n = stream.read(&mut buf).unwrap_or(0);
        let req = String::from_utf8_lossy(&buf[..n]);
        let (method, path, body) = parse_request(&req);
        let path_only = path.split('?').next().unwrap_or(&path).to_string();

        if method == "GET" && path_only == "/subscribe-player-status" {
            handle_sse(stream);
            return;
        }

        let (status, body_out, content_type) = match (method.as_str(), path_only.as_str()) {
            ("GET", "/status") | ("GET", "/") => (200, status_json(), "application/json"),
            ("GET", "/lyric") | ("GET", "/lyric-all") => {
                let guard = state().lock().unwrap();
                let lyric_body = if path_only == "/lyric-all" {
                    serde_json::json!({
                        "code": 0,
                        "lyric": guard.lyric.clone().unwrap_or_default(),
                        "lyricAll": guard.lyric_all.clone().unwrap_or(serde_json::json!({}))
                    })
                    .to_string()
                } else {
                    serde_json::json!({
                        "code": 0,
                        "lyric": guard.lyric.clone().unwrap_or_default()
                    })
                    .to_string()
                };
                (200, lyric_body, "application/json")
            }
            ("POST", "/play") => {
                emit_action(&app, "play", serde_json::json!({}));
                (200, r#"{"code":0,"msg":"ok"}"#.to_string(), "application/json")
            }
            ("POST", "/pause") => {
                emit_action(&app, "pause", serde_json::json!({}));
                (200, r#"{"code":0,"msg":"ok"}"#.to_string(), "application/json")
            }
            ("POST", "/next") => {
                emit_action(&app, "next", serde_json::json!({}));
                (200, r#"{"code":0,"msg":"ok"}"#.to_string(), "application/json")
            }
            ("POST", "/prev") => {
                emit_action(&app, "prev", serde_json::json!({}));
                (200, r#"{"code":0,"msg":"ok"}"#.to_string(), "application/json")
            }
            ("POST", "/seek") => {
                let pos = serde_json::from_str::<serde_json::Value>(&body)
                    .ok()
                    .and_then(|v| v.get("position").and_then(|p| p.as_f64()))
                    .unwrap_or(0.0);
                emit_action(&app, "seek", serde_json::json!({ "position": pos }));
                (200, r#"{"code":0,"msg":"ok"}"#.to_string(), "application/json")
            }
            ("POST", "/volume") => {
                let vol = serde_json::from_str::<serde_json::Value>(&body)
                    .ok()
                    .and_then(|v| v.get("volume").and_then(|p| p.as_f64()))
                    .unwrap_or(1.0);
                emit_action(&app, "volume", serde_json::json!({ "volume": vol }));
                (200, r#"{"code":0,"msg":"ok"}"#.to_string(), "application/json")
            }
            ("POST", "/mute") => {
                emit_action(&app, "mute", serde_json::json!({}));
                (200, r#"{"code":0,"msg":"ok"}"#.to_string(), "application/json")
            }
            ("POST", "/collect") => {
                emit_action(&app, "collect", serde_json::json!({ "collect": true }));
                (200, r#"{"code":0,"msg":"ok"}"#.to_string(), "application/json")
            }
            ("POST", "/uncollect") => {
                emit_action(&app, "collect", serde_json::json!({ "collect": false }));
                (200, r#"{"code":0,"msg":"ok"}"#.to_string(), "application/json")
            }
            _ => (404, r#"{"code":404,"msg":"not found"}"#.to_string(), "application/json"),
        };

        let resp = format!(
            "HTTP/1.1 {status} OK\r\nContent-Type: {content_type}\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body_out}",
            body_out.len()
        );
        let _ = stream.write_all(resp.as_bytes());
    }

    pub fn start(app: AppHandle, port: u16, bind_ip: Option<String>) -> Result<(), String> {
        stop();
        let ip = bind_ip.unwrap_or_else(|| "127.0.0.1".to_string());
        let _ = BIND_IP.set(ip.clone());
        let listener = TcpListener::bind(format!("{ip}:{port}"))
            .map_err(|e| format!("bind openapi: {e}"))?;
        listener
            .set_nonblocking(true)
            .map_err(|e| format!("nonblocking: {e}"))?;
        RUNNING.store(true, Ordering::SeqCst);
        let app2 = app.clone();
        let handle = thread::spawn(move || {
            while RUNNING.load(Ordering::SeqCst) {
                if let Ok((stream, _)) = listener.accept() {
                    handle_client(app2.clone(), stream);
                }
                thread::sleep(std::time::Duration::from_millis(50));
            }
        });
        HANDLE
            .get_or_init(|| Mutex::new(None))
            .lock()
            .unwrap()
            .replace(handle);
        Ok(())
    }

    pub fn stop() {
        RUNNING.store(false, Ordering::SeqCst);
        if let Some(lock) = HANDLE.get() {
            if let Some(h) = lock.lock().unwrap().take() {
                let _ = h.join();
            }
        }
    }

    pub fn is_running() -> bool {
        RUNNING.load(Ordering::SeqCst)
    }
}

#[tauri::command]
pub fn start_music_openapi(
    app: tauri::AppHandle,
    port: u16,
    bind_ip: Option<String>,
) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        return imp::start(app, port, bind_ip);
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (app, port, bind_ip);
        Err("OpenAPI 仅桌面端可用".into())
    }
}

#[tauri::command]
pub fn stop_music_openapi() {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    imp::stop();
}

#[tauri::command]
pub fn get_music_openapi_status() -> serde_json::Value {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        return serde_json::json!({ "running": imp::is_running() });
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        serde_json::json!({ "running": false })
    }
}

#[tauri::command]
pub fn update_music_openapi_state(state: imp::PlayerState) {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    imp::update_state(state);
    #[cfg(any(target_os = "android", target_os = "ios"))]
    let _ = state;
}
