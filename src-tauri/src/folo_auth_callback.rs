//! Folo 浏览器登录本地回调（桌面）：监听 127.0.0.1 一次性 token。

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;

const SUCCESS_HTML: &str = r#"<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"/><title>登录完成</title></head>
<body style="font-family:sans-serif;padding:24px;line-height:1.5">
<h1>Folo 登录完成</h1><p>可以关闭此窗口并返回 MediaBox。</p>
</body></html>"#;

const FAILURE_HTML: &str = r#"<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"/><title>登录失败</title></head>
<body style="font-family:sans-serif;padding:24px;line-height:1.5">
<h1>缺少 token</h1><p>请返回应用重试登录。</p>
</body></html>"#;

struct CallbackState {
    listener: Option<TcpListener>,
    port: u16,
    cancel: AtomicBool,
}

fn state() -> &'static Mutex<CallbackState> {
    static STATE: OnceLock<Mutex<CallbackState>> = OnceLock::new();
    STATE.get_or_init(|| {
        Mutex::new(CallbackState {
            listener: None,
            port: 0,
            cancel: AtomicBool::new(false),
        })
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FoloAuthPrepareResult {
    pub callback_url: String,
    pub port: u16,
}

fn extract_token(request_line_and_headers: &str) -> Option<String> {
    let first_line = request_line_and_headers.lines().next()?;
    let path = first_line.split_whitespace().nth(1)?;
    let query = path.split('?').nth(1)?;
    for pair in query.split('&') {
        let mut parts = pair.splitn(2, '=');
        let key = parts.next()?;
        let value = parts.next().unwrap_or("");
        if key == "token" && !value.is_empty() {
            return Some(urlencoding::decode(value).unwrap_or_default().into_owned());
        }
    }
    None
}

fn respond(stream: &mut TcpStream, status: &str, body: &str) {
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{body}",
        body.as_bytes().len()
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

fn read_request(stream: &mut TcpStream) -> String {
    let mut buf = [0u8; 4096];
    let mut out = Vec::new();
    loop {
        match stream.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                out.extend_from_slice(&buf[..n]);
                if out.windows(4).any(|w| w == b"\r\n\r\n") {
                    break;
                }
                if out.len() > 16_384 {
                    break;
                }
            }
            Err(_) => break,
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[tauri::command]
pub fn folo_auth_prepare_callback() -> Result<FoloAuthPrepareResult, String> {
    let mut guard = state()
        .lock()
        .map_err(|_| "无法锁定 Folo 登录回调状态".to_string())?;
    guard.cancel.store(false, Ordering::SeqCst);
    if let Some(old) = guard.listener.take() {
        drop(old);
    }
    let listener = TcpListener::bind(("127.0.0.1", 0))
        .map_err(|e| format!("无法绑定本地回调端口: {e}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("设置非阻塞失败: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("读取回调端口失败: {e}"))?
        .port();
    guard.port = port;
    guard.listener = Some(listener);
    Ok(FoloAuthPrepareResult {
        callback_url: format!("http://127.0.0.1:{port}/callback"),
        port,
    })
}

#[tauri::command]
pub async fn folo_auth_await_callback(timeout_ms: u64) -> Result<String, String> {
    let timeout = Duration::from_millis(timeout_ms.max(1_000));
    let listener = {
        let mut guard = state()
            .lock()
            .map_err(|_| "无法锁定 Folo 登录回调状态".to_string())?;
        guard
            .listener
            .take()
            .ok_or_else(|| "请先调用 folo_auth_prepare_callback".to_string())?
    };

    let result = tokio::task::spawn_blocking(move || {
        let started = Instant::now();
        loop {
            if state()
                .lock()
                .map(|g| g.cancel.load(Ordering::SeqCst))
                .unwrap_or(true)
            {
                return Err("已取消 Folo 登录".to_string());
            }
            if started.elapsed() >= timeout {
                return Err("等待 Folo 登录超时".to_string());
            }
            match listener.accept() {
                Ok((mut stream, _)) => {
                    let req = read_request(&mut stream);
                    if let Some(token) = extract_token(&req) {
                        respond(&mut stream, "200 OK", SUCCESS_HTML);
                        return Ok(token);
                    }
                    respond(&mut stream, "400 Bad Request", FAILURE_HTML);
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(50));
                }
                Err(e) => return Err(format!("监听回调失败: {e}")),
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?;

    {
        let mut guard = state()
            .lock()
            .map_err(|_| "无法锁定 Folo 登录回调状态".to_string())?;
        guard.port = 0;
        guard.cancel.store(false, Ordering::SeqCst);
    }
    result
}

#[tauri::command]
pub fn folo_auth_cancel_callback() -> Result<(), String> {
    let mut guard = state()
        .lock()
        .map_err(|_| "无法锁定 Folo 登录回调状态".to_string())?;
    guard.cancel.store(true, Ordering::SeqCst);
    if let Some(old) = guard.listener.take() {
        drop(old);
    }
    guard.port = 0;
    Ok(())
}
