//! Legado 兼容 Web 服务 HTTP 层（替换规则 API；业务逻辑在前端 dispatch）

mod server {
    use std::collections::HashMap;
    use std::fs;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
    use std::sync::{Arc, Condvar, Mutex, OnceLock};
    use std::thread::{self, JoinHandle};
    use std::time::Duration;

    use base64::Engine;
    use serde::{Deserialize, Serialize};
    use tauri::{AppHandle, Emitter};
    use uuid::Uuid;

    use crate::local_addresses;
    use crate::web_multipart;
    use crate::web_socket;
    use crate::web_static;

    const REQUEST_EVENT: &str = "reader-web-api-request";
    const MAX_BODY_BYTES: usize = 64 * 1024 * 1024;
    static WEB_SERVICE_PORT: AtomicU16 = AtomicU16::new(1122);

    #[derive(Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct WebApiRequestPayload {
        id: String,
        path: String,
        method: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        body: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        query: Option<HashMap<String, String>>,
        #[serde(skip_serializing_if = "Option::is_none")]
        headers: Option<HashMap<String, String>>,
    }

    struct PendingMap {
        map: Mutex<HashMap<String, String>>,
        cvar: Condvar,
    }

    struct WebServiceRuntime {
        stop: Arc<AtomicBool>,
        pending: Arc<PendingMap>,
        handle: Mutex<Option<JoinHandle<()>>>,
        auth_enabled: Mutex<bool>,
        auth_token: Mutex<String>,
    }

    fn runtime() -> &'static WebServiceRuntime {
        static RUNTIME: OnceLock<WebServiceRuntime> = OnceLock::new();
        RUNTIME.get_or_init(|| WebServiceRuntime {
            stop: Arc::new(AtomicBool::new(false)),
            pending: Arc::new(PendingMap {
                map: Mutex::new(HashMap::new()),
                cvar: Condvar::new(),
            }),
            handle: Mutex::new(None),
            auth_enabled: Mutex::new(false),
            auth_token: Mutex::new(String::new()),
        })
    }

    pub fn set_web_http_auth(enabled: bool, token: String) {
        let rt = runtime();
        *rt.auth_enabled.lock().unwrap() = enabled;
        *rt.auth_token.lock().unwrap() = token.clone();
        web_socket::set_web_ws_auth(enabled, token);
    }

    fn parse_query(path: &str) -> HashMap<String, String> {
        let mut out = HashMap::new();
        let Some(qs) = path.split('?').nth(1) else {
            return out;
        };
        for pair in qs.split('&').filter(|s| !s.is_empty()) {
            if let Some((k, v)) = pair.split_once('=') {
                out.insert(k.to_string(), v.to_string());
            }
        }
        out
    }

    fn parse_request_headers(header_block: &str) -> HashMap<String, String> {
        let mut out = HashMap::new();
        for line in header_block.lines().skip(1) {
            if let Some((k, v)) = line.split_once(':') {
                out.insert(k.trim().to_ascii_lowercase(), v.trim().to_string());
            }
        }
        out
    }

    fn extract_token(
        query: &HashMap<String, String>,
        headers: &HashMap<String, String>,
    ) -> Option<String> {
        if let Some(t) = query.get("token") {
            if !t.is_empty() {
                return Some(t.clone());
            }
        }
        if let Some(auth) = headers.get("authorization") {
            let t = auth
                .strip_prefix("Bearer ")
                .or_else(|| auth.strip_prefix("bearer "))
                .unwrap_or(auth)
                .trim();
            if !t.is_empty() {
                return Some(t.to_string());
            }
        }
        headers.get("token").cloned()
    }

    fn check_http_auth(
        path_only: &str,
        query: &HashMap<String, String>,
        headers: &HashMap<String, String>,
    ) -> Option<String> {
        if path_only == "/api" {
            return None;
        }
        let rt = runtime();
        if !*rt.auth_enabled.lock().unwrap() {
            return None;
        }
        let expected = rt.auth_token.lock().unwrap().clone();
        if expected.is_empty() {
            return Some(
                r#"{"isSuccess":false,"errorMsg":"Web 服务已启用认证但未配置 Token","data":null}"#
                    .to_string(),
            );
        }
        let token = extract_token(query, headers);
        if token.as_deref() != Some(expected.as_str()) {
            return Some(
                r#"{"isSuccess":false,"errorMsg":"Unauthorized: invalid or missing token","data":null}"#
                    .to_string(),
            );
        }
        None
    }

    fn cors_headers(origin: Option<&str>) -> String {
        let allow_origin = origin.unwrap_or("*");
        format!(
            "Access-Control-Allow-Origin: {}\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: content-type,authorization,token\r\n",
            allow_origin
        )
    }

    fn build_net_addresses_json() -> String {
        let addrs = local_addresses::get_local_network_addresses();
        serde_json::json!({
            "isSuccess": true,
            "errorMsg": "",
            "data": addrs,
        })
        .to_string()
    }

    fn build_api_info_json(port: u16) -> String {
        let addrs = local_addresses::get_local_network_addresses();
        let access_urls: Vec<String> = addrs
            .iter()
            .map(|ip| format!("http://{}:{}", ip, port))
            .collect();
        serde_json::json!({
            "isSuccess": true,
            "errorMsg": "",
            "data": {
                "name": "Reader Web Service",
                "description": "Legado 兼容 REST API 与浏览器 Web UI（书架、阅读、书源、备份）",
                "port": port,
                "localAddresses": addrs,
                "accessUrls": access_urls,
                "hint": "浏览器访问根路径打开 Web UI；本接口为 API 说明",
                "endpoints": [
                    "/getBookshelf", "/getBookSources", "/getChapterList", "/getBookContent",
                    "/getReplaceRules", "/backup", "/saveBookProgress"
                ],
            }
        })
        .to_string()
    }

    fn try_serve_static(path: &str) -> Option<(Vec<u8>, &'static str)> {
        let Some((file, content_type)) = web_static::resolve_static_file(path) else {
            return None;
        };
        fs::read(&file).ok().map(|bytes| (bytes, content_type))
    }

    fn is_legado_api_path(path: &str) -> bool {
        let path_only = path.split('?').next().unwrap_or(path);
        matches!(
            path_only,
            "/getBookSource"
                | "/getBookSources"
                | "/getBookshelf"
                | "/getChapterList"
                | "/refreshToc"
                | "/getBookContent"
                | "/cover"
                | "/image"
                | "/getReadConfig"
                | "/getRssSource"
                | "/getRssSources"
                | "/getRssSorts"
                | "/getRssArticles"
                | "/refreshRssArticles"
                | "/getRssArticleRead"
                | "/clearRssArticles"
                | "/getRssReadRecords"
                | "/getRssStars"
                | "/deleteRssReadRecord"
                | "/saveRssStar"
                | "/deleteRssStar"
                | "/getReplaceRules"
                | "/backupPreview"
                | "/backup"
                | "/restoreBackup"
                | "/saveBookSource"
                | "/saveBookSources"
                | "/deleteBookSources"
                | "/saveBook"
                | "/deleteBook"
                | "/saveBookProgress"
                | "/addLocalBook"
                | "/saveReadConfig"
                | "/saveRssSource"
                | "/saveRssSources"
                | "/deleteRssSources"
                | "/saveReplaceRule"
                | "/deleteReplaceRule"
                | "/testReplaceRule"
                | "/debugBookSource"
                | "/debugRssSource"
        )
    }

    fn write_http_bytes(
        mut stream: std::net::TcpStream,
        status: &str,
        content_type: &str,
        body: &[u8],
        origin: Option<&str>,
        extra_headers: Option<&str>,
    ) {
        let extra = extra_headers.unwrap_or("");
        let response = format!(
            "HTTP/1.1 {}\r\nContent-Type: {}\r\nContent-Length: {}\r\n{}{}\r\n",
            status,
            content_type,
            body.len(),
            cors_headers(origin),
            extra
        );
        let _ = stream.write_all(response.as_bytes());
        let _ = stream.write_all(body);
    }

    fn write_http_response(
        stream: std::net::TcpStream,
        status: &str,
        content_type: &str,
        body: &str,
        origin: Option<&str>,
    ) {
        write_http_bytes(stream, status, content_type, body.as_bytes(), origin, None);
    }

    #[derive(Deserialize)]
    struct BridgeResponse {
        kind: Option<String>,
        body: Option<String>,
        content_type: Option<String>,
        filename: Option<String>,
        base64: Option<String>,
    }

    fn write_bridge_response(
        stream: std::net::TcpStream,
        response: &str,
        origin: Option<&str>,
    ) {
        if let Ok(parsed) = serde_json::from_str::<BridgeResponse>(response) {
            if parsed.kind.as_deref() == Some("binary") {
                if let Some(b64) = parsed.base64 {
                    if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(b64) {
                        let content_type = parsed
                            .content_type
                            .unwrap_or_else(|| "application/octet-stream".to_string());
                        let extra = parsed
                            .filename
                            .map(|name| format!("Content-Disposition: attachment; filename=\"{}\"\r\n", name))
                            .unwrap_or_default();
                        write_http_bytes(
                            stream,
                            "200 OK",
                            &content_type,
                            &bytes,
                            origin,
                            Some(&extra),
                        );
                        return;
                    }
                }
            }
            if let Some(body) = parsed.body {
                write_http_response(stream, "200 OK", "application/json; charset=utf-8", &body, origin);
                return;
            }
        }
        write_http_response(
            stream,
            "200 OK",
            "application/json; charset=utf-8",
            response,
            origin,
        );
    }

    fn read_full_body(
        stream: &mut std::net::TcpStream,
        initial: &[u8],
        content_length: usize,
    ) -> Vec<u8> {
        let mut body = initial.to_vec();
        if content_length > body.len() && content_length <= MAX_BODY_BYTES {
            let mut rest = vec![0u8; content_length - body.len()];
            if stream.read_exact(&mut rest).is_ok() {
                body.extend_from_slice(&rest);
            }
        }
        body
    }

    fn handle_connection(app: AppHandle, pending: Arc<PendingMap>, mut stream: std::net::TcpStream) {
        let mut buffer = [0u8; 8192];
        let read = match stream.read(&mut buffer) {
            Ok(n) if n > 0 => n,
            _ => return,
        };

        let request = String::from_utf8_lossy(&buffer[..read]);
        let mut lines = request.lines();
        let request_line = lines.next().unwrap_or("");
        let mut parts = request_line.split_whitespace();
        let method = parts.next().unwrap_or("GET").to_uppercase();
        let path = parts.next().unwrap_or("/").to_string();

        let header_end = request.find("\r\n\r\n").unwrap_or(read);
        let header_block = &request[..header_end.min(read)];
        let body_start = header_end + 4;
        let initial_body = if body_start < read {
            buffer[body_start..read].to_vec()
        } else {
            Vec::new()
        };

        let req_headers = parse_request_headers(header_block);
        let query = parse_query(&path);
        let mut content_length = 0usize;
        let mut origin: Option<String> = None;
        let mut content_type = String::new();

        for line in header_block.lines().skip(1) {
            let lower = line.to_ascii_lowercase();
            if let Some(v) = lower.strip_prefix("content-length:") {
                content_length = v.trim().parse().unwrap_or(0);
            }
            if let Some(v) = line.strip_prefix("Origin:").or_else(|| line.strip_prefix("origin:")) {
                origin = Some(v.trim().to_string());
            }
            if let Some(v) = lower.strip_prefix("content-type:") {
                content_type = v.trim().to_string();
            }
        }

        let body_bytes = read_full_body(&mut stream, &initial_body, content_length);
        let origin_ref = origin.as_deref();
        let path_only = path.split('?').next().unwrap_or(&path).to_string();

        if method == "OPTIONS" {
            write_http_response(stream, "204 No Content", "text/plain", "", origin_ref);
            return;
        }

        if method == "GET" && path_only == "/__reader/net-addresses" {
            let body = build_net_addresses_json();
            write_http_response(stream, "200 OK", "application/json; charset=utf-8", &body, origin_ref);
            return;
        }

        if method == "GET" && path_only == "/api" {
            let port = WEB_SERVICE_PORT.load(Ordering::Relaxed);
            let body = build_api_info_json(port);
            write_http_response(stream, "200 OK", "application/json; charset=utf-8", &body, origin_ref);
            return;
        }

        if !is_legado_api_path(&path) {
            if method == "GET" {
                if let Some((bytes, content_type)) = try_serve_static(&path) {
                    write_http_bytes(stream, "200 OK", content_type, &bytes, origin_ref, None);
                    return;
                }
            }
            write_http_response(
                stream,
                "404 Not Found",
                "application/json; charset=utf-8",
                r#"{"isSuccess":false,"errorMsg":"not found","data":null}"#,
                origin_ref,
            );
            return;
        }

        if let Some(auth_err) = check_http_auth(&path_only, &query, &req_headers) {
            write_http_response(stream, "401 Unauthorized", "application/json; charset=utf-8", &auth_err, origin_ref);
            return;
        }

        let mut body_json: Option<String> = None;
        if method == "POST" && path_only == "/addLocalBook" && content_type.contains("multipart/form-data") {
            let fields = web_multipart::parse_multipart(&body_bytes, &content_type);
            body_json = web_multipart::multipart_to_add_local_book_json(&fields);
        } else if method == "POST" && path_only == "/restoreBackup" && content_type.contains("multipart/form-data") {
            let fields = web_multipart::parse_multipart(&body_bytes, &content_type);
            body_json = web_multipart::multipart_to_add_local_book_json(&fields);
        } else if !body_bytes.is_empty() {
            body_json = Some(String::from_utf8_lossy(&body_bytes).into_owned());
        }

        let bridge_headers: HashMap<String, String> = req_headers
            .iter()
            .filter(|(k, _)| matches!(k.as_str(), "authorization" | "token"))
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect();

        let id = Uuid::new_v4().to_string();
        let payload = WebApiRequestPayload {
            id: id.clone(),
            path: path.clone(),
            method: method.clone(),
            body: body_json,
            query: if query.is_empty() { None } else { Some(query) },
            headers: if bridge_headers.is_empty() {
                None
            } else {
                Some(bridge_headers)
            },
        };

        if app.emit(REQUEST_EVENT, payload).is_err() {
            write_http_response(
                stream,
                "503 Service Unavailable",
                "application/json; charset=utf-8",
                r#"{"isSuccess":false,"errorMsg":"app not ready","data":null}"#,
                origin_ref,
            );
            return;
        }

        let timeout_secs = if path_only == "/addLocalBook" || path_only == "/restoreBackup" || path_only == "/debugBookSource" || path_only == "/debugRssSource" {
            120
        } else {
            45
        };

        let response = {
            let mut map = pending.map.lock().unwrap();
            let deadline = std::time::Instant::now() + Duration::from_secs(timeout_secs);
            loop {
                if let Some(resp) = map.remove(&id) {
                    break resp;
                }
                let now = std::time::Instant::now();
                if now >= deadline {
                    break r#"{"isSuccess":false,"errorMsg":"timeout","data":null}"#.to_string();
                }
                let wait = deadline.saturating_duration_since(now);
                let (guard, timeout) = pending
                    .cvar
                    .wait_timeout(map, wait)
                    .unwrap_or_else(|e| e.into_inner());
                map = guard;
                if timeout.timed_out() && !map.contains_key(&id) {
                    break r#"{"isSuccess":false,"errorMsg":"timeout","data":null}"#.to_string();
                }
            }
        };

        write_bridge_response(stream, &response, origin_ref);
    }

    pub fn web_api_complete(id: String, response: String) -> Result<(), String> {
        let pending = &runtime().pending;
        {
            let mut map = pending.map.lock().map_err(|e| e.to_string())?;
            map.insert(id, response);
        }
        pending.cvar.notify_all();
        Ok(())
    }

    pub fn start_reader_web_service(app: AppHandle, port: u16) -> Result<(), String> {
        stop_reader_web_service()?;

        web_static::init_web_ui_root(&app);

        WEB_SERVICE_PORT.store(port, Ordering::Relaxed);
        web_socket::set_ws_app_handle(app.clone());

        let rt = runtime();
        rt.stop.store(false, Ordering::SeqCst);
        let stop_flag = Arc::clone(&rt.stop);
        let pending = Arc::clone(&rt.pending);
        let app_handle = app.clone();

        let listener = TcpListener::bind(("0.0.0.0", port))
            .map_err(|e| format!("绑定端口 {} 失败: {}", port, e))?;
        listener
            .set_nonblocking(true)
            .map_err(|e| format!("设置非阻塞失败: {}", e))?;

        let handle = thread::spawn(move || {
            while !stop_flag.load(Ordering::SeqCst) {
                match listener.accept() {
                    Ok((stream, _)) => {
                        let app = app_handle.clone();
                        let pending = Arc::clone(&pending);
                        thread::spawn(move || handle_connection(app, pending, stream));
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(20));
                    }
                    Err(_) => break,
                }
            }
        });

        *rt.handle.lock().map_err(|e| e.to_string())? = Some(handle);

        if port < 65535 {
            web_socket::start_web_ws_server(port + 1)?;
        }
        Ok(())
    }

    pub fn stop_reader_web_service() -> Result<(), String> {
        let rt = runtime();
        rt.stop.store(true, Ordering::SeqCst);
        let _ = web_socket::stop_web_ws_server();
        if let Some(handle) = rt.handle.lock().map_err(|e| e.to_string())?.take() {
            let _ = handle.join();
        }
        Ok(())
    }
}

pub use server::{set_web_http_auth, start_reader_web_service, stop_reader_web_service, web_api_complete};

#[tauri::command]
pub fn web_api_complete_cmd(id: String, response: String) -> Result<(), String> {
    web_api_complete(id, response)
}

#[tauri::command]
pub fn start_reader_web_service_cmd(
    app: tauri::AppHandle,
    port: Option<u16>,
    auth_enabled: Option<bool>,
    auth_token: Option<String>,
) -> Result<(), String> {
    let p = port.unwrap_or(1122);
    set_web_http_auth(auth_enabled.unwrap_or(false), auth_token.unwrap_or_default());
    start_reader_web_service(app, p)
}

#[tauri::command]
pub fn stop_reader_web_service_cmd() -> Result<(), String> {
    stop_reader_web_service()
}
