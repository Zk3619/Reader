//! WebSocket 书源调试（对齐 Legado port+1 /bookSourceDebug）

mod server {
    use std::collections::HashMap;
    use std::io::{Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Mutex, OnceLock};
    use std::thread::{self, JoinHandle};

    use base64::Engine;
    use serde::Serialize;
    use sha1::{Digest, Sha1};
    use tauri::{AppHandle, Emitter};
    use uuid::Uuid;

    const WS_GUID: &str = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    const WS_DEBUG_EVENT: &str = "reader-web-ws-debug";

    #[derive(Serialize, Clone)]
    struct WsDebugPayload {
        id: String,
        path: String,
        message: String,
    }

    struct WsRuntime {
        stop: Arc<AtomicBool>,
        handle: Mutex<Option<JoinHandle<()>>>,
        sessions: Mutex<HashMap<String, TcpStream>>,
        auth_enabled: Mutex<bool>,
        auth_token: Mutex<String>,
    }

    fn runtime() -> &'static WsRuntime {
        static RUNTIME: OnceLock<WsRuntime> = OnceLock::new();
        RUNTIME.get_or_init(|| WsRuntime {
            stop: Arc::new(AtomicBool::new(false)),
            handle: Mutex::new(None),
            sessions: Mutex::new(HashMap::new()),
            auth_enabled: Mutex::new(false),
            auth_token: Mutex::new(String::new()),
        })
    }

    static WS_APP: OnceLock<AppHandle> = OnceLock::new();

    pub fn set_ws_app_handle(app: AppHandle) {
        let _ = WS_APP.set(app);
    }

    pub fn set_web_ws_auth(enabled: bool, token: String) {
        let rt = runtime();
        *rt.auth_enabled.lock().unwrap() = enabled;
        *rt.auth_token.lock().unwrap() = token;
    }

    fn ws_accept_key(key: &str) -> String {
        let mut hasher = Sha1::new();
        hasher.update(format!("{}{}", key, WS_GUID).as_bytes());
        base64::engine::general_purpose::STANDARD.encode(hasher.finalize())
    }

    struct HttpUpgrade {
        path: String,
        query: HashMap<String, String>,
        headers: HashMap<String, String>,
    }

    fn parse_upgrade_request(buf: &[u8]) -> Option<HttpUpgrade> {
        let text = String::from_utf8_lossy(buf);
        let mut lines = text.lines();
        let request_line = lines.next()?;
        let mut parts = request_line.split_whitespace();
        parts.next()?;
        let raw_path = parts.next()?;

        let (path, query_str) = raw_path.split_once('?').unwrap_or((raw_path, ""));
        let mut query = HashMap::new();
        for pair in query_str.split('&').filter(|s| !s.is_empty()) {
            if let Some((k, v)) = pair.split_once('=') {
                query.insert(k.to_string(), v.to_string());
            }
        }

        let mut headers = HashMap::new();
        for line in lines {
            if line.is_empty() {
                break;
            }
            if let Some((k, v)) = line.split_once(':') {
                headers.insert(k.trim().to_ascii_lowercase(), v.trim().to_string());
            }
        }

        Some(HttpUpgrade {
            path: path.to_string(),
            query,
            headers,
        })
    }

    fn check_ws_auth(query: &HashMap<String, String>, headers: &HashMap<String, String>) -> bool {
        let rt = runtime();
        if !*rt.auth_enabled.lock().unwrap() {
            return true;
        }
        let expected = rt.auth_token.lock().unwrap().clone();
        if expected.is_empty() {
            return false;
        }
        let token = query.get("token").cloned().or_else(|| {
            headers.get("authorization").map(|v| {
                v.strip_prefix("Bearer ")
                    .or_else(|| v.strip_prefix("bearer "))
                    .unwrap_or(v)
                    .trim()
                    .to_string()
            })
        });
        token.as_deref() == Some(expected.as_str())
    }

    fn ws_handshake(stream: &mut TcpStream, key: &str) -> std::io::Result<()> {
        let accept = ws_accept_key(key);
        let response = format!(
            "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {}\r\n\r\n",
            accept
        );
        stream.write_all(response.as_bytes())
    }

    fn read_ws_text_frame(stream: &mut TcpStream) -> std::io::Result<Option<String>> {
        let mut header = [0u8; 2];
        if stream.read_exact(&mut header).is_err() {
            return Ok(None);
        }
        let opcode = header[0] & 0x0f;
        if opcode == 0x8 {
            return Ok(None);
        }
        let masked = (header[1] & 0x80) != 0;
        let mut len = (header[1] & 0x7f) as usize;
        if len == 126 {
            let mut ext = [0u8; 2];
            stream.read_exact(&mut ext)?;
            len = u16::from_be_bytes(ext) as usize;
        } else if len == 127 {
            let mut ext = [0u8; 8];
            stream.read_exact(&mut ext)?;
            len = u64::from_be_bytes(ext) as usize;
        }
        let mut mask = [0u8; 4];
        if masked {
            stream.read_exact(&mut mask)?;
        }
        let mut payload = vec![0u8; len.min(1024 * 1024)];
        if len > payload.len() {
            return Ok(None);
        }
        payload.resize(len, 0);
        stream.read_exact(&mut payload)?;
        if masked {
            for (i, b) in payload.iter_mut().enumerate() {
                *b ^= mask[i % 4];
            }
        }
        if opcode == 0x1 {
            return Ok(Some(String::from_utf8_lossy(&payload).into_owned()));
        }
        Ok(None)
    }

    pub fn write_ws_text_frame(stream: &mut TcpStream, text: &str) -> std::io::Result<()> {
        let payload = text.as_bytes();
        let mut frame = Vec::new();
        frame.push(0x81);
        let len = payload.len();
        if len < 126 {
            frame.push(len as u8);
        } else if len <= 0xffff {
            frame.push(126);
            frame.extend_from_slice(&(len as u16).to_be_bytes());
        } else {
            frame.push(127);
            frame.extend_from_slice(&(len as u64).to_be_bytes());
        }
        frame.extend_from_slice(payload);
        stream.write_all(&frame)
    }

    fn handle_ws_connection(app: AppHandle, mut stream: TcpStream) {
        let mut buf = [0u8; 8192];
        let n = match stream.read(&mut buf) {
            Ok(n) if n > 0 => n,
            _ => return,
        };

        let upgrade = match parse_upgrade_request(&buf[..n]) {
            Some(u) => u,
            None => return,
        };

        const ALLOWED_PATHS: &[&str] = &["/bookSourceDebug", "/rssSourceDebug", "/searchBook"];
        if !ALLOWED_PATHS.contains(&upgrade.path.as_str()) {
            return;
        }
        if !check_ws_auth(&upgrade.query, &upgrade.headers) {
            let _ = stream.write_all(b"HTTP/1.1 401 Unauthorized\r\n\r\n");
            return;
        }

        let ws_key = upgrade
            .headers
            .get("sec-websocket-key")
            .cloned()
            .unwrap_or_else(|| "reader-ws-key".to_string());

        if ws_handshake(&mut stream, &ws_key).is_err() {
            return;
        }

        let id = Uuid::new_v4().to_string();
        {
            let mut sessions = runtime().sessions.lock().unwrap();
            if let Ok(cloned) = stream.try_clone() {
                sessions.insert(id.clone(), cloned);
            }
        }

        if let Ok(Some(msg)) = read_ws_text_frame(&mut stream) {
            if !msg.is_empty() {
                let _ = app.emit(
                    WS_DEBUG_EVENT,
                    WsDebugPayload {
                        id: id.clone(),
                        path: upgrade.path.clone(),
                        message: msg,
                    },
                );
            }
        }

        // 保持连接直到前端关闭或客户端断开
        loop {
            thread::sleep(std::time::Duration::from_millis(500));
            let sessions = runtime().sessions.lock().unwrap();
            if !sessions.contains_key(&id) {
                break;
            }
        }
        let _ = stream.shutdown(std::net::Shutdown::Both);
    }

    pub fn web_ws_send(id: String, text: String) -> Result<(), String> {
        let mut sessions = runtime().sessions.lock().map_err(|e| e.to_string())?;
        let Some(stream) = sessions.get_mut(&id) else {
            return Err("session not found".into());
        };
        write_ws_text_frame(stream, &text).map_err(|e| e.to_string())
    }

    pub fn web_ws_close(id: String) -> Result<(), String> {
        let mut sessions = runtime().sessions.lock().map_err(|e| e.to_string())?;
        if let Some(stream) = sessions.remove(&id) {
            let _ = stream.shutdown(std::net::Shutdown::Both);
        }
        Ok(())
    }

    pub fn start_web_ws_server(port: u16) -> Result<(), String> {
        stop_web_ws_server()?;
        let rt = runtime();
        rt.stop.store(false, Ordering::SeqCst);
        let stop_flag = Arc::clone(&rt.stop);

        let listener = TcpListener::bind(("0.0.0.0", port))
            .map_err(|e| format!("WebSocket 绑定端口 {} 失败: {}", port, e))?;
        listener
            .set_nonblocking(true)
            .map_err(|e| e.to_string())?;

        let handle = thread::spawn(move || {
            while !stop_flag.load(Ordering::SeqCst) {
                match listener.accept() {
                    Ok((stream, _)) => {
                        if let Some(app) = WS_APP.get().cloned() {
                            thread::spawn(move || handle_ws_connection(app, stream));
                        }
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(std::time::Duration::from_millis(20));
                    }
                    Err(_) => break,
                }
            }
        });

        *rt.handle.lock().map_err(|e| e.to_string())? = Some(handle);
        Ok(())
    }

    pub fn stop_web_ws_server() -> Result<(), String> {
        let rt = runtime();
        rt.stop.store(true, Ordering::SeqCst);
        if let Some(handle) = rt.handle.lock().map_err(|e| e.to_string())?.take() {
            let _ = handle.join();
        }
        rt.sessions.lock().map_err(|e| e.to_string())?.clear();
        Ok(())
    }
}

pub use server::*;

#[tauri::command]
pub fn web_ws_send_cmd(id: String, text: String) -> Result<(), String> {
    web_ws_send(id, text)
}

#[tauri::command]
pub fn web_ws_close_cmd(id: String) -> Result<(), String> {
    web_ws_close(id)
}
