mod tray;
mod login_script_engine;
mod inner_web_scripts;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri::Manager;
use tauri_plugin_prevent_default::Flags;
#[cfg(target_os = "windows")]
use tauri_plugin_prevent_default::PlatformOptions;
use std::collections::HashMap;
use std::error::Error;
use std::sync::{Mutex, OnceLock};
use encoding_rs::GBK;

/// 待打开 URL+cookies 的临时存储（key = id），供自定义协议 reader-login-open 取出并返回 302+Set-Cookie
fn login_open_pending() -> &'static Mutex<HashMap<String, (String, String)>> {
    static PENDING: OnceLock<Mutex<HashMap<String, (String, String)>>> = OnceLock::new();
    PENDING.get_or_init(|| Mutex::new(HashMap::new()))
}

/// 统一配置文件名：安装版在默认目录、便携版在 exe 同目录创建，存放程序配置与数据路径（如 dataDir）
const CONFIG_FILE: &str = "config.json";

/// 便携版：exe 同目录下的配置/标记，用于识别便携模式（可选 dataDir，默认 "AppData"）
const PORTABLE_MARKER_FILE: &str = "reader.json";
const PORTABLE_MARKER_FILES: &[&str] = &["portable", "reader.portable", ".portable"];

#[derive(serde::Deserialize)]
struct PortableMarkerConfig {
    #[serde(rename = "dataDir")]
    data_dir: Option<String>,
}

/// 便携模式：exe 目录存在 reader.json 或任一标记文件
fn is_portable_mode(exe_dir: &std::path::Path) -> bool {
    if exe_dir.join(PORTABLE_MARKER_FILE).exists() {
        return true;
    }
    for name in PORTABLE_MARKER_FILES {
        if exe_dir.join(name).exists() {
            return true;
        }
    }
    false
}

/// 便携版默认数据根（无 config.json 的 dataDir 时）：reader.json 的 dataDir 或 exe 旁 AppData
fn portable_default_data_root(exe_dir: &std::path::Path) -> Result<std::path::PathBuf, String> {
    let marker_path = exe_dir.join(PORTABLE_MARKER_FILE);
    let data_dir_relative = if marker_path.exists() {
        let s = std::fs::read_to_string(&marker_path).map_err(|e| format!("读取 {} 失败: {}", PORTABLE_MARKER_FILE, e))?;
        let config: PortableMarkerConfig = serde_json::from_str(&s).unwrap_or(PortableMarkerConfig { data_dir: None });
        config.data_dir.unwrap_or_else(|| "AppData".to_string())
    } else {
        "AppData".to_string()
    };
    let data_dir = data_dir_relative.trim();
    let data_root = if data_dir.is_empty() {
        exe_dir.join("AppData")
    } else if std::path::Path::new(data_dir).is_absolute() {
        std::path::PathBuf::from(data_dir)
    } else {
        exe_dir.join(data_dir)
    };
    if !data_root.exists() {
        std::fs::create_dir_all(&data_root).map_err(|e| format!("创建便携数据目录失败: {}", e))?;
    }
    Ok(data_root)
}

/// 配置文件路径：便携版 = exe 目录/config.json，安装版 = 系统 app_data_dir/config.json
fn get_config_file_path(app: &tauri::AppHandle, exe_dir: &std::path::Path) -> Result<std::path::PathBuf, String> {
    if is_portable_mode(exe_dir) {
        Ok(exe_dir.join(CONFIG_FILE))
    } else {
        let dir = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("无法解析 app_data_dir: {}", e))?;
        Ok(dir.join(CONFIG_FILE))
    }
}

/// 确保配置文件存在：目录存在且 config.json 存在则不动，否则创建并写入 {}
fn ensure_config_exists(path: &std::path::Path) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建配置目录失败: {}", e))?;
    }
    std::fs::write(path, b"{}").map_err(|e| format!("创建配置文件失败: {}", e))?;
    Ok(())
}

/// 从 config.json 读取 dataDir；若有效则作为数据根目录
fn effective_data_dir_from_config(
    config_path: &std::path::Path,
    default_base: &std::path::Path,
) -> Result<std::path::PathBuf, String> {
    let s = std::fs::read_to_string(config_path).unwrap_or_else(|_| "{}".to_string());
    let config: serde_json::Value = serde_json::from_str(&s).unwrap_or(serde_json::Value::Object(Default::default()));
    let data_dir = config
        .get("dataDir")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let data_root = match data_dir {
        Some(dir) if std::path::Path::new(dir).is_absolute() => std::path::PathBuf::from(dir),
        Some(dir) => {
            let base = config_path.parent().unwrap_or(default_base);
            base.join(dir)
        }
        None => default_base.to_path_buf(),
    };
    if !data_root.exists() {
        std::fs::create_dir_all(&data_root).map_err(|e| format!("创建数据目录失败: {}", e))?;
    }
    Ok(data_root)
}

/// 返回应用数据根目录：由 config.json 的 dataDir 决定，无则用默认（安装版=系统目录，便携版=exe 旁 AppData 等）
#[tauri::command]
fn get_app_data_root(app: tauri::AppHandle) -> Result<String, String> {
    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe_path
        .parent()
        .ok_or_else(|| "无法获取 exe 所在目录".to_string())?;

    let config_path = get_config_file_path(&app, exe_dir)?;
    ensure_config_exists(&config_path)?;

    let default_base = if is_portable_mode(exe_dir) {
        portable_default_data_root(exe_dir)?
    } else {
        app.path()
            .app_data_dir()
            .map_err(|e| format!("无法解析 app_data_dir: {}", e))?
    };

    let data_root = effective_data_dir_from_config(&config_path, &default_base)?;
    Ok(data_root.to_string_lossy().into_owned())
}

/// 读取 config.json 全文（供前端展示与编辑）
#[tauri::command]
fn get_config(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe_path.parent().ok_or_else(|| "无法获取 exe 所在目录".to_string())?;
    let config_path = get_config_file_path(&app, exe_dir)?;
    ensure_config_exists(&config_path)?;
    let s = std::fs::read_to_string(&config_path).unwrap_or_else(|_| "{}".to_string());
    serde_json::from_str(&s).map_err(|e| format!("解析配置失败: {}", e))
}

/// 写入 config.json 全文（前端保存后调用；dataDir 变更需重启生效）
#[tauri::command]
fn set_config(app: tauri::AppHandle, config: serde_json::Value) -> Result<(), String> {
    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe_path.parent().ok_or_else(|| "无法获取 exe 所在目录".to_string())?;
    let config_path = get_config_file_path(&app, exe_dir)?;
    ensure_config_exists(&config_path)?;
    let json = serde_json::to_string_pretty(&config).map_err(|e| format!("序列化配置失败: {}", e))?;
    std::fs::write(&config_path, json.as_bytes()).map_err(|e| format!("写入配置失败: {}", e))?;
    Ok(())
}

/// 下载二进制文件的响应结构
#[derive(serde::Serialize)]
struct DownloadResponse {
    /// 原始二进制数据
    data: Vec<u8>,
    /// HTTP 状态码
    status: u16,
    /// 响应头（尽量转换为 UTF-8，失败则使用 lossy 转换）
    headers: HashMap<String, String>,
    /// 最终 URL（可能经过重定向）
    url: String,
}

/// 下载二进制文件
/// 直接使用 reqwest 库，避免 Tauri HTTP 插件在处理非 UTF-8 响应时的问题
#[tauri::command]
async fn download_binary(
    url: String,
    method: Option<String>,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<DownloadResponse, String> {
    // 规范化 URL，确保跨平台兼容性
    // 使用 reqwest 的 URL 解析功能（reqwest 内部使用 url crate）
    let normalized_url = match reqwest::Url::parse(&url) {
        Ok(parsed_url) => {
            // URL 解析成功，使用解析后的 URL（会自动规范化）
            parsed_url.to_string()
        }
        Err(e) => {
            // URL 解析失败，记录错误并尝试基本清理
            eprintln!("[download_binary] URL 解析失败: {} - 原始 URL: {}", e, url);
            let trimmed = url.trim();
            if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
                trimmed.to_string()
            } else {
                format!("https://{}", trimmed)
            }
        }
    };

    eprintln!("[download_binary] 规范化后的 URL: {}", normalized_url);

    // 再次尝试解析规范化后的 URL
    let request_url = match reqwest::Url::parse(&normalized_url) {
        Ok(url) => url,
        Err(e) => {
            return Err(format!("URL 解析失败: {} - 规范化后的 URL: {}", e, normalized_url));
        }
    };

    // 构建 reqwest 客户端
    // 信任所有证书：许多书源网站使用的证书不在 Mozilla CA 列表中（UnknownIssuer 错误）
    // 参考 legado 项目使用 SSLHelper.unsafeTrustManager 信任所有证书的做法
    // 注意：桌面端使用 native-tls（支持此功能），移动端使用 rustls-tls（可能不完全支持，但 Tauri HTTP 插件已处理）
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_millis(timeout_ms.unwrap_or(60000)))
        .connect_timeout(std::time::Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::limited(10))
        .gzip(true)
        .brotli(true)
        .deflate(true)
        .danger_accept_invalid_certs(true) // 信任所有证书，以兼容各种书源网站
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let method_str = method.unwrap_or_else(|| "GET".to_string());
    let req_method = match method_str.to_uppercase().as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "DELETE" => reqwest::Method::DELETE,
        "HEAD" => reqwest::Method::HEAD,
        _ => reqwest::Method::GET,
    };

    eprintln!("[download_binary] 准备发送请求: {} {}", method_str, request_url);

    // 使用解析后的 URL 对象构建请求
    let mut request = client.request(req_method, request_url.clone());

    // 添加自定义 headers
    if let Some(hdrs) = headers {
        for (key, value) in hdrs {
            eprintln!("[download_binary] 添加 header: {} = {}", key, value);
            request = request.header(&key, &value);
        }
    }

    if let Some(ref body_str) = body {
        eprintln!("[download_binary] 请求体长度: {}", body_str.len());
        request = request.body(body_str.clone());
    }

    eprintln!("[download_binary] 开始发送请求...");
    let response = request
        .send()
        .await
        .map_err(|e| {
            // 遍历完整错误链，找到根本原因
            eprintln!("[download_binary] === 错误链 ===");
            eprintln!("[download_binary] 顶层错误: {}", e);
            eprintln!("[download_binary] is_timeout: {}", e.is_timeout());
            eprintln!("[download_binary] is_connect: {}", e.is_connect());
            eprintln!("[download_binary] is_request: {}", e.is_request());
            eprintln!("[download_binary] is_redirect: {}", e.is_redirect());
            eprintln!("[download_binary] is_builder: {}", e.is_builder());
            eprintln!("[download_binary] is_decode: {}", e.is_decode());
            let mut depth = 0;
            let mut current: &dyn Error = &e;
            while let Some(source) = current.source() {
                depth += 1;
                eprintln!("[download_binary] 错误链[{}]: {}", depth, source);
                current = source;
            }
            eprintln!("[download_binary] 根本原因(depth={}): {}", depth, current);
            eprintln!("[download_binary] URL: {}", request_url);
            eprintln!("[download_binary] === 错误链结束 ===");
            
            format!("请求发送失败: {} (根本原因: {})", e, current)
        })?;
    
    eprintln!("[download_binary] 请求成功，状态码: {}", response.status());

    let status = response.status().as_u16();
    let final_url = response.url().to_string();

    // 安全地转换响应头（使用 lossy UTF-8 转换）
    let mut resp_headers = HashMap::new();
    for (key, value) in response.headers().iter() {
        let header_value = String::from_utf8_lossy(value.as_bytes()).into_owned();
        resp_headers.insert(key.as_str().to_string(), header_value);
    }

    let data = response
        .bytes()
        .await
        .map_err(|e| format!("读取响应数据失败: {}", e))?
        .to_vec();

    Ok(DownloadResponse {
        data,
        status,
        headers: resp_headers,
        url: final_url,
    })
}

/// 由后端拉取 URL 返回文本（用于绕过浏览器 CORS，如书源网络导入）
#[tauri::command]
async fn fetch_url_text(url: String, timeout_ms: Option<u64>) -> Result<String, String> {
    let trimmed = url.trim();
    let normalized_url = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else {
        format!("https://{}", trimmed)
    };
    let request_url = reqwest::Url::parse(&normalized_url)
        .map_err(|e| format!("URL 解析失败: {}", e))?;

    let mut client_builder = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_millis(timeout_ms.unwrap_or(30000)))
        .connect_timeout(std::time::Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::limited(10))
        .gzip(true)
        .brotli(true)
        .deflate(true);
    // 桌面端信任无效证书以兼容部分书源站；移动端使用默认校验证书
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        client_builder = client_builder.danger_accept_invalid_certs(true);
    }
    let client = client_builder
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let response = client
        .get(request_url)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("请求失败: {}", status));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("读取响应失败: {}", e))?
        .to_vec();

    // 优先尝试 UTF-8，失败则 lossy 解码
    let text = String::from_utf8(bytes.clone()).unwrap_or_else(|_| {
        String::from_utf8_lossy(&bytes).into_owned()
    });
    Ok(text)
}

/// 书源登录脚本（Rust 侧备选）：同步执行 Legado 脚本，java.ajax 真阻塞。需启用 feature login-script-engine。
#[tauri::command]
async fn run_login_script_rust(
    input: login_script_engine::RunLoginScriptInput,
) -> Result<login_script_engine::RunLoginScriptOutput, String> {
    let input = input.clone();
    tokio::task::spawn_blocking(move || login_script_engine::run_login_script_rust(input))
        .await
        .map_err(|e| e.to_string())?
}

/// 向 Webview 注入目标 URL 域下的 Cookie
#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn apply_http_cookies_to_webview(
    webview: &tauri::Webview,
    url: &str,
    cookies_str: &str,
) -> Result<(), String> {
    use tauri::webview::cookie;
    use tauri::webview::Cookie;

    if cookies_str.is_empty() {
        return Ok(());
    }
    let parsed_url = url::Url::parse(url).map_err(|e| e.to_string())?;
    let host = parsed_url
        .host_str()
        .map(|h| h.to_string())
        .ok_or_else(|| "URL 无 host".to_string())?;
    let is_https = parsed_url.scheme() == "https";

    // 书源常见 `qttoken=…;deviceId=…`（分号后无空格），勿仅用 "; " 分割
    for part in cookies_str.split(';') {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }
        if let Some(eq) = part.find('=') {
            let name = part[..eq].trim();
            let value = part[eq + 1..].trim();
            if name.is_empty() {
                continue;
            }
            let mut c = Cookie::build((name, value)).path("/");
            c = c.domain(host.clone());
            if is_https {
                c = c.secure(true).same_site(cookie::SameSite::None);
            }
            let cookie = c.build();
            webview.set_cookie(cookie).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
const INNER_WEB_PANEL_LABEL: &str = "reader-inner-web";

/// 备用：独立子窗口（WebviewWindow.parent），与内嵌 add_child 面板互斥 label
#[cfg(not(any(target_os = "android", target_os = "ios")))]
const INNER_WEB_CHILD_LABEL: &str = "reader-inner-web-child";

/// 将键盘/输入焦点交给内嵌子 WebView（若尚未创建则返回 false，避免误聚焦主 WebView）
#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn try_focus_inner_web_surface(app: &tauri::AppHandle) -> bool {
    use tauri::Manager;
    if let Some(panel) = app.get_webview(INNER_WEB_PANEL_LABEL) {
        let _ = panel.set_focus();
        return true;
    }
    if let Some(child) = app.get_webview_window(INNER_WEB_CHILD_LABEL) {
        let _ = child.set_focus();
        return true;
    }
    false
}

/// 内嵌 https 面板或主 WebView（Cookie 读写优先面板）
#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn webview_for_inner_web_cookies(app: &tauri::AppHandle) -> Result<tauri::Webview, String> {
    use tauri::Manager;
    if let Some(w) = app.get_webview(INNER_WEB_PANEL_LABEL) {
        return Ok(w);
    }
    if let Some(w) = app.get_webview(INNER_WEB_CHILD_LABEL) {
        return Ok(w);
    }
    app.get_webview("main")
        .ok_or_else(|| "主 WebView 不存在".to_string())
}

/// 为主窗口 / 内嵌面板 WebView 注入 Cookie 后返回目标 URL
#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
async fn set_cookies_for_inner_web(
    app: tauri::AppHandle,
    url: String,
    cookies: String,
) -> Result<String, String> {
    let url = url.trim().to_string();
    let cookies_str = cookies.trim().to_string();
    if url.is_empty() || !url.starts_with("http") {
        return Err("URL 无效".to_string());
    }
    let window = webview_for_inner_web_cookies(&app)?;
    apply_http_cookies_to_webview(&window, &url, &cookies_str)?;
    Ok(url)
}

/// 读取内嵌面板或主 WebView 中指定 URL 的 Cookie
#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
async fn get_webview_cookies_for_url(
    app: tauri::AppHandle,
    url: String,
) -> Result<String, String> {
    let url = url.trim();
    if url.is_empty() || !url.starts_with("http") {
        return Err("URL 无效".to_string());
    }
    let parsed_url = url::Url::parse(url).map_err(|e| e.to_string())?;
    let window = webview_for_inner_web_cookies(&app)?;

    let cookies = window
        .cookies_for_url(parsed_url)
        .map_err(|e| e.to_string())?;

    let parts: Vec<String> = cookies
        .iter()
        .map(|c| format!("{}={}", c.name(), c.value()))
        .collect();
    Ok(parts.join("; "))
}

/// iframe 内 document.cookie 变更时，由主窗口 postMessage 桥接写入 WebView Cookie 罐
#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
async fn sync_document_cookies_for_inner_web(
    app: tauri::AppHandle,
    url: String,
    cookies: String,
) -> Result<(), String> {
    let url = url.trim();
    let cookies_str = cookies.trim();
    if url.is_empty() || !url.starts_with("http") || cookies_str.is_empty() {
        return Ok(());
    }
    let window = webview_for_inner_web_cookies(&app)?;
    apply_http_cookies_to_webview(&window, url, cookies_str)?;
    Ok(())
}

/// 在主窗口内嵌 https 子 WebView（同窗口多 WebView，工具栏保留在主 WebView 层）
#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
async fn open_inner_web_panel(
    app: tauri::AppHandle,
    url: String,
    cookies: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    use tauri::webview::WebviewBuilder;
    use tauri::{LogicalPosition, LogicalSize, Manager, WebviewUrl};

    let url = url.trim().to_string();
    let cookies_str = cookies.trim().to_string();
    if url.is_empty() || !url.starts_with("http") {
        return Err("URL 无效".to_string());
    }
    url.parse::<url::Url>()
        .map_err(|e: url::ParseError| e.to_string())?;
    let w = width.max(1.0);
    let h = height.max(1.0);
    let pos = LogicalPosition::new(x, y);
    let size = LogicalSize::new(w, h);

    if let Some(panel) = app.get_webview(INNER_WEB_PANEL_LABEL) {
        if !cookies_str.is_empty() {
            apply_http_cookies_to_webview(&panel, &url, &cookies_str)?;
        }
        panel
            .set_position(pos)
            .map_err(|e| e.to_string())?;
        panel.set_size(size).map_err(|e| e.to_string())?;
        let nav = format!(
            "window.location.replace({});",
            serde_json::to_string(&url).unwrap()
        );
        panel.eval(&nav).map_err(|e| e.to_string())?;
        let _ = panel.set_focus();
        return Ok(());
    }

    let window = app
        .get_window("main")
        .ok_or_else(|| "主窗口不存在".to_string())?;

    let blank = "about:blank"
        .parse::<url::Url>()
        .map_err(|e: url::ParseError| e.to_string())?;
    let panel = window
        .add_child(
            WebviewBuilder::new(INNER_WEB_PANEL_LABEL, WebviewUrl::External(blank))
                .focused(true),
            pos,
            size,
        )
        .map_err(|e| e.to_string())?;

    if !cookies_str.is_empty() {
        apply_http_cookies_to_webview(&panel, &url, &cookies_str)?;
    }
    let nav = format!(
        "window.location.replace({});",
        serde_json::to_string(&url).unwrap()
    );
    panel.eval(&nav).map_err(|e| e.to_string())?;
    let _ = panel.set_focus();
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
async fn reposition_inner_web_panel(
    app: tauri::AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    use tauri::{LogicalPosition, LogicalSize, Manager};

    let Some(panel) = app.get_webview(INNER_WEB_PANEL_LABEL) else {
        return Ok(());
    };
    panel
        .set_position(LogicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    panel
        .set_size(LogicalSize::new(width.max(1.0), height.max(1.0)))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
async fn reload_inner_web_panel(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;

    let Some(panel) = app.get_webview(INNER_WEB_PANEL_LABEL) else {
        return Ok(());
    };
    panel
        .eval("window.location.reload()")
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
async fn close_inner_web_panel(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;

    if let Some(panel) = app.get_webview(INNER_WEB_PANEL_LABEL) {
        panel.close().map_err(|e| e.to_string())?;
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.set_focus();
    }
    Ok(())
}

// --- 备用：独立子窗口（Legado WebViewActivity 风格，关闭后回到主窗口原页面）---

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
async fn open_inner_web_child_window(
    app: tauri::AppHandle,
    url: String,
    cookies: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    use tauri::{LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder};

    let url = url.trim().to_string();
    let cookies_str = cookies.trim().to_string();
    if url.is_empty() || !url.starts_with("http") {
        return Err("URL 无效".to_string());
    }
    url.parse::<url::Url>()
        .map_err(|e: url::ParseError| e.to_string())?;
    let w = width.max(1.0);
    let h = height.max(1.0);

    if let Some(child) = app.get_webview_window(INNER_WEB_CHILD_LABEL) {
        if !cookies_str.is_empty() {
            let wv = app
                .get_webview(INNER_WEB_CHILD_LABEL)
                .ok_or_else(|| "子窗口 WebView 不存在".to_string())?;
            apply_http_cookies_to_webview(&wv, &url, &cookies_str)?;
        }
        child
            .set_position(LogicalPosition::new(x, y))
            .map_err(|e| e.to_string())?;
        child
            .set_size(LogicalSize::new(w, h))
            .map_err(|e| e.to_string())?;
        let nav = format!(
            "window.location.replace({});",
            serde_json::to_string(&url).unwrap()
        );
        child.eval(&nav).map_err(|e| e.to_string())?;
        let _ = child.show();
        let _ = child.set_focus();
        return Ok(());
    }

    let parent = app
        .get_webview_window("main")
        .ok_or_else(|| "主窗口不存在".to_string())?;

    let blank = "about:blank"
        .parse::<url::Url>()
        .map_err(|e: url::ParseError| e.to_string())?;
    let child = WebviewWindowBuilder::new(
        &app,
        INNER_WEB_CHILD_LABEL,
        WebviewUrl::External(blank),
    )
    .parent(&parent)
    .map_err(|e| e.to_string())?
    .title("")
    .decorations(false)
    .resizable(false)
    .skip_taskbar(true)
    .visible(true)
    .focused(true)
    .position(x, y)
    .inner_size(w, h)
    .build()
    .map_err(|e| e.to_string())?;

    if !cookies_str.is_empty() {
        if let Some(wv) = app.get_webview(INNER_WEB_CHILD_LABEL) {
            apply_http_cookies_to_webview(&wv, &url, &cookies_str)?;
        }
    }
    let nav = format!(
        "window.location.replace({});",
        serde_json::to_string(&url).unwrap()
    );
    child.eval(&nav).map_err(|e| e.to_string())?;
    let _ = child.set_focus();
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
async fn reposition_inner_web_child_window(
    app: tauri::AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    use tauri::{LogicalPosition, LogicalSize, Manager};

    let Some(child) = app.get_webview_window(INNER_WEB_CHILD_LABEL) else {
        return Ok(());
    };
    child
        .set_position(LogicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    child
        .set_size(LogicalSize::new(width.max(1.0), height.max(1.0)))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
async fn reload_inner_web_child_window(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;

    let Some(child) = app.get_webview_window(INNER_WEB_CHILD_LABEL) else {
        return Ok(());
    };
    child
        .eval("window.location.reload()")
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
async fn close_inner_web_child_window(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;

    if let Some(child) = app.get_webview_window(INNER_WEB_CHILD_LABEL) {
        child.close().map_err(|e| e.to_string())?;
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.set_focus();
        let _ = main.show();
    }
    Ok(())
}

/// 内嵌页会话：关闭前保持主 WebView 焦点在工具栏层
#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
async fn set_inner_web_session_active(
    app: tauri::AppHandle,
    active: bool,
) -> Result<(), String> {
    use tauri::Manager;

    let Some(main) = app.get_webview_window("main") else {
        return Ok(());
    };
    if active {
        let _ = try_focus_inner_web_surface(&app);
    } else {
        let _ = main.set_focus();
    }
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
async fn focus_inner_web_panel(app: tauri::AppHandle) -> Result<(), String> {
    if try_focus_inner_web_surface(&app) {
        Ok(())
    } else {
        Err("内嵌 WebView 尚未就绪".to_string())
    }
}

/// 注册在所有子 frame 文档开始前执行的 bootstrap（修复 iframe 内 Tauri 注入报错 + postMessage 桥）
#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
async fn ensure_inner_web_iframe_scripts(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;

    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "主窗口不存在".to_string())?;
    inner_web_scripts::ensure_iframe_bootstrap(&window)
}

/// 存储 (url, cookies)，返回 id；前端用 reader-login-open://open?id=ID 打开新窗口，协议返回 302+Set-Cookie
#[tauri::command]
fn prepare_login_open(url: String, cookies: String) -> Result<String, String> {
    let url = url.trim().to_string();
    let cookies = cookies.trim().to_string();
    if url.is_empty() || !url.starts_with("http") {
        return Err("URL 无效".to_string());
    }
    let id = uuid::Uuid::new_v4().simple().to_string();
    login_open_pending()
        .lock()
        .map_err(|e| e.to_string())?
        .insert(id.clone(), (url, cookies));
    Ok(id)
}

/// 直接创建 WebviewWindow：先加载 about:blank，用 Tauri set_cookie API 为目标域注入 cookie，再导航到目标 URL（用于用户后台等，避免协议 302 导致 cookie 归属错误）。
#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
async fn open_url_with_cookies(
    app: tauri::AppHandle,
    url: String,
    cookies: String,
    title: String,
) -> Result<(), String> {
    use tauri::Manager;
    use tauri::WebviewUrl;
    use tauri::WebviewWindowBuilder;

    let url = url.trim().to_string();
    let cookies_str = cookies.trim().to_string();
    if url.is_empty() || !url.starts_with("http") {
        return Err("URL 无效".to_string());
    }

    let label = format!(
        "login-open-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    );

    let title = if title.is_empty() {
        "书源设置".to_string()
    } else {
        title
    };

    let builder = WebviewWindowBuilder::new(
        &app,
        &label,
        WebviewUrl::External("about:blank".parse().map_err(|e: url::ParseError| e.to_string())?),
    )
    .title(&title)
    .inner_size(800.0_f64, 600.0_f64)
    .min_inner_size(400.0_f64, 300.0_f64);

    let window = builder.build().map_err(|e| e.to_string())?;

    let webview = app
        .get_webview(&label)
        .ok_or_else(|| "WebView 创建失败".to_string())?;
    apply_http_cookies_to_webview(&webview, &url, &cookies_str)?;

    let nav_script = format!(
        "window.location.href = {};",
        serde_json::to_string(&url).unwrap()
    );
    window.eval(&nav_script).map_err(|e| e.to_string())?;

    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.set_focus();
    }
    Ok(())
}

/// 解码 GBK/GB2312/GB18030 编码的字节数据为 UTF-8 字符串
#[tauri::command]
fn decode_gbk(data: Vec<u8>) -> Result<String, String> {
    // 使用 encoding_rs 的 GBK 编码器
    let (decoded, _, had_errors) = GBK.decode(&data);
    if had_errors {
        // 即使有错误也返回结果，但记录警告
        eprintln!("警告: GBK 解码时遇到一些无法转换的字节");
    }
    Ok(decoded.into_owned())
}

#[cfg(debug_assertions)]
fn prevent_default() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    use tauri_plugin_prevent_default::Flags;

    tauri_plugin_prevent_default::Builder::new()
        .with_flags(Flags::all().difference(Flags::DEV_TOOLS | Flags::RELOAD))
        .build()
}

#[cfg(not(debug_assertions))]
fn prevent_default() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_prevent_default::init()
}

/// Windows 下使用 PlatformOptions；其他平台仅使用默认 Builder
#[cfg(target_os = "windows")]
fn platform_prevent_default_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_prevent_default::Builder::new()
        .platform(
            PlatformOptions::new()
                .general_autofill(true)
                .password_autosave(false)
                .browser_accelerator_keys(false)
                .default_context_menus(false)
                .default_script_dialogs(false),
        )
        .build()
}

#[cfg(not(target_os = "windows"))]
fn platform_prevent_default_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_prevent_default::Builder::new().build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        // 所有平台都支持的插件
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build()) // Store 插件
        .plugin(tauri_plugin_fs::init()) // FS 插件
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .build(),
        )
        .plugin(prevent_default())
        .plugin(platform_prevent_default_plugin())
        .plugin(
            // 开发时允许 RELOAD，否则会拦截 F5/整页刷新，导致 Vite 热更新/轮询重载无效
            tauri_plugin_prevent_default::Builder::new()
                .with_flags(if cfg!(debug_assertions) {
                    Flags::all().difference(Flags::DEV_TOOLS | Flags::RELOAD)
                } else {
                    Flags::all()
                })
                .build(),
        );

    // 桌面平台专用插件和命令
    #[cfg(not(target_os = "android"))]
    #[cfg(not(target_os = "ios"))]
    let builder = builder
        // 暂时禁用 updater 插件，需要配置 tauri.conf.json
        // .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        // .plugin(tauri_plugin_clipboard::init()) // 如果需要可以取消注释
        // .plugin(
        //     tauri_plugin_window_state::Builder::default()
        //         .with_state_flags(
        //             tauri_plugin_window_state::StateFlags::SIZE
        //                 | tauri_plugin_window_state::StateFlags::POSITION
        //                 | tauri_plugin_window_state::StateFlags::MAXIMIZED
        //                 // | tauri_plugin_window_state::StateFlags::VISIBLE, // 不保存窗口可见性状态
        //         )
        //         .build(),
        // )
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // 当第二个实例启动时，激活主窗口
            if let Some(window) = app.get_webview_window("main") {
                window.show().unwrap();
                window.set_focus().unwrap();
            }
        }));

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder
        .register_uri_scheme_protocol("reader-login-open", |_app, request| {
            let uri = request.uri();
            let query = uri.query().unwrap_or("");
            let id = url::form_urlencoded::parse(query.as_bytes())
                .find(|(k, _)| k == "id")
                .map(|(_, v)| v.to_string())
                .unwrap_or_default();
            let (url, cookies) = {
                let mut guard = match login_open_pending().lock() {
                    Ok(g) => g,
                    Err(_) => return http::Response::builder().status(500).body(vec![]).unwrap(),
                };
                guard.remove(&id).unwrap_or_default()
            };
            if url.is_empty() {
                return http::Response::builder().status(404).body(b"not found".to_vec()).unwrap();
            }
            let parsed = url::Url::parse(url.as_str()).ok();
            let domain = parsed.as_ref().and_then(|u| u.host_str().map(|h| h.to_string()));
            let is_https = parsed.as_ref().map(|u| u.scheme() == "https").unwrap_or(false);
            let mut resp = http::Response::builder()
                .status(302)
                .header("Location", url.as_str());
            for part in cookies.split("; ") {
                let part = part.trim();
                if part.contains('=') {
                    let mut cookie_val = match &domain {
                        Some(d) => format!("{}; Path=/; Domain={}", part, d),
                        None => format!("{}; Path=/", part),
                    };
                    if is_https {
                        cookie_val.push_str("; SameSite=None; Secure");
                    }
                    resp = resp.header("Set-Cookie", cookie_val);
                }
            }
            resp.body(vec![]).unwrap()
        });

    builder
        .invoke_handler(tauri::generate_handler![
            download_binary,
            fetch_url_text,
            decode_gbk,
            get_app_data_root,
            get_config,
            set_config,
            run_login_script_rust,
            prepare_login_open,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            set_cookies_for_inner_web,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            get_webview_cookies_for_url,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            sync_document_cookies_for_inner_web,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            ensure_inner_web_iframe_scripts,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            open_inner_web_panel,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            reposition_inner_web_panel,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            reload_inner_web_panel,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            close_inner_web_panel,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            set_inner_web_session_active,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            focus_inner_web_panel,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            open_inner_web_child_window,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            reposition_inner_web_child_window,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            reload_inner_web_child_window,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            close_inner_web_child_window,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            open_url_with_cookies,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
