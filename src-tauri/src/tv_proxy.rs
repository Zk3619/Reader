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
    let resp = "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET,HEAD,POST,OPTIONS\r\nAccess-Control-Allow-Headers: *\r\nAccess-Control-Max-Age: 86400\r\nConnection: close\r\n\r\n";
    let _ = stream.write_all(resp.as_bytes());
}

fn write_response(
    stream: &mut std::net::TcpStream,
    code: i32,
    mime: &str,
    body: &[u8],
    extra_headers: &HashMap<String, String>,
) {
    let status_line = http_status_line(code);
    let mut header = format!(
        "HTTP/1.1 {status_line}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET,POST,OPTIONS\r\nAccess-Control-Allow-Headers: *\r\nAccept-Ranges: bytes\r\nContent-Type: {mime}\r\nContent-Length: {}\r\nConnection: close\r\n",
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

fn http_status_line(code: i32) -> String {
    match code {
        200 => "200 OK".into(),
        204 => "204 No Content".into(),
        206 => "206 Partial Content".into(),
        400 => "400 Bad Request".into(),
        403 => "403 Forbidden".into(),
        404 => "404 Not Found".into(),
        416 => "416 Range Not Satisfiable".into(),
        502 => "502 Bad Gateway".into(),
        c if (100..=599).contains(&c) => format!("{c} Proxy"),
        _ => "500 Internal Server Error".into(),
    }
}

/// 常见防盗链 CDN：缺 Referer 时补站点根
fn infer_default_referer(url: &str) -> Option<&'static str> {
    let lower = url.to_lowercase();
    if lower.contains("qpic.cn")
        || lower.contains("qq.com")
        || lower.contains("v.qq")
        || lower.contains("tfogc.com")
        || lower.contains("vfiles.gtimg")
    {
        return Some("https://v.qq.com/");
    }
    if lower.contains("iqiyi.com") || lower.contains("qy.net") || lower.contains("qiyi.com") {
        return Some("https://www.iqiyi.com/");
    }
    if lower.contains("youku.com") || lower.contains("ykimg.com") {
        return Some("https://www.youku.com/");
    }
    if lower.contains("bilivideo") || lower.contains("bilibili.com") || lower.contains("hdslb.com") {
        return Some("https://www.bilibili.com/");
    }
    if lower.contains("mgtv.com") || lower.contains("hitv.com") {
        return Some("https://www.mgtv.com/");
    }
    None
}

fn build_upstream_request(
    client: &reqwest::blocking::Client,
    url: &str,
    params: &HashMap<String, String>,
    method: &str,
) -> reqwest::blocking::RequestBuilder {
    let mut req = if method.eq_ignore_ascii_case("HEAD") {
        client.head(url)
    } else {
        client.get(url)
    };
    if let Some(ua) = params.get("User-Agent").or_else(|| params.get("user-agent")) {
        req = req.header("User-Agent", ua);
    } else {
        req = req.header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        );
    }
    let referer = params
        .get("Referer")
        .or_else(|| params.get("referer"))
        .cloned()
        .filter(|s| !s.is_empty())
        .or_else(|| infer_default_referer(url).map(|s| s.to_string()));
    if let Some(ref_url) = referer {
        req = req.header("Referer", ref_url);
    }
    if let Some(cookie) = params.get("Cookie").or_else(|| params.get("cookie")) {
        req = req.header("Cookie", cookie);
    }
    // 透传 Range（HTML5 video / HLS 分片都依赖）
    if let Some(range) = params
        .get("Range")
        .or_else(|| params.get("range"))
        .filter(|s| !s.is_empty())
    {
        req = req.header("Range", range);
    }
    req
}

/// 流式代理：支持 Range/206 / HEAD；m3u8 仍缓冲改写
fn handle_http_fetch_proxy_to_stream(
    stream: &mut std::net::TcpStream,
    params: &HashMap<String, String>,
    method: &str,
) {
    let url = match params.get("url").cloned().filter(|s| !s.is_empty()) {
        Some(u) if u.starts_with("http://") || u.starts_with("https://") => u,
        Some(_) => {
            write_response(
                stream,
                400,
                "application/json",
                br#"{"ok":false,"error":"do=http only allows http(s)"}"#,
                &HashMap::new(),
            );
            return;
        }
        None => {
            write_response(
                stream,
                400,
                "application/json",
                br#"{"ok":false,"error":"do=http missing url"}"#,
                &HashMap::new(),
            );
            return;
        }
    };

    let range = params
        .get("Range")
        .or_else(|| params.get("range"))
        .cloned()
        .unwrap_or_default();
    eprintln!(
        "[tv-proxy] do=http upstream={} range={} hasReferer={}",
        url,
        if range.is_empty() { "-" } else { range.as_str() },
        params.contains_key("Referer")
            || params.contains_key("referer")
            || infer_default_referer(&url).is_some()
    );

    let client = match reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(60))
        .redirect(reqwest::redirect::Policy::limited(10))
        .danger_accept_invalid_certs(true)
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            let body = format!(
                r#"{{"ok":false,"error":{}}}"#,
                serde_json::to_string(&e.to_string()).unwrap_or_else(|_| "\"err\"".into())
            );
            write_response(stream, 502, "application/json", body.as_bytes(), &HashMap::new());
            return;
        }
    };

    let resp = match build_upstream_request(&client, &url, params, method).send() {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[tv-proxy] upstream fetch error: {e}");
            let body = format!(
                r#"{{"ok":false,"error":{}}}"#,
                serde_json::to_string(&format!("http proxy fetch: {e}"))
                    .unwrap_or_else(|_| "\"err\"".into())
            );
            write_response(stream, 502, "application/json", body.as_bytes(), &HashMap::new());
            return;
        }
    };

    let status = resp.status().as_u16() as i32;
    let mime = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();
    let content_range = resp
        .headers()
        .get(reqwest::header::CONTENT_RANGE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let content_length = resp
        .headers()
        .get(reqwest::header::CONTENT_LENGTH)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let accept_ranges = resp
        .headers()
        .get(reqwest::header::ACCEPT_RANGES)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let known_m3u8 = params.get("do").map(|d| d == "m3u8").unwrap_or(false)
        || mime.contains("mpegurl")
        || mime.contains("m3u8")
        || url.to_lowercase().contains(".m3u8");

    // HEAD：只回状态与头，供前端探测 Content-Type
    if method.eq_ignore_ascii_case("HEAD") {
        let status_line = http_status_line(status);
        let mut header = format!(
            "HTTP/1.1 {status_line}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET,POST,OPTIONS,HEAD\r\nAccess-Control-Allow-Headers: *\r\nContent-Type: {mime}\r\nAccept-Ranges: {}\r\nConnection: close\r\n",
            accept_ranges.as_deref().unwrap_or("bytes")
        );
        if let Some(cl) = &content_length {
            header.push_str(&format!("Content-Length: {cl}\r\n"));
        }
        if let Some(cr) = &content_range {
            header.push_str(&format!("Content-Range: {cr}\r\n"));
        }
        header.push_str("\r\n");
        let _ = stream.write_all(header.as_bytes());
        eprintln!("[tv-proxy] do=http HEAD status={status} mime={mime} upstream={url}");
        return;
    }

    // 已知 m3u8：整包缓冲并改写分片 URL
    if known_m3u8 {
        let bytes = match resp.bytes() {
            Ok(b) => b.to_vec(),
            Err(e) => {
                let body = format!(
                    r#"{{"ok":false,"error":{}}}"#,
                    serde_json::to_string(&e.to_string()).unwrap_or_else(|_| "\"err\"".into())
                );
                write_response(stream, 502, "application/json", body.as_bytes(), &HashMap::new());
                return;
            }
        };
        let body = rewrite_m3u8_playlist(&url, &bytes, params);
        eprintln!("[tv-proxy] do=http m3u8 status={status} bytes={} upstream={url}", body.len());
        write_response(
            stream,
            if (200..400).contains(&status) { 200 } else { status },
            "application/vnd.apple.mpegurl",
            &body,
            &HashMap::new(),
        );
        return;
    }

    // 流式：peek 魔数，无扩展名的 m3u8 也能改写
    let mut resp = resp;
    let mut peek = [0u8; 16];
    let peeked = match std::io::Read::read(&mut resp, &mut peek) {
        Ok(n) => n,
        Err(_) => 0,
    };
    let peek_is_m3u8 =
        peeked > 0 && String::from_utf8_lossy(&peek[..peeked]).contains("#EXTM3U");

    if peek_is_m3u8 {
        let mut rest = Vec::with_capacity(4096);
        rest.extend_from_slice(&peek[..peeked]);
        let _ = std::io::Read::read_to_end(&mut resp, &mut rest);
        let body = rewrite_m3u8_playlist(&url, &rest, params);
        eprintln!(
            "[tv-proxy] do=http sniffed-m3u8 status={status} bytes={} upstream={url}",
            body.len()
        );
        write_response(
            stream,
            if (200..400).contains(&status) { 200 } else { status },
            "application/vnd.apple.mpegurl",
            &body,
            &HashMap::new(),
        );
        return;
    }

    let status_line = http_status_line(status);
    let out_mime = if mime.is_empty() {
        "application/octet-stream"
    } else {
        mime.as_str()
    };
    let mut header = format!(
        "HTTP/1.1 {status_line}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET,POST,OPTIONS\r\nAccess-Control-Allow-Headers: *\r\nContent-Type: {out_mime}\r\nAccept-Ranges: {}\r\nConnection: close\r\n",
        accept_ranges.as_deref().unwrap_or("bytes")
    );
    // Content-Length 保持上游值（peek 字节仍会计入响应体）
    if let Some(cl) = &content_length {
        header.push_str(&format!("Content-Length: {cl}\r\n"));
    }
    if let Some(cr) = &content_range {
        header.push_str(&format!("Content-Range: {cr}\r\n"));
    }
    header.push_str("\r\n");
    if stream.write_all(header.as_bytes()).is_err() {
        return;
    }
    if peeked > 0 && stream.write_all(&peek[..peeked]).is_err() {
        return;
    }
    let mut buf = [0u8; 64 * 1024];
    loop {
        match std::io::Read::read(&mut resp, &mut buf) {
            Ok(0) => break,
            Ok(n) => {
                if stream.write_all(&buf[..n]).is_err() {
                    break;
                }
            }
            Err(_) => break,
        }
    }
    eprintln!("[tv-proxy] do=http streamed status={status} mime={mime} upstream={url}");
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

fn proxy_header_query_suffix(params: &HashMap<String, String>, media_url: &str) -> String {
    let mut suffix = String::new();
    let mut referer = params
        .get("Referer")
        .or_else(|| params.get("referer"))
        .cloned()
        .filter(|s| !s.is_empty());
    if referer.is_none() {
        referer = infer_default_referer(media_url).map(|s| s.to_string());
    }
    if let Some(v) = referer {
        suffix.push_str("&Referer=");
        suffix.push_str(&urlencoding_encode(&v));
    }
    for key in ["User-Agent", "Cookie"] {
        if let Some(v) = params.get(key).filter(|s| !s.is_empty()) {
            suffix.push('&');
            suffix.push_str(key);
            suffix.push('=');
            suffix.push_str(&urlencoding_encode(v));
        }
    }
    suffix
}

fn rewrite_m3u8_playlist(
    playlist_url: &str,
    raw: &[u8],
    params: &HashMap<String, String>,
) -> Vec<u8> {
    let text = String::from_utf8_lossy(raw);
    if !text.contains("#EXTM3U") {
        return raw.to_vec();
    }
    let port = PORT.load(Ordering::SeqCst);
    if port == 0 {
        return raw.to_vec();
    }
    let header_qs = proxy_header_query_suffix(params, playlist_url);
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
            if let Some(rewritten) =
                rewrite_m3u8_tag_uris(line, &base, &proxy_prefix, &header_qs)
            {
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
        out.push_str(&header_qs);
        out.push('\n');
    }
    out.into_bytes()
}

fn rewrite_m3u8_tag_uris(
    line: &str,
    base: &reqwest::Url,
    proxy_prefix: &str,
    header_qs: &str,
) -> Option<String> {
    // 简易：替换 URI="..."
    let key = "URI=\"";
    let start = line.find(key)? + key.len();
    let end = line[start..].find('"')? + start;
    let uri = &line[start..end];
    let abs = base.join(uri).ok()?.to_string();
    let mut out = String::with_capacity(line.len() + 64 + header_qs.len());
    out.push_str(&line[..start]);
    out.push_str(proxy_prefix);
    out.push_str(&urlencoding_encode(&abs));
    out.push_str(header_qs);
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

/// 对齐 FongMi Proxy：把 HTTP 请求头并入 params（query 优先，不覆盖已有键）
fn merge_request_headers_into_params(
    params: &mut HashMap<String, String>,
    headers: &HashMap<String, String>,
) {
    for (k, v) in headers {
        let lk = k.to_lowercase();
        // 跳过 hop-by-hop / 宿主相关头，避免污染上游
        if matches!(
            lk.as_str(),
            "host"
                | "connection"
                | "content-length"
                | "transfer-encoding"
                | "accept-encoding"
                | "origin"
                | "sec-fetch-site"
                | "sec-fetch-mode"
                | "sec-fetch-dest"
                | "sec-ch-ua"
                | "sec-ch-ua-mobile"
                | "sec-ch-ua-platform"
        ) {
            continue;
        }
        // 保留常见大小写键名，便于上游识别
        let key = match lk.as_str() {
            "user-agent" => "User-Agent".to_string(),
            "referer" => "Referer".to_string(),
            "cookie" => "Cookie".to_string(),
            "range" => "Range".to_string(),
            _ => k.clone(),
        };
        params.entry(key).or_insert_with(|| v.clone());
    }
}

fn handle_proxy_path(
    path: &str,
    request_headers: &HashMap<String, String>,
) -> Result<JsProxyResult, String> {
    let mut params = parse_query(path);
    merge_request_headers_into_params(&mut params, request_headers);
    let do_kind = params.get("do").cloned().unwrap_or_default();
    // http/m3u8/raw 由 handle_stream 走流式路径，不应进入此处
    if do_kind == "js" || do_kind == "py" {
        return handle_js_proxy(params);
    }
    handle_jar_proxy(&params)
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

fn parse_request_headers(req: &str) -> HashMap<String, String> {
    let mut headers = HashMap::new();
    let mut lines = req.lines();
    let _ = lines.next(); // request line
    for line in lines {
        if line.is_empty() {
            break;
        }
        if let Some((k, v)) = line.split_once(':') {
            let key = k.trim();
            let val = v.trim();
            if !key.is_empty() {
                headers.insert(key.to_string(), val.to_string());
            }
        }
    }
    headers
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
    let request_headers = parse_request_headers(&req);

    if method.eq_ignore_ascii_case("OPTIONS") {
        cors_preflight(&mut stream);
        return;
    }

    if path.starts_with("/proxy") {
        let mut params = parse_query(path);
        merge_request_headers_into_params(&mut params, &request_headers);
        let do_kind = params.get("do").cloned().unwrap_or_default();
        if do_kind == "http" || do_kind == "m3u8" || do_kind == "raw" {
            handle_http_fetch_proxy_to_stream(&mut stream, &params, method);
            return;
        }
        match handle_proxy_path(path, &request_headers) {
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
