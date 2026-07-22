//! MusicFree RequestForwarder（对齐 Desktop `res/.service/request-forwarder.js`）
//! 本地 `127.0.0.1:52735+` 代理，把自定义 Header 附到上游请求并流式回传，供 `<audio>` 直连。

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::Duration;

static PORT: AtomicU16 = AtomicU16::new(0);
static RUNNING: AtomicBool = AtomicBool::new(false);
static HANDLE: OnceLock<Mutex<Option<thread::JoinHandle<()>>>> = OnceLock::new();

const DEFAULT_PORT: u16 = 52735;
const MAX_PORT_RETRIES: u16 = 20;

fn write_simple(stream: &mut TcpStream, code: u16, body: &str) {
    let _ = write!(
        stream,
        "HTTP/1.1 {code}\r\nContent-Type: text/plain; charset=utf-8\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
}

fn parse_query(path_and_query: &str) -> HashMap<String, String> {
    let mut out = HashMap::new();
    let q = path_and_query.split('?').nth(1).unwrap_or("");
    for pair in q.split('&') {
        if pair.is_empty() {
            continue;
        }
        let mut it = pair.splitn(2, '=');
        let k = it.next().unwrap_or("").to_string();
        let v = it.next().unwrap_or("").to_string();
        if k.is_empty() {
            continue;
        }
        let decoded_k = urlencoding_decode(&k);
        let decoded_v = urlencoding_decode(&v);
        out.insert(decoded_k, decoded_v);
    }
    out
}

fn urlencoding_decode(s: &str) -> String {
    let mut out = Vec::new();
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                let hex = &s[i + 1..i + 3];
                if let Ok(v) = u8::from_str_radix(hex, 16) {
                    out.push(v);
                    i += 3;
                } else {
                    out.push(bytes[i]);
                    i += 1;
                }
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn parse_headers_json(raw: &str) -> HashMap<String, String> {
    if raw.trim().is_empty() {
        return HashMap::new();
    }
    serde_json::from_str::<HashMap<String, String>>(raw).unwrap_or_default()
}

fn forward_upstream(stream: &mut TcpStream, url: &str, method: &str, headers: HashMap<String, String>) {
    let client = match reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(120))
        .redirect(reqwest::redirect::Policy::limited(10))
        .danger_accept_invalid_certs(true)
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            write_simple(stream, 500, &format!("client build: {e}"));
            return;
        }
    };

    let mut builder = match method.to_uppercase().as_str() {
        "HEAD" => client.head(url),
        _ => client.get(url),
    };

    let mut host_override: Option<String> = None;
    for (k, v) in &headers {
        let lower = k.to_ascii_lowercase();
        if lower == "host" {
            if !(v.contains("localhost") || v.contains("127.0.0.1")) {
                host_override = Some(v.clone());
            }
            continue;
        }
        if lower == "connection" || lower == "content-length" || lower == "transfer-encoding" {
            continue;
        }
        builder = builder.header(k.as_str(), v.as_str());
    }

    let host = host_override.unwrap_or_else(|| host_from_url(url));
    if !host.is_empty() {
        builder = builder.header("host", host);
    }

    let mut resp = match builder.send() {
        Ok(r) => r,
        Err(e) => {
            write_simple(stream, 502, &format!("upstream: {e}"));
            return;
        }
    };

    let status = resp.status().as_u16();
    let mut header_lines = String::new();
    header_lines.push_str(&format!("HTTP/1.1 {status}\r\n"));
    header_lines.push_str("Access-Control-Allow-Origin: *\r\n");
    header_lines.push_str("Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n");
    header_lines.push_str("Connection: close\r\n");

    for (name, value) in resp.headers().iter() {
        let n = name.as_str();
        let lower = n.to_ascii_lowercase();
        if lower == "transfer-encoding"
            || lower == "connection"
            || lower == "access-control-allow-origin"
        {
            continue;
        }
        if let Ok(v) = value.to_str() {
            header_lines.push_str(n);
            header_lines.push_str(": ");
            header_lines.push_str(v);
            header_lines.push_str("\r\n");
        }
    }
    header_lines.push_str("\r\n");

    if stream.write_all(header_lines.as_bytes()).is_err() {
        return;
    }

    if method.eq_ignore_ascii_case("HEAD") {
        return;
    }

    let mut buf = [0u8; 64 * 1024];
    loop {
        match resp.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                if stream.write_all(&buf[..n]).is_err() {
                    break;
                }
            }
            Err(_) => break,
        }
    }
}

fn host_from_url(url: &str) -> String {
    let rest = url
        .split_once("://")
        .map(|(_, r)| r)
        .unwrap_or(url);
    rest.split('/').next().unwrap_or("").to_string()
}

fn handle_stream(mut stream: TcpStream) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(30)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(120)));

    let mut head = Vec::with_capacity(4096);
    let mut buf = [0u8; 1024];
    loop {
        match stream.read(&mut buf) {
            Ok(0) => return,
            Ok(n) => {
                head.extend_from_slice(&buf[..n]);
                if head.windows(4).any(|w| w == b"\r\n\r\n") {
                    break;
                }
                if head.len() > 64 * 1024 {
                    write_simple(&mut stream, 413, "request too large");
                    return;
                }
            }
            Err(_) => return,
        }
    }

    let head_str = String::from_utf8_lossy(&head);
    let first_line = head_str.lines().next().unwrap_or("");
    let mut parts = first_line.split_whitespace();
    let method = parts.next().unwrap_or("GET");
    let path = parts.next().unwrap_or("/");

    if method.eq_ignore_ascii_case("OPTIONS") {
        let _ = write!(
            stream,
            "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, HEAD, OPTIONS\r\nAccess-Control-Allow-Headers: *\r\nConnection: close\r\n\r\n"
        );
        return;
    }

    if path.starts_with("/heartbeat") {
        write_simple(&mut stream, 200, "OK");
        return;
    }

    if !method.eq_ignore_ascii_case("GET") && !method.eq_ignore_ascii_case("HEAD") {
        write_simple(&mut stream, 405, "Only GET/HEAD allowed");
        return;
    }

    let query = parse_query(path);
    let Some(url) = query.get("url").cloned().filter(|u| {
        u.starts_with("http://") || u.starts_with("https://")
    }) else {
        write_simple(&mut stream, 400, "Bad Request: Missing URL");
        return;
    };

    let up_method = query
        .get("method")
        .cloned()
        .unwrap_or_else(|| method.to_string());
    let mut headers = parse_headers_json(query.get("headers").map(|s| s.as_str()).unwrap_or(""));

    // 透传客户端 Range（便于 seek）
    for line in head_str.lines().skip(1) {
        if line.is_empty() {
            break;
        }
        if let Some((k, v)) = line.split_once(':') {
            let key = k.trim();
            if key.eq_ignore_ascii_case("range") {
                headers.insert("Range".into(), v.trim().to_string());
            }
        }
    }

    forward_upstream(&mut stream, &url, &up_method, headers);
}

fn try_bind(start: u16, retries: u16) -> Option<(TcpListener, u16)> {
    for i in 0..=retries {
        let port = start.saturating_add(i);
        if let Ok(listener) = TcpListener::bind(("127.0.0.1", port)) {
            return Some((listener, port));
        }
    }
    None
}

pub fn ensure_started() -> Result<u16, String> {
    if RUNNING.load(Ordering::SeqCst) {
        return Ok(PORT.load(Ordering::SeqCst));
    }
    let (listener, port) = try_bind(DEFAULT_PORT, MAX_PORT_RETRIES)
        .ok_or_else(|| format!("无法绑定 {DEFAULT_PORT}+ 端口"))?;
    PORT.store(port, Ordering::SeqCst);
    RUNNING.store(true, Ordering::SeqCst);
    let handle = thread::spawn(move || {
        for stream in listener.incoming() {
            if !RUNNING.load(Ordering::SeqCst) {
                break;
            }
            if let Ok(s) = stream {
                thread::spawn(move || handle_stream(s));
            }
        }
    });
    let slot = HANDLE.get_or_init(|| Mutex::new(None));
    if let Ok(mut g) = slot.lock() {
        *g = Some(handle);
    }
    Ok(port)
}

#[tauri::command]
pub fn music_request_forwarder_base_url() -> Result<String, String> {
    let port = ensure_started()?;
    Ok(format!("http://127.0.0.1:{port}"))
}

#[tauri::command]
pub fn music_request_forwarder_status() -> Result<serde_json::Value, String> {
    let running = RUNNING.load(Ordering::SeqCst);
    let port = PORT.load(Ordering::SeqCst);
    Ok(serde_json::json!({
        "running": running,
        "port": if running { port } else { 0 },
        "baseUrl": if running { format!("http://127.0.0.1:{port}") } else { String::new() },
    }))
}
