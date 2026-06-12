//! Legado 兼容 Web 服务 HTTP 层（替换规则 API；业务逻辑在前端 dispatch）

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod desktop {
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
    use crate::web_static;

    const REQUEST_EVENT: &str = "reader-web-api-request";
    static WEB_SERVICE_PORT: AtomicU16 = AtomicU16::new(1122);

    #[derive(Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct WebApiRequestPayload {
        id: String,
        path: String,
        method: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        body: Option<String>,
    }

    struct PendingMap {
        map: Mutex<HashMap<String, String>>,
        cvar: Condvar,
    }

    struct WebServiceRuntime {
        stop: Arc<AtomicBool>,
        pending: Arc<PendingMap>,
        handle: Mutex<Option<JoinHandle<()>>>,
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
        })
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
                | "/getReplaceRules"
                | "/backupPreview"
                | "/backup"
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
        let headers = &request[..header_end.min(read)];
        let body_start = header_end + 4;
        let mut body = if body_start < read {
            request[body_start..read].to_string()
        } else {
            String::new()
        };

        let mut content_length = 0usize;
        let mut origin: Option<String> = None;
        for line in headers.lines().skip(1) {
            let lower = line.to_ascii_lowercase();
            if let Some(v) = lower.strip_prefix("content-length:") {
                content_length = v.trim().parse().unwrap_or(0);
            }
            if let Some(v) = line.strip_prefix("Origin:").or_else(|| line.strip_prefix("origin:")) {
                origin = Some(v.trim().to_string());
            }
        }

        if content_length > body.len() && content_length <= 1024 * 1024 {
            let mut rest = vec![0u8; content_length - body.len()];
            if stream.read_exact(&mut rest).is_ok() {
                body.push_str(&String::from_utf8_lossy(&rest));
            }
        }

        let origin_ref = origin.as_deref();

        if method == "OPTIONS" {
            write_http_response(stream, "204 No Content", "text/plain", "", origin_ref);
            return;
        }

        let path_only = path.split('?').next().unwrap_or(&path).to_string();

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

        let id = Uuid::new_v4().to_string();
        let payload = WebApiRequestPayload {
            id: id.clone(),
            path: path.clone(),
            method: method.clone(),
            body: if body.is_empty() { None } else { Some(body) },
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

        let response = {
            let mut map = pending.map.lock().unwrap();
            let deadline = std::time::Instant::now() + Duration::from_secs(45);
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

        WEB_SERVICE_PORT.store(port, Ordering::Relaxed);

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
        Ok(())
    }

    pub fn stop_reader_web_service() -> Result<(), String> {
        let rt = runtime();
        rt.stop.store(true, Ordering::SeqCst);
        if let Some(handle) = rt.handle.lock().map_err(|e| e.to_string())?.take() {
            let _ = handle.join();
        }
        Ok(())
    }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub use desktop::{start_reader_web_service, stop_reader_web_service, web_api_complete};

#[cfg(any(target_os = "android", target_os = "ios"))]
pub fn web_api_complete(_id: String, _response: String) -> Result<(), String> {
    Err("Web 服务仅支持桌面端".into())
}

#[cfg(any(target_os = "android", target_os = "ios"))]
pub fn start_reader_web_service(_app: tauri::AppHandle, _port: u16) -> Result<(), String> {
    Err("Web 服务仅支持桌面端".into())
}

#[cfg(any(target_os = "android", target_os = "ios"))]
pub fn stop_reader_web_service() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn web_api_complete_cmd(id: String, response: String) -> Result<(), String> {
    web_api_complete(id, response)
}

#[tauri::command]
pub fn start_reader_web_service_cmd(app: tauri::AppHandle, port: Option<u16>) -> Result<(), String> {
    let p = port.unwrap_or(1122);
    start_reader_web_service(app, p)
}

#[tauri::command]
pub fn stop_reader_web_service_cmd() -> Result<(), String> {
    stop_reader_web_service()
}
