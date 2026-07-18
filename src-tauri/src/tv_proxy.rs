//! 影视本地 HTTP Proxy（对齐 FongMi 9978–9998 `/proxy` + LOCAL `/action` 子集）

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::atomic::{AtomicBool, AtomicU16, AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Mutex, OnceLock};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use base64::Engine;
use tauri::{AppHandle, Emitter};

static RUNNING: AtomicBool = AtomicBool::new(false);
static PORT: AtomicU16 = AtomicU16::new(0);
static HANDLE: OnceLock<Mutex<Option<JoinHandle<()>>>> = OnceLock::new();
static APP: OnceLock<AppHandle> = OnceLock::new();
static REQ_ID: AtomicU64 = AtomicU64::new(1);
static PENDING: OnceLock<Mutex<HashMap<u64, Sender<JsProxyResult>>>> = OnceLock::new();
static MEDIA_JSON: OnceLock<Mutex<String>> = OnceLock::new();

#[derive(Clone)]
struct JsProxyResult {
    code: i32,
    mime: String,
    body: Vec<u8>,
    headers: HashMap<String, String>,
}

fn pending_map() -> &'static Mutex<HashMap<u64, Sender<JsProxyResult>>> {
    PENDING.get_or_init(|| Mutex::new(HashMap::new()))
}

fn media_json() -> &'static Mutex<String> {
    MEDIA_JSON.get_or_init(|| Mutex::new(r#"{"playing":false}"#.into()))
}

pub fn bind_app(app: AppHandle) {
    let _ = APP.set(app);
}

fn parse_query(path: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let q = path.split_once('?').map(|(_, q)| q).unwrap_or("");
    for part in q.split('&') {
        if part.is_empty() {
            continue;
        }
        let (k, v) = part.split_once('=').unwrap_or((part, ""));
        map.insert(
            urlencoding_decode(k),
            urlencoding_decode(v),
        );
    }
    map
}

fn urlencoding_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
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
            c => {
                out.push(c);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn cors_preflight(stream: &mut std::net::TcpStream) {
    let resp = "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET,POST,OPTIONS\r\nAccess-Control-Allow-Headers: *\r\nAccess-Control-Max-Age: 86400\r\nConnection: close\r\n\r\n";
    let _ = stream.write_all(resp.as_bytes());
}

fn write_response(
    stream: &mut std::net::TcpStream,
    code: i32,
    mime: &str,
    body: &[u8],
    extra_headers: &HashMap<String, String>,
) {
    let status = match code {
        200 => "200 OK",
        204 => "204 No Content",
        400 => "400 Bad Request",
        404 => "404 Not Found",
        502 => "502 Bad Gateway",
        _ if (100..=599).contains(&code) => "200 OK",
        _ => "500 Internal Server Error",
    };
    // Prefer explicit status line from code when not in short list
    let status_line = if (100..=599).contains(&code) && code != 200 && code != 204 && code != 400 && code != 404 && code != 502 {
        format!("{code} Proxy")
    } else {
        status.to_string()
    };
    let mut header = format!(
        "HTTP/1.1 {status_line}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET,POST,OPTIONS\r\nAccess-Control-Allow-Headers: *\r\nContent-Type: {mime}\r\nContent-Length: {}\r\nConnection: close\r\n",
        body.len()
    );
    for (k, v) in extra_headers {
        let lk = k.to_lowercase();
        if lk == "content-length" || lk == "content-type" || lk.starts_with("access-control") {
            continue;
        }
        header.push_str(&format!("{k}: {v}\r\n"));
    }
    header.push_str("\r\n");
    let _ = stream.write_all(header.as_bytes());
    let _ = stream.write_all(body);
}

fn handle_jar_proxy(params: &HashMap<String, String>) -> Result<JsProxyResult, String> {
    #[cfg(target_os = "android")]
    {
        let app = APP.get().ok_or_else(|| "tv proxy app not bound".to_string())?;
        let params_json = serde_json::to_string(params).unwrap_or_else(|_| "{}".into());
        let resp = crate::platform::android::tv_spider::invoke_proxy(app, params_json)?;
        let body = base64::engine::general_purpose::STANDARD
            .decode(resp.body_base64.as_bytes())
            .unwrap_or_default();
        let mut headers = HashMap::new();
        if let Some(obj) = resp.headers.as_object() {
            for (k, v) in obj {
                if let Some(s) = v.as_str() {
                    headers.insert(k.clone(), s.to_string());
                }
            }
        }
        return Ok(JsProxyResult {
            code: resp.code,
            mime: resp.mime,
            body,
            headers,
        });
    }
    #[cfg(not(target_os = "android"))]
    {
        let mut json_params = serde_json::Map::new();
        for (k, v) in params {
            json_params.insert(k.clone(), serde_json::Value::String(v.clone()));
        }
        let raw = crate::tv_jar_host::jar_proxy(serde_json::Value::Object(json_params))?;
        let v: serde_json::Value =
            serde_json::from_str(&raw).map_err(|e| format!("proxy json: {e}"))?;
        let code = v.get("code").and_then(|c| c.as_i64()).unwrap_or(500) as i32;
        let mime = v
            .get("mime")
            .and_then(|m| m.as_str())
            .unwrap_or("application/octet-stream")
            .to_string();
        let b64 = v
            .get("bodyBase64")
            .and_then(|b| b.as_str())
            .unwrap_or("");
        let body = base64::engine::general_purpose::STANDARD
            .decode(b64.as_bytes())
            .unwrap_or_default();
        let mut headers = HashMap::new();
        if let Some(obj) = v.get("headers").and_then(|h| h.as_object()) {
            for (k, val) in obj {
                if let Some(s) = val.as_str() {
                    headers.insert(k.clone(), s.to_string());
                }
            }
        }
        Ok(JsProxyResult {
            code,
            mime,
            body,
            headers,
        })
    }
}

fn handle_http_fetch_proxy(params: &HashMap<String, String>) -> Result<JsProxyResult, String> {
    let url = params
        .get("url")
        .cloned()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "do=http missing url".to_string())?;
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("do=http only allows http(s)".into());
    }
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(45))
        .redirect(reqwest::redirect::Policy::limited(10))
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = client.get(&url);
    // 透传常用头（来自 query header_ / 播放页可能拼接）
    if let Some(ua) = params.get("User-Agent").or_else(|| params.get("user-agent")) {
        req = req.header("User-Agent", ua);
    } else {
        req = req.header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        );
    }
    if let Some(ref_url) = params.get("Referer").or_else(|| params.get("referer")) {
        req = req.header("Referer", ref_url);
    }
    if let Some(cookie) = params.get("Cookie").or_else(|| params.get("cookie")) {
        req = req.header("Cookie", cookie);
    }
    let resp = req.send().map_err(|e| format!("http proxy fetch: {e}"))?;
    let status = resp.status().as_u16() as i32;
    let mime = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();
    let bytes = resp.bytes().map_err(|e| e.to_string())?.to_vec();

    // m3u8：把分片/子播放列表 URL 改写到本代理，避免播放器二次直连踩 CORS
    let looks_m3u8 = mime.contains("mpegurl")
        || mime.contains("m3u8")
        || url.to_lowercase().contains(".m3u8")
        || params.get("do").map(|d| d == "m3u8").unwrap_or(false);
    let body = if looks_m3u8 {
        rewrite_m3u8_playlist(&url, &bytes)
    } else {
        bytes
    };
    let out_mime = if looks_m3u8 {
        "application/vnd.apple.mpegurl".to_string()
    } else {
        mime
    };
    Ok(JsProxyResult {
        code: if (200..400).contains(&status) { 200 } else { status },
        mime: out_mime,
        body,
        headers: HashMap::new(),
    })
}

fn rewrite_m3u8_playlist(playlist_url: &str, raw: &[u8]) -> Vec<u8> {
    let text = String::from_utf8_lossy(raw);
    if !text.contains("#EXTM3U") {
        return raw.to_vec();
    }
    let port = PORT.load(Ordering::SeqCst);
    if port == 0 {
        return raw.to_vec();
    }
    let proxy_prefix = format!("http://127.0.0.1:{port}/proxy?do=http&url=");
    let base = match reqwest::Url::parse(playlist_url) {
        Ok(u) => u,
        Err(_) => return raw.to_vec(),
    };
    let mut out = String::with_capacity(text.len() + 256);
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            // #EXT-X-KEY:URI="..." / #EXT-X-MAP:URI="..."
            if let Some(rewritten) = rewrite_m3u8_tag_uris(line, &base, &proxy_prefix) {
                out.push_str(&rewritten);
            } else {
                out.push_str(line);
            }
            out.push('\n');
            continue;
        }
        let abs = match base.join(trimmed) {
            Ok(u) => u.to_string(),
            Err(_) => trimmed.to_string(),
        };
        out.push_str(&proxy_prefix);
        out.push_str(&urlencoding_encode(&abs));
        out.push('\n');
    }
    out.into_bytes()
}

fn rewrite_m3u8_tag_uris(line: &str, base: &reqwest::Url, proxy_prefix: &str) -> Option<String> {
    // 简易：替换 URI="..."
    let key = "URI=\"";
    let start = line.find(key)? + key.len();
    let end = line[start..].find('"')? + start;
    let uri = &line[start..end];
    let abs = base.join(uri).ok()?.to_string();
    let mut out = String::with_capacity(line.len() + 64);
    out.push_str(&line[..start]);
    out.push_str(proxy_prefix);
    out.push_str(&urlencoding_encode(&abs));
    out.push_str(&line[end..]);
    Some(out)
}

fn urlencoding_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn handle_js_proxy(params: HashMap<String, String>) -> Result<JsProxyResult, String> {
    let app = APP.get().ok_or_else(|| "tv proxy app not bound".to_string())?;
    let id = REQ_ID.fetch_add(1, Ordering::SeqCst);
    let (tx, rx): (Sender<JsProxyResult>, Receiver<JsProxyResult>) = mpsc::channel();
    pending_map()
        .lock()
        .map_err(|e| e.to_string())?
        .insert(id, tx);
    let payload = serde_json::json!({ "id": id, "params": params });
    app.emit("tv-proxy-request", payload)
        .map_err(|e| e.to_string())?;
    match rx.recv_timeout(Duration::from_secs(45)) {
        Ok(r) => Ok(r),
        Err(_) => {
            let _ = pending_map().lock().map(|mut m| m.remove(&id));
            Err("js proxy timeout".into())
        }
    }
}

fn handle_proxy_path(path: &str) -> Result<JsProxyResult, String> {
    let params = parse_query(path);
    // Merge path-only keys
    if !params.contains_key("do") && path.contains("do=") {
        // already in query
    }
    let do_kind = params.get("do").cloned().unwrap_or_default();
    if do_kind == "http" || do_kind == "m3u8" || do_kind == "raw" {
        return handle_http_fetch_proxy(&params);
    }
    if do_kind == "js" || do_kind == "py" {
        return handle_js_proxy(params);
    }
    if params.contains_key("siteKey") && do_kind.is_empty() {
        // siteKey alone usually jar/spider proxy — still try jar first
        return handle_jar_proxy(&params);
    }
    if do_kind.is_empty() || do_kind == "jar" {
        return handle_jar_proxy(&params);
    }
    // fallback: try js bridge
    handle_js_proxy(params)
}

fn handle_action(path: &str) -> (i32, String, String) {
    let params = parse_query(path);
    let do_kind = params.get("do").cloned().unwrap_or_default();
    match do_kind.as_str() {
        "search" => {
            let word = params.get("word").cloned().unwrap_or_default();
            if let Some(app) = APP.get() {
                let _ = app.emit("tv-local-action", serde_json::json!({ "do": "search", "word": word }));
            }
            (200, r#"{"code":0,"msg":"ok"}"#.into(), "application/json".into())
        }
        "push" => {
            let url = params.get("url").cloned().unwrap_or_default();
            if let Some(app) = APP.get() {
                let _ = app.emit(
                    "tv-local-action",
                    serde_json::json!({ "do": "push", "url": url }),
                );
            }
            (200, r#"{"code":0,"msg":"ok"}"#.into(), "application/json".into())
        }
        "setting" => {
            let url = params.get("url").cloned().unwrap_or_default();
            if let Some(app) = APP.get() {
                let _ = app.emit(
                    "tv-local-action",
                    serde_json::json!({ "do": "setting", "url": url }),
                );
            }
            (200, r#"{"code":0,"msg":"ok"}"#.into(), "application/json".into())
        }
        "control" => {
            let typ = params.get("type").cloned().unwrap_or_default();
            if let Some(app) = APP.get() {
                let _ = app.emit(
                    "tv-local-action",
                    serde_json::json!({ "do": "control", "type": typ }),
                );
            }
            (200, "OK".into(), "text/plain".into())
        }
        _ => (
            200,
            format!(r#"{{"code":0,"msg":"action stub","do":"{do_kind}"}}"#),
            "application/json".into(),
        ),
    }
}

fn handle_stream(mut stream: std::net::TcpStream) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(30)));
    let mut buf = [0u8; 65536];
    let n = match stream.read(&mut buf) {
        Ok(n) if n > 0 => n,
        _ => return,
    };
    let req = String::from_utf8_lossy(&buf[..n]);
    let first = req.lines().next().unwrap_or("");
    let method = first.split_whitespace().next().unwrap_or("GET");
    let path = first.split_whitespace().nth(1).unwrap_or("/");

    if method.eq_ignore_ascii_case("OPTIONS") {
        cors_preflight(&mut stream);
        return;
    }

    if path.starts_with("/proxy") {
        match handle_proxy_path(path) {
            Ok(r) => write_response(&mut stream, r.code, &r.mime, &r.body, &r.headers),
            Err(e) => {
                let body = format!(r#"{{"ok":false,"error":{}}}"#, serde_json::to_string(&e).unwrap_or_else(|_| "\"err\"".into()));
                write_response(
                    &mut stream,
                    502,
                    "application/json",
                    body.as_bytes(),
                    &HashMap::new(),
                );
            }
        }
        return;
    }

    if path == "/health" || path == "/" {
        write_response(
            &mut stream,
            200,
            "text/plain",
            b"ok",
            &HashMap::new(),
        );
        return;
    }

    if path.starts_with("/action") {
        let (code, body, mime) = handle_action(path);
        write_response(&mut stream, code, &mime, body.as_bytes(), &HashMap::new());
        return;
    }

    if path.starts_with("/media") {
        let body = media_json()
            .lock()
            .map(|g| g.clone())
            .unwrap_or_else(|_| r#"{"playing":false}"#.into());
        write_response(
            &mut stream,
            200,
            "application/json",
            body.as_bytes(),
            &HashMap::new(),
        );
        return;
    }

    write_response(
        &mut stream,
        404,
        "text/plain",
        b"not found",
        &HashMap::new(),
    );
}

fn try_bind(start: u16, end: u16) -> Option<(TcpListener, u16)> {
    for port in start..=end {
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
    let (listener, port) = try_bind(9978, 9998).ok_or_else(|| "无法绑定 9978–9998".to_string())?;
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
pub fn tv_proxy_base_url(app: AppHandle) -> Result<String, String> {
    bind_app(app);
    let port = ensure_started()?;
    Ok(format!("http://127.0.0.1:{port}/proxy"))
}

#[tauri::command]
pub fn tv_local_api_base_url(app: AppHandle) -> Result<String, String> {
    bind_app(app);
    let port = ensure_started()?;
    Ok(format!("http://127.0.0.1:{port}"))
}

#[tauri::command]
pub fn tv_proxy_resolve(
    id: u64,
    code: i32,
    mime: String,
    body_base64: String,
    headers: Option<HashMap<String, String>>,
) -> Result<(), String> {
    let body = base64::engine::general_purpose::STANDARD
        .decode(body_base64.as_bytes())
        .map_err(|e| e.to_string())?;
    let result = JsProxyResult {
        code,
        mime,
        body,
        headers: headers.unwrap_or_default(),
    };
    let tx = pending_map()
        .lock()
        .map_err(|e| e.to_string())?
        .remove(&id)
        .ok_or_else(|| format!("unknown proxy request id {id}"))?;
    tx.send(result).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn tv_media_report(json: String) -> Result<(), String> {
    let mut g = media_json().lock().map_err(|e| e.to_string())?;
    *g = json;
    Ok(())
}
