mod web_service;
mod web_static;
mod web_multipart;
mod web_socket;
mod local_addresses;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod data_migration;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod http_cookies;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod window_state;
mod portable_paths;
mod webview_storage;
mod tray;
mod login_script_engine;
mod inner_web_scripts;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod inner_web_panel_capture;
mod backstage_webview;
mod webjs_java_rpc;
mod android_fs_commands;
mod android_media_session;
mod display_reader_commands;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod music_openapi;
mod tv_proxy;
mod tv_jar_host;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod media_paths;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod lx_sync_server;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod desktop_lyric;
mod music_mini_player;
mod tx_qrc_decode;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod global_hotkey;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod desktop_brightness;
mod platform;
mod media_convert;
use tauri::Emitter;
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

/// CF 验证 panel 实际 navigator.userAgent（与书源 header 可能不同，须与 cf_clearance 一致）
fn inner_web_panel_user_agent_store() -> &'static Mutex<String> {
    static STORE: OnceLock<Mutex<String>> = OnceLock::new();
    STORE.get_or_init(|| Mutex::new(String::new()))
}

/// 统一配置文件名：桌面在 exe/AppData、移动端在系统目录；存放程序配置与 dataDir 等
const SETTINGS_FILE: &str = "settings.json";
/// 旧文件名（启动时迁移为 settings.json）
const LEGACY_CONFIG_FILE: &str = "config.json";

/// 供 portable_paths 等桌面子模块引用
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub(crate) const CONFIG_FILE: &str = SETTINGS_FILE;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub(crate) const LEGACY_SETTINGS_FILE: &str = LEGACY_CONFIG_FILE;

/// 可选：exe 同目录 reader.json 中的 dataDir 覆盖默认 AppData
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub(crate) const PORTABLE_MARKER_FILE: &str = "reader.json";

/** 日志预览：按字节上限截断，但不切断 UTF-8 多字节字符 */
fn truncate_utf8_preview(text: &str, max_bytes: usize) -> &str {
    if text.len() <= max_bytes {
        return text;
    }
    let mut end = max_bytes;
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }
    &text[..end]
}

/// 配置文件路径：桌面 = exe/AppData/settings.json；移动端 = 系统 app_data_dir/settings.json
fn get_config_file_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let _ = app;
        return portable_paths::config_file_path();
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let dir = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("无法解析 app_data_dir: {}", e))?;
        Ok(dir.join(SETTINGS_FILE))
    }
}

/// 若仅有旧 config.json，则迁移为 settings.json
pub(crate) fn migrate_legacy_config_filename(settings_path: &std::path::Path) -> Result<(), String> {
    if settings_path.exists() {
        return Ok(());
    }
    let legacy = settings_path
        .parent()
        .map(|p| p.join(LEGACY_CONFIG_FILE))
        .ok_or_else(|| "配置路径无父目录".to_string())?;
    if !legacy.exists() {
        return Ok(());
    }
    std::fs::rename(&legacy, settings_path).or_else(|_| {
        std::fs::copy(&legacy, settings_path)
            .map(|_| ())
            .and_then(|_| std::fs::remove_file(&legacy))
            .map_err(|e| format!("迁移 config.json → settings.json 失败: {e}"))
    })?;
    Ok(())
}

/// 启动早期（尚无 AppHandle）解析当前业务数据根，供 http cookie 桥接等使用
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub(crate) fn effective_data_dir_at_startup() -> Result<std::path::PathBuf, String> {
    let config_path = portable_paths::config_file_path()?;
    ensure_config_exists(&config_path)?;
    let default_base = default_app_data_base_static()?;
    effective_data_dir_from_config(&config_path, &default_base)
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn default_app_data_base_static() -> Result<std::path::PathBuf, String> {
    let exe_dir = portable_paths::exe_dir()?;
    if let Some(dir) = portable_paths::data_dir_from_reader_json(&exe_dir) {
        if std::path::Path::new(&dir).is_absolute() {
            let root = std::path::PathBuf::from(dir);
            portable_paths::ensure_dir(&root)?;
            return Ok(root);
        }
        return portable_paths::resolve_data_root_from_relative(&dir, &exe_dir);
    }
    portable_paths::default_data_root()
}

/// 默认业务数据根：桌面 = exe/AppData（或 reader.json dataDir）；移动端 = 系统目录
pub(crate) fn default_app_data_base(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let _ = app;
        return default_app_data_base_static();
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        app.path()
            .app_data_dir()
            .map_err(|e| format!("无法解析 app_data_dir: {}", e))
    }
}

/// 确保配置文件存在：目录存在且 settings.json 存在则不动；否则先尝试从 config.json 迁移，再创建 {}
pub(crate) fn ensure_config_exists(path: &std::path::Path) -> Result<(), String> {
    let _ = migrate_legacy_config_filename(path);
    if path.exists() {
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建配置目录失败: {}", e))?;
    }
    std::fs::write(path, b"{}").map_err(|e| format!("创建配置文件失败: {}", e))?;
    Ok(())
}

/// 创建主窗口（tauri.conf 中 create: false，由 setup 或迁移完成后调用）
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub(crate) fn create_main_window_if_missing(app: &tauri::AppHandle) -> Result<(), String> {
    use tauri::webview::WebviewWindowBuilder;
    if app.get_webview_window("main").is_some() {
        return Ok(());
    }
    let win_config = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == "main")
        .or_else(|| app.config().app.windows.first())
        .ok_or_else(|| "tauri.conf.json 中未配置主窗口".to_string())?;

    let mut builder =
        WebviewWindowBuilder::from_config(app, win_config).map_err(|e| e.to_string())?;
    let config_path = get_config_file_path(app)?;
    ensure_config_exists(&config_path)?;
    if let Ok(root) = portable_paths::effective_webview_data_root(&config_path) {
        if let Ok(data_dir) = portable_paths::webview_data_directory(&root, &win_config.label) {
            builder = builder.data_directory(data_dir);
        }
    }
    builder.build().map_err(|e| e.to_string())?;
    window_state::restore_and_attach(app)?;
    Ok(())
}

/// 从 settings.json 读取 dataDir；若有效则作为数据根目录
pub(crate) fn effective_data_dir_from_config(
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
            let exe = portable_paths::exe_dir()?;
            portable_paths::resolve_data_root_from_relative(dir, &exe)?
        }
        None => default_base.to_path_buf(),
    };
    if !data_root.exists() {
        std::fs::create_dir_all(&data_root).map_err(|e| format!("创建数据目录失败: {}", e))?;
    }
    Ok(data_root)
}

/// 前端「再按一次退出」确认后调用；须配合 RunEvent 仅拦截 code=None 的系统退出。
#[tauri::command]
fn request_app_exit(app: tauri::AppHandle) {
    app.exit(0);
}

/// 由音乐播放定时器显式触发系统关机。
#[tauri::command]
fn shutdown_system() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = std::process::Command::new("shutdown");
        command.args(["/s", "/t", "0"]);
        command
    };
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    let mut command = {
        let mut command = std::process::Command::new("shutdown");
        command.args(["-h", "now"]);
        command
    };
    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    return Err("当前平台不支持系统关机".to_string());

    #[cfg(any(target_os = "windows", target_os = "linux", target_os = "macos"))]
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("启动系统关机失败: {error}"))
}

/// 返回应用数据根目录：由 settings.json 的 dataDir 决定，无则用默认（桌面=exe 旁 AppData，移动端=系统目录）
#[tauri::command]
fn get_app_data_root(app: tauri::AppHandle) -> Result<String, String> {
    let config_path = get_config_file_path(&app)?;
    ensure_config_exists(&config_path)?;
    let default_base = default_app_data_base(&app)?;
    let data_root = effective_data_dir_from_config(&config_path, &default_base)?;
    Ok(data_root.to_string_lossy().into_owned())
}

/// 默认业务数据根（exe/AppData 或 reader.json），不含 config.dataDir 覆盖
#[tauri::command]
fn get_default_app_data_base(app: tauri::AppHandle) -> Result<String, String> {
    let base = default_app_data_base(&app)?;
    Ok(base.to_string_lossy().into_owned())
}

/// 可执行文件所在目录（绿色版根目录）；移动端不可用
#[tauri::command]
fn get_exe_dir() -> Result<String, String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        Err("移动端无 exe 目录".to_string())
    }
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let dir = portable_paths::exe_dir()?;
        Ok(dir.to_string_lossy().into_owned())
    }
}

/// 读取 settings.json 全文（供前端展示与编辑）
#[tauri::command]
fn get_config(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let config_path = get_config_file_path(&app)?;
    ensure_config_exists(&config_path)?;
    let s = std::fs::read_to_string(&config_path).unwrap_or_else(|_| "{}".to_string());
    serde_json::from_str(&s).map_err(|e| format!("解析配置失败: {}", e))
}

/// 写入 settings.json 全文（前端保存后调用；dataDir 变更需重启生效）
#[tauri::command]
fn set_config(app: tauri::AppHandle, config: serde_json::Value) -> Result<(), String> {
    let config_path = get_config_file_path(&app)?;
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
///
/// `use_okhttp_user_agent`：对齐 Legado ruleContent ajax（仅 cookie + Content-Type）时使用 OkHttp 默认 UA，勿用桌面 Chrome
#[tauri::command]
async fn download_binary(
    url: String,
    method: Option<String>,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
    timeout_ms: Option<u64>,
    use_okhttp_user_agent: Option<bool>,
    proxy: Option<String>,
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
    // TLS：桌面 native-tls（Windows SChannel）/ Android rustls；信任无效证书以兼容部分书源
    const CHROME_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    const OKHTTP_UA: &str = "okhttp/4.9.1";

    let has_custom_ua = headers
        .as_ref()
        .map(|hdrs| {
            hdrs.keys()
                .any(|k| k.eq_ignore_ascii_case("user-agent"))
        })
        .unwrap_or(false);

    let mut client_builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(timeout_ms.unwrap_or(60000)))
        .connect_timeout(std::time::Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::limited(10))
        .gzip(true)
        .brotli(true)
        .deflate(true)
        .http1_only() // 对齐 needle/curl；部分音乐 CDN 在 HTTP/2 下会 RST 连接
        .danger_accept_invalid_certs(true); // 信任所有证书，以兼容各种书源网站

    if !has_custom_ua {
        let ua = if use_okhttp_user_agent.unwrap_or(false) {
            OKHTTP_UA
        } else {
            CHROME_UA
        };
        client_builder = client_builder.user_agent(ua);
    }

    if let Some(proxy_url) = proxy.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        match reqwest::Proxy::all(proxy_url) {
            Ok(p) => {
                client_builder = client_builder.proxy(p);
                eprintln!("[download_binary] 使用代理: {}", proxy_url);
            }
            Err(e) => {
                return Err(format!("无效的代理地址 {}: {}", proxy_url, e));
            }
        }
    }

    let client = client_builder
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
    // Set-Cookie 可能有多条，HashMap 单值会丢；合并后供 UserApi 解析 Hm_Iuvt_
    let mut resp_headers = HashMap::new();
    for (key, value) in response.headers().iter() {
        let header_value = String::from_utf8_lossy(value.as_bytes()).into_owned();
        let key_str = key.as_str();
        if key_str.eq_ignore_ascii_case("set-cookie") {
            resp_headers
                .entry("set-cookie".to_string())
                .and_modify(|existing: &mut String| {
                    existing.push_str(", ");
                    existing.push_str(&header_value);
                })
                .or_insert(header_value);
        } else {
            resp_headers.insert(key_str.to_string(), header_value);
        }
    }

    let data = response
        .bytes()
        .await
        .map_err(|e| format!("读取响应数据失败: {}", e))?
        .to_vec();

    if request_url.path().ends_with("/content") {
        if let Ok(text) = std::str::from_utf8(&data) {
            eprintln!(
                "[download_binary] /content 响应预览 ({} 字节): {}",
                text.len(),
                truncate_utf8_preview(text, 600)
            );
        }
    }

    Ok(DownloadResponse {
        data,
        status,
        headers: resp_headers,
        url: final_url,
    })
}

/// 由后端拉取 URL 返回文本（用于绕过浏览器 CORS，如书源网络导入）
#[tauri::command]
async fn fetch_url_text(
    url: String,
    timeout_ms: Option<u64>,
    skip_user_agent: Option<bool>,
) -> Result<String, String> {
    let trimmed = url.trim();
    let normalized_url = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else {
        format!("https://{}", trimmed)
    };
    let request_url = reqwest::Url::parse(&normalized_url)
        .map_err(|e| format!("URL 解析失败: {}", e))?;

    let client_builder = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_millis(timeout_ms.unwrap_or(30000)))
        .connect_timeout(std::time::Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::limited(10))
        .gzip(true)
        .brotli(true)
        .deflate(true);
    // 桌面端信任无效证书以兼容部分书源站；移动端使用默认校验证书
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let client_builder = client_builder.danger_accept_invalid_certs(true);
    let client = client_builder
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let mut request = client.get(request_url);
    if skip_user_agent.unwrap_or(false) {
        request = request.header("User-Agent", "null");
    }
    let response = request
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

/// 从 ZIP 中提取文本类条目（用于 Legado 备份包 / 书源包），返回 JSON：{ "bookSource.json": "..." }
#[tauri::command]
fn extract_zip_json_entries(zip_bytes: Vec<u8>) -> Result<std::collections::HashMap<String, String>, String> {
    use std::io::Read;
    let cursor = std::io::Cursor::new(zip_bytes);
    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| format!("ZIP 解析失败: {}", e))?;
    let mut out = std::collections::HashMap::new();
    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("读取 ZIP 条目失败: {}", e))?;
        let name = file.name().replace('\\', "/");
        let base = name.rsplit('/').next().unwrap_or(&name).to_lowercase();
        if !(base.ends_with(".json") || base.ends_with(".txt")) {
            continue;
        }
        let mut buf = Vec::new();
        file.read_to_end(&mut buf)
            .map_err(|e| format!("解压 {} 失败: {}", name, e))?;
        let text = String::from_utf8(buf.clone()).unwrap_or_else(|_| {
            String::from_utf8_lossy(&buf).into_owned()
        });
        if !text.trim().is_empty() {
            out.insert(base, text);
        }
    }
    Ok(out)
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

/// 覆盖子 WebView navigator.userAgent（与书源 HTTP 头一致，避免 CF clearance 绑定 UA 分叉）
#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn apply_user_agent_override_to_webview(webview: &tauri::Webview, user_agent: &str) -> Result<(), String> {
    let ua = user_agent.trim();
    if ua.is_empty() {
        return Ok(());
    }
    let js = format!(
        "try{{ navigator.__defineGetter__('userAgent', function(){{ return {}; }}); }}catch(e){{}}",
        serde_json::to_string(ua).map_err(|e| e.to_string())?
    );
    webview.eval(&js).map_err(|e| e.to_string())?;
    Ok(())
}

/// 向 Webview 注入目标 URL 域下的 Cookie
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub(crate) fn apply_http_cookies_to_webview(
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

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn inner_web_panel_init_script() -> String {
    format!(
        "{}\n{}",
        include_str!("../scripts/inner_web_panel_bootstrap.js"),
        include_str!("../scripts/inner_web_host_fixes.txt"),
    )
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn inner_web_panel_command_lock() -> &'static tokio::sync::Mutex<()> {
    static LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| tokio::sync::Mutex::new(()))
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[derive(Clone, Copy)]
struct InnerWebPanelRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn inner_web_panel_rect_store() -> &'static Mutex<Option<InnerWebPanelRect>> {
    static STORE: OnceLock<Mutex<Option<InnerWebPanelRect>>> = OnceLock::new();
    STORE.get_or_init(|| Mutex::new(None))
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn store_inner_web_panel_rect(x: f64, y: f64, width: f64, height: f64) {
    *inner_web_panel_rect_store().lock().unwrap() = Some(InnerWebPanelRect {
        x,
        y,
        width: width.max(1.0),
        height: height.max(1.0),
    });
}

/// hide() 在 Windows WebView2 子 WebView 上有时仍留合成层；移出视口并缩到 1×1 作为兜底。
#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn apply_inner_web_panel_visible(panel: &tauri::Webview, visible: bool) -> Result<(), String> {
    use tauri::{LogicalPosition, LogicalSize};

    if visible {
        if let Some(r) = *inner_web_panel_rect_store().lock().unwrap() {
            panel
                .set_position(LogicalPosition::new(r.x, r.y))
                .map_err(|e| e.to_string())?;
            panel
                .set_size(LogicalSize::new(r.width, r.height))
                .map_err(|e| e.to_string())?;
        }
        panel.show().map_err(|e| e.to_string())?;
    } else {
        let _ = panel.hide();
        panel
            .set_position(LogicalPosition::new(-10_000.0, -10_000.0))
            .map_err(|e| e.to_string())?;
        panel
            .set_size(LogicalSize::new(1.0, 1.0))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

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

/// 内嵌 Cookie 读写目标：`use_main_webview` 为 true 时固定主 WebView（iframe 模式），
/// 避免残留 panel 抢走 iframe `document.cookie` 的同步。
#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn webview_for_inner_web_cookies(
    app: &tauri::AppHandle,
    use_main_webview: bool,
) -> Result<tauri::Webview, String> {
    use tauri::Manager;
    if !use_main_webview {
        if let Some(w) = app.get_webview(INNER_WEB_PANEL_LABEL) {
            return Ok(w);
        }
        if let Some(w) = app.get_webview(INNER_WEB_CHILD_LABEL) {
            return Ok(w);
        }
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
    use_main_webview: Option<bool>,
) -> Result<String, String> {
    let url = url.trim().to_string();
    let cookies_str = cookies.trim().to_string();
    if url.is_empty() || !url.starts_with("http") {
        return Err("URL 无效".to_string());
    }
    let window = webview_for_inner_web_cookies(&app, use_main_webview.unwrap_or(false))?;
    apply_http_cookies_to_webview(&window, &url, &cookies_str)?;
    Ok(url)
}

/// 读取内嵌面板或主 WebView 中指定 URL 的 Cookie
#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
async fn get_webview_cookies_for_url(
    app: tauri::AppHandle,
    url: String,
    use_main_webview: Option<bool>,
) -> Result<String, String> {
    let url = url.trim();
    if url.is_empty() || !url.starts_with("http") {
        return Err("URL 无效".to_string());
    }
    let parsed_url = url::Url::parse(url).map_err(|e| e.to_string())?;
    let window = webview_for_inner_web_cookies(&app, use_main_webview.unwrap_or(false))?;

    let cookies = window
        .cookies_for_url(parsed_url)
        .map_err(|e| e.to_string())?;

    let parts: Vec<String> = cookies
        .iter()
        .map(|c| format!("{}={}", c.name(), c.value()))
        .collect();
    Ok(parts.join("; "))
}

/// 合并 panel 在若干 URL 键上的 Cookie（含 HttpOnly 的 cf_clearance）
#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn merge_panel_cookies_for_url(
    panel: &tauri::Webview,
    url: &str,
    seen: &mut std::collections::HashSet<String>,
    parts: &mut Vec<String>,
) {
    let url = url.trim();
    if url.is_empty() || !url.starts_with("http") {
        return;
    }
    let Ok(parsed) = url::Url::parse(url) else {
        return;
    };
    let origin = parsed.origin().ascii_serialization();
    let mut urls_to_try = vec![url.to_string(), origin.clone()];
    if !origin.ends_with('/') {
        urls_to_try.push(format!("{origin}/"));
    }
    if let Some(host) = parsed.host_str() {
        urls_to_try.push(format!("{}://{}/", parsed.scheme(), host));
    }
    for u in urls_to_try {
        let Ok(parsed_u) = url::Url::parse(&u) else {
            continue;
        };
        let Ok(cookies) = panel.cookies_for_url(parsed_u) else {
            continue;
        };
        for c in cookies {
            let line = format!("{}={}", c.name(), c.value());
            if seen.insert(line.clone()) {
                parts.push(line);
            }
        }
    }
}

/// panel bootstrap 上报的 navigator.userAgent（CF clearance 绑定此 UA）
#[tauri::command]
fn store_inner_web_panel_user_agent(ua: String) -> Result<(), String> {
    let trimmed = ua.trim();
    if trimmed.is_empty() {
        return Ok(());
    }
    if let Ok(mut guard) = inner_web_panel_user_agent_store().lock() {
        *guard = trimmed.to_string();
    }
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
async fn read_inner_web_panel_live_string(
    app: &tauri::AppHandle,
    js_expr: &str,
) -> Result<String, String> {
    use std::time::Duration;
    use tauri::Manager;

    let Some(panel) = app.get_webview(INNER_WEB_PANEL_LABEL) else {
        return Ok(String::new());
    };

    #[cfg(windows)]
    {
        let (tx, rx) = tokio::sync::oneshot::channel::<String>();
        inner_web_panel_capture::start_eval_panel_js_string(&panel, js_expr, tx)
            .map_err(|e| e.to_string())?;
        match tokio::time::timeout(Duration::from_millis(800), rx).await {
            Ok(Ok(value)) => Ok(value.trim().to_string()),
            _ => Ok(String::new()),
        }
    }

    #[cfg(not(windows))]
    {
        let _ = panel;
        let _ = js_expr;
        Ok(String::new())
    }
}

#[cfg(any(target_os = "android", target_os = "ios"))]
async fn read_inner_web_panel_live_string(
    _app: &tauri::AppHandle,
    _js_expr: &str,
) -> Result<String, String> {
    Ok(String::new())
}

#[tauri::command]
async fn get_inner_web_panel_user_agent(app: tauri::AppHandle) -> Result<String, String> {
    let live = read_inner_web_panel_live_string(&app, "navigator.userAgent").await?;
    if !live.is_empty() {
        if let Ok(mut guard) = inner_web_panel_user_agent_store().lock() {
            *guard = live.clone();
        }
        return Ok(live);
    }
    Ok(inner_web_panel_user_agent_store()
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default())
}

fn inner_web_panel_page_title_store() -> &'static Mutex<String> {
    static STORE: OnceLock<Mutex<String>> = OnceLock::new();
    STORE.get_or_init(|| Mutex::new(String::new()))
}

/// panel bootstrap 上报 document.title（CF 验证后替换「Cloudflare 验证」顶栏）
#[tauri::command]
fn store_inner_web_panel_page_title(title: String) -> Result<(), String> {
    let trimmed = title.trim();
    if trimmed.is_empty() {
        return Ok(());
    }
    if let Ok(mut guard) = inner_web_panel_page_title_store().lock() {
        *guard = trimmed.to_string();
    }
    Ok(())
}

#[tauri::command]
async fn get_inner_web_panel_page_title(app: tauri::AppHandle) -> Result<String, String> {
    let live = read_inner_web_panel_live_string(&app, "document.title").await?;
    if !live.is_empty() {
        if let Ok(mut guard) = inner_web_panel_page_title_store().lock() {
            *guard = live.clone();
        }
        return Ok(live);
    }
    Ok(inner_web_panel_page_title_store()
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default())
}

/// CF 挑战后 panel 可能已跳转到镜像域；读取当前 document URL
#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
async fn get_inner_web_panel_current_url(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;

    let panel = app
        .get_webview(INNER_WEB_PANEL_LABEL)
        .ok_or_else(|| "内嵌网页面板未打开".to_string())?;
    let current = panel.url().map_err(|e| e.to_string())?;
    let s = current.to_string();
    if s.starts_with("http://") || s.starts_with("https://") {
        Ok(s)
    } else {
        Ok(String::new())
    }
}

/// 仅从桌面内嵌子 WebView 面板读取 Cookie（√ 同步书源设置时避免回退到主 WebView 的旧 Cookie）
#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
async fn get_inner_web_panel_cookies_for_url(
    app: tauri::AppHandle,
    url: String,
) -> Result<String, String> {
    use tauri::Manager;

    let url = url.trim();
    if url.is_empty() || !url.starts_with("http") {
        return Err("URL 无效".to_string());
    }
    let panel = app
        .get_webview(INNER_WEB_PANEL_LABEL)
        .ok_or_else(|| "内嵌网页面板未打开".to_string())?;

    let mut seen = std::collections::HashSet::<String>::new();
    let mut parts: Vec<String> = Vec::new();
    merge_panel_cookies_for_url(&panel, url, &mut seen, &mut parts);
    Ok(parts.join("; "))
}

/// Tauri panel √ 前抓取 document HTML（光遇 getServerSettings 解析 serverValue）
#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn inner_web_panel_html_snapshot_store() -> &'static Mutex<String> {
    static STORE: OnceLock<Mutex<String>> = OnceLock::new();
    STORE.get_or_init(|| Mutex::new(String::new()))
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
fn store_inner_web_panel_html_snapshot(html: String) -> Result<(), String> {
    if let Ok(mut guard) = inner_web_panel_html_snapshot_store().lock() {
        *guard = html;
    }
    Ok(())
}

/// 轮询 panel DOM，直到 `selector` 匹配节点数达到 `min_count`（用于 SPA 列表页渲染完成后再抓 HTML）
#[cfg(not(any(target_os = "android", target_os = "ios")))]
async fn wait_inner_web_panel_selector(
    app: &tauri::AppHandle,
    selector: &str,
    timeout_ms: u64,
    min_count: u32,
) {
    use std::time::Duration;

    let selector = selector.trim();
    if selector.is_empty() || min_count == 0 {
        return;
    }
    let js_count = format!(
        r#"(()=>{{try{{return String(document.querySelectorAll({}).length);}}catch(e){{return '0';}}}})()"#,
        serde_json::to_string(selector).unwrap_or_else(|_| "\"\"".to_string())
    );
    let deadline = std::time::Instant::now() + Duration::from_millis(timeout_ms.max(500));
    while std::time::Instant::now() < deadline {
        let count = read_inner_web_panel_live_string(app, &js_count)
            .await
            .unwrap_or_default();
        if count.parse::<u32>().unwrap_or(0) >= min_count {
            return;
        }
        tokio::time::sleep(Duration::from_millis(350)).await;
    }
}

/// CF 验证后：在同一 panel WebView 内导航并抓取 HTML（cf_clearance 绑定此实例指纹）
#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
async fn fetch_inner_web_panel_html(
    app: tauri::AppHandle,
    url: String,
    cookies: Option<String>,
    user_agent: Option<String>,
    delay_ms: Option<u64>,
    wait_selector: Option<String>,
    wait_min_count: Option<u32>,
    wait_timeout_ms: Option<u64>,
) -> Result<String, String> {
    use std::time::Duration;
    use tauri::Manager;

    let url = url.trim();
    if !url.starts_with("http") {
        return Err("URL 无效".to_string());
    }

    let panel = app
        .get_webview(INNER_WEB_PANEL_LABEL)
        .ok_or_else(|| "内嵌 panel 未打开".to_string())?;

    if let Some(cookies) = cookies.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        apply_http_cookies_to_webview(&panel, url, cookies)?;
    }
    if let Some(ua) = user_agent.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        apply_user_agent_override_to_webview(&panel, ua)?;
    }

    let nav = format!(
        "window.location.assign({});",
        serde_json::to_string(url).map_err(|e| e.to_string())?
    );
    panel.eval(&nav).map_err(|e| e.to_string())?;
    let init_script = inner_web_panel_init_script();
    let _ = panel.eval(&init_script);

    let delay = delay_ms.unwrap_or(3500).clamp(500, 30_000);
    tokio::time::sleep(Duration::from_millis(delay)).await;

    if let Some(sel) = wait_selector.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        let min_count = wait_min_count.unwrap_or(4).max(1);
        let timeout = wait_timeout_ms.unwrap_or(15_000).clamp(500, 60_000);
        wait_inner_web_panel_selector(&app, sel, timeout, min_count).await;
    }

    capture_inner_web_panel_document_html(app).await
}

#[cfg(any(target_os = "android", target_os = "ios"))]
#[tauri::command]
async fn fetch_inner_web_panel_html(
    _app: tauri::AppHandle,
    _url: String,
    _cookies: Option<String>,
    _user_agent: Option<String>,
    _delay_ms: Option<u64>,
    _wait_selector: Option<String>,
    _wait_min_count: Option<u32>,
    _wait_timeout_ms: Option<u64>,
) -> Result<String, String> {
    Err("移动端不支持 panel CF 拉取".to_string())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
async fn capture_inner_web_panel_document_html(app: tauri::AppHandle) -> Result<String, String> {
    use std::time::Duration;
    use tauri::Manager;

    let Some(panel) = app.get_webview(INNER_WEB_PANEL_LABEL) else {
        eprintln!("[inner-web] capture: panel webview not found");
        return Ok(String::new());
    };

    #[cfg(windows)]
    {
        let (tx, rx) = tokio::sync::oneshot::channel::<String>();
        inner_web_panel_capture::start_capture_panel_document_html(&panel, tx)
            .map_err(|e| e.to_string())?;

        match tokio::time::timeout(Duration::from_millis(1200), rx).await {
            Ok(Ok(html)) => {
                eprintln!("[inner-web] capture panel document html len={}", html.len());
                Ok(html)
            }
            Ok(Err(_)) => Ok(String::new()),
            Err(_) => {
                eprintln!("[inner-web] capture panel document html timeout");
                Ok(String::new())
            }
        }
    }

    #[cfg(not(windows))]
    {
        let html = inner_web_panel_capture::capture_panel_document_html_blocking(
            &panel,
            inner_web_panel_html_snapshot_store(),
        )?;
        eprintln!("[inner-web] capture panel document html len={}", html.len());
        Ok(html)
    }
}

/// √ 前强制把 panel 页 `document.cookie` 刷入 Cookie 罐（立即应用后、读罐前调用）
#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
async fn flush_inner_web_panel_document_cookie(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;

    let Some(panel) = app.get_webview(INNER_WEB_PANEL_LABEL) else {
        return Ok(());
    };
    let _ = panel.eval(
        "try{window.__READER_INNER_WEB_PANEL_FLUSH__&&window.__READER_INNER_WEB_PANEL_FLUSH__();}catch(e){}",
    );
    Ok(())
}

/// iframe 内 document.cookie 变更时，由主窗口 postMessage 桥接写入 WebView Cookie 罐
#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
async fn sync_document_cookies_for_inner_web(
    app: tauri::AppHandle,
    url: String,
    cookies: String,
    use_main_webview: Option<bool>,
) -> Result<(), String> {
    let url = url.trim();
    let cookies_str = cookies.trim();
    if url.is_empty() || !url.starts_with("http") || cookies_str.is_empty() {
        return Ok(());
    }
    let window = webview_for_inner_web_cookies(&app, use_main_webview.unwrap_or(false))?;
    apply_http_cookies_to_webview(&window, url, cookies_str)?;
    Ok(())
}

/// 在主窗口内嵌 https 子 WebView（同窗口多 WebView，工具栏保留在主 WebView 层）
#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn normalize_inner_web_document_url(raw: &str) -> String {
    let trimmed = raw.trim();
    let Ok(mut u) = url::Url::parse(trimmed) else {
        return trimmed.to_string();
    };
    u.set_fragment(None);
    let path_owned = u.path().trim_end_matches('/').to_string();
    let path = if path_owned.is_empty() {
        "/".to_string()
    } else {
        path_owned
    };
    u.set_path(&path);
    u.to_string()
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn inner_web_document_urls_equivalent(a: &str, b: &str) -> bool {
    normalize_inner_web_document_url(a) == normalize_inner_web_document_url(b)
}

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
    user_agent: Option<String>,
) -> Result<(), String> {
    use tauri::webview::WebviewBuilder;
    use tauri::{LogicalPosition, LogicalSize, Manager, WebviewUrl};

    let _guard = inner_web_panel_command_lock().lock().await;

    let url = url.trim().to_string();
    let cookies_str = cookies.trim().to_string();
    let panel_user_agent = user_agent
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let ok_http = url.starts_with("http://") || url.starts_with("https://");
    let ok_data = url.starts_with("data:text/html");
    if url.is_empty() || !(ok_http || ok_data) {
        return Err("URL 无效".to_string());
    }
    let target_url = url
        .parse::<url::Url>()
        .map_err(|e: url::ParseError| e.to_string())?;
    let w = width.max(1.0);
    let h = height.max(1.0);
    let pos = LogicalPosition::new(x, y);
    let size = LogicalSize::new(w, h);

    if let Some(panel) = app.get_webview(INNER_WEB_PANEL_LABEL) {
        if !cookies_str.is_empty() && ok_http {
            apply_http_cookies_to_webview(&panel, &url, &cookies_str)?;
        }
        store_inner_web_panel_rect(x, y, w, h);
        panel
            .set_position(pos)
            .map_err(|e| e.to_string())?;
        panel.set_size(size).map_err(|e| e.to_string())?;
        // WebView2 会拦截已加载页再跳 data: 顶层导航；data: 时改为重建子 WebView。
        if ok_data {
            panel.close().map_err(|e| e.to_string())?;
            // close() 后 label 异步释放，立即 add_child 会报 already exists
            for _ in 0..40 {
                if app.get_webview(INNER_WEB_PANEL_LABEL).is_none() {
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_millis(25)).await;
            }
            if app.get_webview(INNER_WEB_PANEL_LABEL).is_some() {
                return Err(format!(
                    "a webview with label `{INNER_WEB_PANEL_LABEL}` already exists"
                ));
            }
        } else {
            if let Some(ref ua) = panel_user_agent {
                apply_user_agent_override_to_webview(&panel, ua)?;
            }
            let should_nav = panel
                .url()
                .ok()
                .map(|current| {
                    let cs = current.to_string();
                    !(cs.starts_with("http://") || cs.starts_with("https://"))
                        || !inner_web_document_urls_equivalent(&cs, &url)
                })
                .unwrap_or(true);
            if should_nav {
                let nav = format!(
                    "window.location.replace({});",
                    serde_json::to_string(&url).unwrap()
                );
                panel.eval(&nav).map_err(|e| e.to_string())?;
                let init_script = inner_web_panel_init_script();
    let _ = panel.eval(&init_script);
            }
            let _ = panel.set_focus();
            return Ok(());
        }
    }

    let window = app
        .get_window("main")
        .ok_or_else(|| "主窗口不存在".to_string())?;

    let app_for_nav = app.clone();
    let panel_init_script = inner_web_panel_init_script();
    let mut webview_builder = WebviewBuilder::new(INNER_WEB_PANEL_LABEL, WebviewUrl::External(target_url))
        .initialization_script(&panel_init_script)
        .on_navigation(move |url| !handle_inner_web_special_uri(&app_for_nav, url.as_str()))
        .focused(true);
    if let Ok(config_path) = portable_paths::config_file_path() {
        if let Ok(root) = portable_paths::effective_webview_data_root(&config_path) {
            if let Ok(data_dir) =
                portable_paths::webview_data_directory(&root, INNER_WEB_PANEL_LABEL)
            {
                webview_builder = webview_builder.data_directory(data_dir);
            }
        }
    }
    let panel = window
        .add_child(webview_builder, pos, size)
        .map_err(|e| e.to_string())?;

    if !cookies_str.is_empty() && ok_http {
        apply_http_cookies_to_webview(&panel, &url, &cookies_str)?;
    }
    if let Some(ref ua) = panel_user_agent {
        apply_user_agent_override_to_webview(&panel, ua)?;
    }
    store_inner_web_panel_rect(x, y, w, h);
    if ok_http {
        let nav = format!(
            "window.location.replace({});",
            serde_json::to_string(&url).unwrap()
        );
        panel.eval(&nav).map_err(|e| e.to_string())?;
    }
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
    let w = width.max(1.0);
    let h = height.max(1.0);
    store_inner_web_panel_rect(x, y, w, h);
    panel
        .set_position(LogicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    panel
        .set_size(LogicalSize::new(w, h))
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

    let _guard = inner_web_panel_command_lock().lock().await;

    if let Some(panel) = app.get_webview(INNER_WEB_PANEL_LABEL) {
        panel.close().map_err(|e| e.to_string())?;
    }
    if let Ok(mut guard) = inner_web_panel_user_agent_store().lock() {
        guard.clear();
    }
    if let Ok(mut guard) = inner_web_panel_page_title_store().lock() {
        guard.clear();
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
    let ok_http = url.starts_with("http://") || url.starts_with("https://");
    let ok_data = url.starts_with("data:text/html");
    if url.is_empty() || !(ok_http || ok_data) {
        return Err("URL 无效".to_string());
    }
    let target_url = url
        .parse::<url::Url>()
        .map_err(|e: url::ParseError| e.to_string())?;
    let w = width.max(1.0);
    let h = height.max(1.0);

    if let Some(child) = app.get_webview_window(INNER_WEB_CHILD_LABEL) {
        if !cookies_str.is_empty() && ok_http {
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
        if ok_data {
            child.close().map_err(|e| e.to_string())?;
        } else {
            let nav = format!(
                "window.location.replace({});",
                serde_json::to_string(&url).unwrap()
            );
            child.eval(&nav).map_err(|e| e.to_string())?;
            let _ = child.show();
            let _ = child.set_focus();
            return Ok(());
        }
    }

    let parent = app
        .get_webview_window("main")
        .ok_or_else(|| "主窗口不存在".to_string())?;

    let app_for_nav = app.clone();
    let child_init_script = inner_web_panel_init_script();
    let mut child_builder = WebviewWindowBuilder::new(
        &app,
        INNER_WEB_CHILD_LABEL,
        WebviewUrl::External(target_url),
    )
    .initialization_script(&child_init_script)
    .on_navigation(move |url| !handle_inner_web_special_uri(&app_for_nav, url.as_str()))
    .parent(&parent)
    .map_err(|e| e.to_string())?
    .title("")
    .decorations(false)
    .resizable(false)
    .skip_taskbar(true)
    .visible(true)
    .focused(true)
    .position(x, y)
    .inner_size(w, h);
    if let Ok(config_path) = portable_paths::config_file_path() {
        if let Ok(root) = portable_paths::effective_webview_data_root(&config_path) {
            if let Ok(data_dir) =
                portable_paths::webview_data_directory(&root, INNER_WEB_CHILD_LABEL)
            {
                child_builder = child_builder.data_directory(data_dir);
            }
        }
    }
    let child = child_builder.build().map_err(|e| e.to_string())?;

    if !cookies_str.is_empty() && ok_http {
        if let Some(wv) = app.get_webview(INNER_WEB_CHILD_LABEL) {
            apply_http_cookies_to_webview(&wv, &url, &cookies_str)?;
        }
    }
    if ok_http {
        let nav = format!(
            "window.location.replace({});",
            serde_json::to_string(&url).unwrap()
        );
        child.eval(&nav).map_err(|e| e.to_string())?;
    }
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

/// 临时隐藏内嵌原生 WebView，使主 WebView 上的下拉/对话框/Toast 能显示在最上层
#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
async fn set_inner_web_panel_visible(
    app: tauri::AppHandle,
    visible: bool,
) -> Result<(), String> {
    use tauri::Manager;

    let mut has_surface = false;

    if let Some(panel) = app.get_webview(INNER_WEB_PANEL_LABEL) {
        apply_inner_web_panel_visible(&panel, visible)?;
        has_surface = true;
    }

    if let Some(child) = app.get_webview_window(INNER_WEB_CHILD_LABEL) {
        if visible {
            child.show().map_err(|e| e.to_string())?;
        } else {
            child.hide().map_err(|e| e.to_string())?;
        }
        has_surface = true;
    }

    if !has_surface {
        return Ok(());
    }

    if visible {
        let _ = try_focus_inner_web_surface(&app);
    } else if let Some(main) = app.get_webview_window("main") {
        let _ = main.set_focus();
    }

    Ok(())
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

/// 从内嵌 data: HTML 子 WebView 由 `window.__TAURI__.core.invoke` 调用，派发网络书源导入（宿主侧拉取 JSON）
#[tauri::command]
fn reader_emit_network_booksource_import(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let url = url.trim().to_string();
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Ok(());
    }
    app.emit(
        "reader-network-booksource-import",
        serde_json::json!({ "url": url }),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
fn inner_web_panel_open_link(
    app: tauri::AppHandle,
    url: String,
    target: Option<String>,
) -> Result<(), String> {
    let u = url.trim();
    if handle_inner_web_special_uri(&app, u) {
        return Ok(());
    }
    if u.starts_with("http://") || u.starts_with("https://") {
        if let Some(panel) = app.get_webview(INNER_WEB_PANEL_LABEL) {
            let should_nav = panel
                .url()
                .ok()
                .map(|current| {
                    let cs = current.to_string();
                    !(cs.starts_with("http://") || cs.starts_with("https://"))
                        || !inner_web_document_urls_equivalent(&cs, u)
                })
                .unwrap_or(true);
            if should_nav {
                let nav = format!(
                    "window.location.assign({});",
                    serde_json::to_string(u).unwrap()
                );
                panel.eval(&nav).map_err(|e| e.to_string())?;
                let init_script = inner_web_panel_init_script();
    let _ = panel.eval(&init_script);
            }
        }
        app.emit(
            "reader-inner-web-open-link",
            serde_json::json!({
                "url": u,
                "target": target.unwrap_or_default(),
            }),
        )
        .map_err(|e| e.to_string())?;
        return Ok(());
    }
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn handle_inner_web_special_uri(app: &tauri::AppHandle, uri: &str) -> bool {
    let s = uri.trim();
    let sl = s.to_ascii_lowercase();
    if sl.starts_with("yuedu://") {
        if let Ok(parsed) = url::Url::parse(s) {
            if let Some(src_raw) = parsed
                .query_pairs()
                .find(|(k, _)| k == "src")
                .map(|(_, v)| v.to_string())
            {
                let src = src_raw.trim().to_string();
                if src.starts_with("http://") || src.starts_with("https://") {
                    let _ = app.emit(
                        "reader-network-booksource-import",
                        serde_json::json!({ "url": src }),
                    );
                    return true;
                }
            }
        }
        let _ = app.emit(
            "reader-import-deeplink",
            serde_json::json!({ "uri": s.to_string() }),
        );
        return true;
    }
    if sl.starts_with("legado://") {
        let _ = app.emit(
            "reader-import-deeplink",
            serde_json::json!({ "uri": s.to_string() }),
        );
        return true;
    }
    false
}

fn emit_argv_import_deeplinks(emitter: &tauri::AppHandle, argv: impl IntoIterator<Item = String>) {
    for arg in argv {
        let trimmed = arg.trim().to_string();
        let tl = trimmed.to_ascii_lowercase();
        if tl.starts_with("legado://") || tl.starts_with("yuedu://") {
            let _ = emitter.emit(
                "reader-import-deeplink",
                serde_json::json!({ "uri": trimmed }),
            );
        }
    }
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

    let mut builder = WebviewWindowBuilder::new(
        &app,
        &label,
        WebviewUrl::External("about:blank".parse().map_err(|e: url::ParseError| e.to_string())?),
    )
    .title(&title)
    .inner_size(800.0_f64, 600.0_f64)
    .min_inner_size(400.0_f64, 300.0_f64);
    if let Ok(config_path) = portable_paths::config_file_path() {
        if let Ok(root) = portable_paths::effective_webview_data_root(&config_path) {
            if let Ok(data_dir) = portable_paths::webview_data_directory(&root, &label) {
                builder = builder.data_directory(data_dir);
            }
        }
    }

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

/// 将 UTF-8 文本编码为 GBK 字节（对齐 LX 旁路 `.lrc` 的 gbk 写出）
#[tauri::command]
fn encode_gbk(text: String) -> Result<Vec<u8>, String> {
    let (cow, _, had_errors) = GBK.encode(&text);
    if had_errors {
        eprintln!("警告: GBK 编码时遇到一些无法转换的字符");
    }
    Ok(cow.into_owned())
}

fn encode_gbk_form_component(s: &str) -> String {
    let (cow, _, had_errors) = GBK.encode(s);
    if had_errors {
        eprintln!("警告: GBK 编码时遇到一些无法转换的字符");
    }
    let mut out = String::with_capacity(cow.len() * 3);
    for &b in cow.as_ref() {
        match b {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'*' => {
                out.push(b as char);
            }
            b' ' => out.push('+'),
            _ => {
                use std::fmt::Write;
                let _ = write!(out, "%{:02X}", b);
            }
        }
    }
    out
}

fn decode_form_value_if_base64(value: &str) -> String {
    if value.starts_with('<') && value.ends_with('>') && value.len() >= 2 {
        let inner = &value[1..value.len() - 1];
        if let Ok(decoded) = base64::Engine::decode(
            &base64::engine::general_purpose::STANDARD,
            inner,
        ) {
            return String::from_utf8_lossy(&decoded).into_owned();
        }
    }
    value.to_string()
}

/// Legado AnalyzeUrl：charset=gbk 时对 key=value&... 做 GBK 百分号编码（对齐 Java URLEncoder）
#[tauri::command]
fn encode_form_urlencoded_gbk(fields: String) -> Result<String, String> {
    let len = fields.len();
    let mut pos = 0usize;
    let mut parts: Vec<String> = Vec::new();

    while pos <= len {
        let amp = fields[pos..].find('&').map(|i| pos + i).unwrap_or(len);
        let eq = fields[pos..amp].find('=').map(|i| pos + i);

        if eq.is_none() {
            let key = fields[pos..amp].trim();
            if !key.is_empty() {
                parts.push(encode_gbk_form_component(key));
            }
        } else {
            let eq = eq.unwrap();
            let key = fields[pos..eq].trim();
            let mut value = fields[eq + 1..amp].to_string();
            value = decode_form_value_if_base64(&value);
            parts.push(format!(
                "{}={}",
                encode_gbk_form_component(key),
                encode_gbk_form_component(&value)
            ));
        }
        pos = amp + 1;
    }

    Ok(parts.join("&"))
}

/// 禁用除 DevTools、整页刷新外的快捷键（开发与发布构建一致）。
fn prevent_default_disabled_flags() -> Flags {
    Flags::all().difference(Flags::DEV_TOOLS | Flags::RELOAD)
}

/// 只注册一个 prevent-default 插件，避免重复注入 keydown 拦截脚本。
#[cfg(target_os = "windows")]
fn prevent_default_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_prevent_default::Builder::new()
        .with_flags(prevent_default_disabled_flags())
        .platform(
            PlatformOptions::new()
                .general_autofill(true)
                .password_autosave(false)
                // WebView2 层也需放行 F5/Ctrl+R/F12 与 DevTools（仅 JS flags 不够）
                .browser_accelerator_keys(true)
                .dev_tools(true)
                .default_context_menus(false)
                .default_script_dialogs(false),
        )
        .build()
}

#[cfg(not(target_os = "windows"))]
fn prevent_default_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_prevent_default::Builder::new()
        .with_flags(prevent_default_disabled_flags())
        .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    portable_paths::run_legacy_layout_migrations();

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    http_cookies::preflight_install_http_cookies_bridge();

    let log_plugin = {
        use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};
        let mut builder = tauri_plugin_log::Builder::new()
            .level(tauri_plugin_log::log::LevelFilter::Info)
            .rotation_strategy(RotationStrategy::KeepSome(7))
            .max_file_size(10 * 1024 * 1024)
            .timezone_strategy(TimezoneStrategy::UseLocal);
        #[cfg(not(any(target_os = "android", target_os = "ios")))]
        {
            if let Ok(log_dir) = portable_paths::log_directory() {
                builder = builder.targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::Folder {
                        path: log_dir,
                        file_name: Some("reader".into()),
                    }),
                ]);
            } else {
                builder = builder.target(Target::new(TargetKind::Stdout));
            }
        }
        #[cfg(any(target_os = "android", target_os = "ios"))]
        {
            builder = builder.targets([
                Target::new(TargetKind::Stdout),
                Target::new(TargetKind::LogDir {
                    file_name: Some("reader".into()),
                }),
            ]);
        }
        builder.build()
    };

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
        .plugin(tauri_plugin_process::init())
        .plugin(log_plugin)
        .plugin(prevent_default_plugin());

    // 桌面平台专用插件和命令
    #[cfg(not(target_os = "android"))]
    #[cfg(not(target_os = "ios"))]
    let builder = builder
        // 暂时禁用 updater 插件，需要配置 tauri.conf.json
        // .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::Builder::new().build());
    // .plugin(tauri_plugin_clipboard::init()) // 如果需要可以取消注释

    // 发布版单实例：二次启动时聚焦已有窗口。dev 配置下禁用，避免残留 reader.exe
    // 导致 `tauri dev` 子进程秒退、Vite 被一并关掉。
    #[cfg(all(not(target_os = "android"), not(target_os = "ios"), not(debug_assertions)))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
        eprintln!("[reader] 检测到二次启动，转发到已有实例");
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
        } else if let Err(e) = create_main_window_if_missing(&app) {
            eprintln!("[reader] 无法恢复主窗口: {e}");
        }
        emit_argv_import_deeplinks(&app, argv);
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

    #[cfg(target_os = "android")]
    let builder = builder
        .plugin(tauri_plugin_android_fs::init())
        .plugin(crate::platform::android::display_brightness::init_plugin())
        .plugin(crate::platform::android::music_media::init_plugin())
        .plugin(crate::platform::android::tv_spider::init_plugin());

    let builder = builder.setup(|app| {
        emit_argv_import_deeplinks(app.handle(), std::env::args().skip(1));

        #[cfg(not(any(target_os = "android", target_os = "ios")))]
        {
            let config_path = get_config_file_path(app.handle())?;
            ensure_config_exists(&config_path)?;
            data_migration::validate_and_fallback_data_dir(app.handle())?;

            if data_migration::has_pending_relocation(app.handle())? {
                use tauri::{WebviewUrl, WebviewWindowBuilder};
                let mut splash = WebviewWindowBuilder::new(
                    app.handle(),
                    "migration_splash",
                    WebviewUrl::default(),
                )
                .title("正在迁移数据")
                .inner_size(520.0, 320.0)
                .center()
                .resizable(false)
                .decorations(true)
                .visible(true);
                if let Ok(root) = portable_paths::effective_webview_data_root(&config_path) {
                    if let Ok(data_dir) =
                        portable_paths::webview_data_directory(&root, "migration_splash")
                    {
                        splash = splash.data_directory(data_dir);
                    }
                }
                splash.build()?;
                data_migration::spawn_relocation_migration(app.handle().clone());
            } else {
                data_migration::run_startup_migration(app.handle());
                create_main_window_if_missing(app.handle())?;
                let default_base = default_app_data_base(app.handle())?;
                let data_root = effective_data_dir_from_config(&config_path, &default_base)?;
                portable_paths::register_portable_fs_scope(app.handle(), &data_root)?;
                if let Ok(web_root) = portable_paths::effective_webview_data_root(&config_path) {
                    let _ = portable_paths::allow_fs_directory(app.handle(), &web_root);
                }
                if let Ok(log_dir) = portable_paths::log_directory() {
                    let _ = portable_paths::allow_fs_directory(app.handle(), &log_dir);
                }
            }
        }

        #[cfg(any(target_os = "android", target_os = "ios"))]
        if app.get_webview_window("main").is_none() {
            use tauri::webview::WebviewWindowBuilder;
            let win_config = app
                .config()
                .app
                .windows
                .iter()
                .find(|w| w.label == "main")
                .or_else(|| app.config().app.windows.first())
                .ok_or_else(|| "tauri.conf.json 中未配置主窗口".to_string())?;
            WebviewWindowBuilder::from_config(app.handle(), win_config)?.build()?;
        }

        tv_proxy::bind_app(app.handle().clone());
        let _ = tv_proxy::ensure_started();

        Ok(())
    });

    builder
        .invoke_handler(tauri::generate_handler![
            android_fs_commands::android_fs_probe,
            android_fs_commands::android_pick_files,
            android_fs_commands::android_uri_display_name,
            android_fs_commands::android_read_uri_bytes,
            android_fs_commands::android_delete_uri,
            android_fs_commands::android_pick_dir,
            android_fs_commands::android_persist_dir_permission,
            android_fs_commands::android_read_dir,
            android_fs_commands::android_write_book_to_tree,
            android_media_session::sync_android_media_session,
            android_media_session::report_android_media_action,
            #[cfg(target_os = "android")]
            android_media_session::get_android_media_session_snapshot,
            #[cfg(target_os = "android")]
            android_media_session::take_android_media_pending_action,
            android_media_session::request_android_overlay_permission,
            android_media_session::request_android_ignore_battery_optimizations,
            android_media_session::check_android_overlay_permission,
            android_media_session::get_android_network_type,
            android_media_session::show_android_desktop_lyric,
            android_media_session::hide_android_desktop_lyric,
            android_media_session::set_android_desktop_lyric_text,
            android_media_session::set_android_desktop_lyric_style,
            android_media_session::set_android_desktop_lyric_lock,
            android_media_session::is_android_desktop_lyric_shown,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            music_openapi::start_music_openapi,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            music_openapi::update_music_openapi_state,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            music_openapi::stop_music_openapi,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            music_openapi::get_music_openapi_status,
            tv_proxy::tv_proxy_base_url,
            tv_proxy::tv_local_api_base_url,
            tv_proxy::tv_proxy_resolve,
            tv_proxy::tv_media_report,
            tv_jar_host::tv_jar_engine_kind,
            tv_jar_host::tv_jar_invoke,
            tv_jar_host::tv_jar_json_ext,
            tv_jar_host::tv_jar_prefetch,
            tv_jar_host::tv_start_jar_host,
            tv_jar_host::tv_jar_clear_cache,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            lx_sync_server::start_lx_sync_server,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            lx_sync_server::stop_lx_sync_server,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            lx_sync_server::get_lx_sync_server_status,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            desktop_lyric::open_desktop_lyric_window,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            desktop_lyric::close_desktop_lyric_window,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            desktop_lyric::set_desktop_lyric_ignore_cursor,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            desktop_lyric::set_desktop_lyric_penetrate_mode,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            desktop_lyric::set_desktop_lyric_chrome_height,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            desktop_lyric::set_desktop_lyric_window_options,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            desktop_lyric::set_desktop_lyric_interacting,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            desktop_lyric::set_desktop_lyric_resizable,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            desktop_lyric::set_desktop_lyric_bounds,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            desktop_lyric::clamp_desktop_lyric_to_screen,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            desktop_lyric::reset_desktop_lyric_window_geometry,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            desktop_lyric::is_desktop_lyric_window_open,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            desktop_lyric::precreate_desktop_lyric_window,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            desktop_lyric::destroy_desktop_lyric_window,
            music_mini_player::precreate_music_mini_player_window,
            music_mini_player::open_music_mini_player_window,
            music_mini_player::close_music_mini_player_window,
            music_mini_player::destroy_music_mini_player_window,
            music_mini_player::is_music_mini_player_window_open,
            music_mini_player::clamp_music_mini_player_to_screen,
            music_mini_player::set_music_mini_player_bounds,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            global_hotkey::register_music_hotkeys,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            global_hotkey::unregister_music_hotkeys,
            display_reader_commands::probe_display_brightness,
            display_reader_commands::get_display_brightness,
            display_reader_commands::set_display_brightness,
            display_reader_commands::capture_display_brightness,
            display_reader_commands::restore_display_brightness,
            display_reader_commands::follow_system_display_brightness,
            display_reader_commands::can_write_display_settings,
            display_reader_commands::open_display_write_settings,
            display_reader_commands::set_screen_orientation,
            display_reader_commands::set_keep_screen_on,
            display_reader_commands::set_music_sleep_blocked,
            download_binary,
            fetch_url_text,
            extract_zip_json_entries,
            decode_gbk,
            encode_gbk,
            encode_form_urlencoded_gbk,
            request_app_exit,
            shutdown_system,
            get_app_data_root,
            get_default_app_data_base,
            get_exe_dir,
            get_config,
            set_config,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            webview_storage::get_webview_data_root,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            webview_storage::get_log_directory,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            webview_storage::get_webview_storage_stats,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            webview_storage::clear_webview_disk_cache,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            webview_storage::clear_webview_cookies,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            webview_storage::clear_main_webview_all_browsing_data,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            data_migration::run_legacy_data_migration,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            data_migration::precheck_data_dir_migration,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            data_migration::revert_pending_data_dir_migration,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            data_migration::retry_pending_relocation_migration,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            data_migration::get_data_dir_migration_backup,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            data_migration::clear_data_dir_migration_backup,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            window_state::save_window_state,
            run_login_script_rust,
            reader_emit_network_booksource_import,
            prepare_login_open,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            set_cookies_for_inner_web,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            get_webview_cookies_for_url,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            get_inner_web_panel_cookies_for_url,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            get_inner_web_panel_current_url,
            store_inner_web_panel_user_agent,
            get_inner_web_panel_user_agent,
            store_inner_web_panel_page_title,
            get_inner_web_panel_page_title,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            store_inner_web_panel_html_snapshot,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            capture_inner_web_panel_document_html,
            fetch_inner_web_panel_html,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            flush_inner_web_panel_document_cookie,
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
            inner_web_panel_open_link,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            set_inner_web_session_active,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            focus_inner_web_panel,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            set_inner_web_panel_visible,
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
            crate::backstage_webview::backstage_webjs_complete,
            crate::backstage_webview::run_backstage_webjs,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crate::backstage_webview::get_backstage_webview_cookies_for_url,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crate::backstage_webview::set_cookies_for_backstage_webview,
            crate::webjs_java_rpc::webjs_java_rpc,
            web_service::web_api_complete_cmd,
            web_service::start_reader_web_service_cmd,
            web_service::stop_reader_web_service_cmd,
            web_socket::web_ws_send_cmd,
            web_socket::web_ws_close_cmd,
            local_addresses::get_local_network_addresses_cmd,
            media_convert::media_convert_probe,
            media_convert::convert_image_bytes,
            media_convert::convert_audio_bytes,
            tx_qrc_decode::decode_tx_qrc_lyric,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            if matches!(
                event,
                tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit { .. }
            ) {
                window_state::save_on_exit(app_handle);
                http_cookies::finalize_http_cookies_to_portable();
            }

            #[cfg(any(target_os = "android", target_os = "ios"))]
            let _ = app_handle;

            // 兜底：仅拦截系统/用户触发的退出（code=None）；前端 request_app_exit / app.exit(0) 为 code=Some，须放行。
            #[cfg(any(target_os = "android", target_os = "ios"))]
            if let tauri::RunEvent::ExitRequested { api, code, .. } = event {
                if code.is_none() {
                    api.prevent_exit();
                }
            }
        });
}
