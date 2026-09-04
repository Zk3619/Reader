//! 影视 JAR 引擎：桌面拉起 tv-jar-host；Android 走 TvSpiderPlugin

#[cfg(not(target_os = "android"))]
use std::io::{BufRead, BufReader, Write};
#[cfg(not(target_os = "android"))]
use std::net::TcpStream;
#[cfg(not(target_os = "android"))]
use std::process::{Child, Command, Stdio};
#[cfg(not(target_os = "android"))]
use std::sync::{Mutex, OnceLock};
#[cfg(not(target_os = "android"))]
use std::time::Duration;

use tauri::AppHandle;

#[cfg(not(target_os = "android"))]
static HOST: OnceLock<Mutex<Option<JarHostState>>> = OnceLock::new();

#[cfg(not(target_os = "android"))]
struct JarHostState {
    #[allow(dead_code)]
    child: Option<Child>,
    port: u16,
}

#[cfg(not(target_os = "android"))]
fn state() -> &'static Mutex<Option<JarHostState>> {
    HOST.get_or_init(|| Mutex::new(None))
}

#[cfg(target_os = "android")]
fn engine_kind_inner(app: &AppHandle) -> String {
    crate::platform::android::tv_spider::invoke_engine_kind(app)
        .unwrap_or_else(|_| "dex-native".into())
}

#[cfg(not(target_os = "android"))]
fn engine_kind_inner(_app: &AppHandle) -> String {
    if which_java().is_some() && host_jar_path().is_some() {
        "dex2jar-host".into()
    } else {
        "unavailable".into()
    }
}

#[cfg(not(target_os = "android"))]
fn which_java() -> Option<String> {
    Command::new("java")
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .ok()
        .filter(|s| s.success())
        .map(|_| "java".to_string())
}

#[cfg(not(target_os = "android"))]
fn host_jar_path() -> Option<std::path::PathBuf> {
    let mut candidates = vec![
        std::path::PathBuf::from("tools/tv-jar-host/build/libs/tv-jar-host.jar"),
        std::path::PathBuf::from("../tools/tv-jar-host/build/libs/tv-jar-host.jar"),
        std::path::PathBuf::from("../../tools/tv-jar-host/build/libs/tv-jar-host.jar"),
        std::path::PathBuf::from("tv-jar-host.jar"),
    ];
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("tv-jar-host.jar"));
            candidates.push(dir.join("tools/tv-jar-host/build/libs/tv-jar-host.jar"));
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("tools/tv-jar-host/build/libs/tv-jar-host.jar"));
        candidates.push(cwd.join("../tools/tv-jar-host/build/libs/tv-jar-host.jar"));
    }
    candidates.into_iter().find(|p| p.exists())
}

#[cfg(not(target_os = "android"))]
fn dex2jar_home() -> Option<std::path::PathBuf> {
    let mut candidates: Vec<std::path::PathBuf> = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("dex2jar"));
        }
    }
    if let Some(host) = host_jar_path() {
        if let Some(dir) = host.parent() {
            candidates.push(dir.join("dex2jar"));
            let mut walk = dir.to_path_buf();
            for _ in 0..8 {
                candidates.push(walk.join("dex2jar"));
                candidates.push(walk.join("tools").join("dex2jar"));
                if !walk.pop() {
                    break;
                }
            }
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("dex2jar"));
        candidates.push(cwd.join("tools").join("dex2jar"));
        candidates.push(cwd.join("..").join("tools").join("dex2jar"));
    }
    candidates
        .into_iter()
        .find_map(|p| resolve_dex2jar_home_dir(&p))
}

/// 返回真正含 bat/lib 的目录（兼容 zip 多一层）
#[cfg(not(target_os = "android"))]
fn resolve_dex2jar_home_dir(p: &std::path::Path) -> Option<std::path::PathBuf> {
    if !p.is_dir() {
        return None;
    }
    if has_dex2jar_markers(p) {
        return Some(p.to_path_buf());
    }
    if let Ok(rd) = std::fs::read_dir(p) {
        for e in rd.flatten() {
            let child = e.path();
            if child.is_dir() && has_dex2jar_markers(&child) {
                return Some(child);
            }
        }
    }
    None
}

#[cfg(not(target_os = "android"))]
fn has_dex2jar_markers(p: &std::path::Path) -> bool {
    if p.join("d2j-dex2jar.bat").is_file() || p.join("d2j-dex2jar.sh").is_file() {
        return true;
    }
    let lib = p.join("lib");
    if !lib.is_dir() {
        return false;
    }
    std::fs::read_dir(&lib)
        .ok()
        .map(|rd| {
            rd.flatten().any(|e| {
                e.path()
                    .extension()
                    .and_then(|x| x.to_str())
                    .map(|x| x.eq_ignore_ascii_case("jar"))
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false)
}

#[cfg(not(target_os = "android"))]
fn tv_jar_cache_dir() -> Result<std::path::PathBuf, String> {
    crate::media_paths::resolve_video_cache_dir()
}

#[cfg(not(target_os = "android"))]
fn host_lib_dirs(host_jar: &std::path::Path) -> Vec<std::path::PathBuf> {
    let mut dirs = Vec::new();
    if let Some(dir) = host_jar.parent() {
        dirs.push(dir.join("lib"));
        let mut walk = dir.to_path_buf();
        for _ in 0..8 {
            dirs.push(walk.join("lib"));
            dirs.push(walk.join("tools").join("tv-jar-host").join("lib"));
            // build/libs → ../../lib
            dirs.push(walk.join("..").join("..").join("lib"));
            if !walk.pop() {
                break;
            }
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        dirs.push(cwd.join("tools").join("tv-jar-host").join("lib"));
        dirs.push(cwd.join("lib"));
    }
    dirs
}

/// java -jar 不会带上同级 lib；Spider.safeDns 等需要 okhttp，必须用 -cp
#[cfg(not(target_os = "android"))]
fn host_classpath(host_jar: &std::path::Path) -> Result<String, String> {
    let mut entries: Vec<String> = Vec::new();
    let host = host_jar
        .to_str()
        .ok_or_else(|| "tv-jar-host.jar 路径含非法 UTF-8".to_string())?
        .to_string();
    entries.push(host);
    let mut seen = std::collections::HashSet::new();
    for dir in host_lib_dirs(host_jar) {
        if !dir.is_dir() {
            continue;
        }
        let key = dir
            .canonicalize()
            .unwrap_or_else(|_| dir.clone())
            .display()
            .to_string();
        if !seen.insert(key) {
            continue;
        }
        let Ok(rd) = std::fs::read_dir(&dir) else {
            continue;
        };
        for e in rd.flatten() {
            let p = e.path();
            if p.extension()
                .and_then(|x| x.to_str())
                .map(|x| x.eq_ignore_ascii_case("jar"))
                .unwrap_or(false)
            {
                if let Some(s) = p.to_str() {
                    entries.push(s.to_string());
                }
            }
        }
    }
    let sep = if cfg!(windows) { ";" } else { ":" };
    Ok(entries.join(sep))
}

#[cfg(not(target_os = "android"))]
fn ensure_host() -> Result<u16, String> {
    {
        let g = state().lock().map_err(|e| e.to_string())?;
        if let Some(s) = g.as_ref() {
            return Ok(s.port);
        }
    }
    let jar = host_jar_path().ok_or_else(|| {
        "未找到 tv-jar-host.jar（请构建 tools/tv-jar-host）".to_string()
    })?;
    let port: u16 = 19880;
    let cache = tv_jar_cache_dir()?;
    let cp = host_classpath(&jar)?;
    let mut cmd = Command::new("java");
    // dex2jar 产物常缺 StackMap；-cp 载入 host + lib（okhttp/gson/json）
    cmd.args([
        "-noverify",
        "-cp",
        &cp,
        "com.reader.tvjarhost.Main",
        "--port",
        &port.to_string(),
        "--cache",
        cache
            .to_str()
            .ok_or_else(|| "tv-jar-cache 路径含非法 UTF-8".to_string())?,
    ]);
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    cmd.env("READER_TV_JAR_CACHE", &cache);
    // 对齐 FongMi：com.github.catvod.Proxy 默认 port=-1，必须注入真实 HTTP proxy 端口
    if let Ok(http_port) = crate::tv_proxy::ensure_started() {
        cmd.env("READER_TV_PROXY_PORT", http_port.to_string());
        eprintln!("[tv-jar-host] READER_TV_PROXY_PORT={http_port}");
    } else {
        eprintln!("[tv-jar-host] tv_proxy not started; Proxy.getPort() may stay -1");
    }
    if let Some(home) = dex2jar_home() {
        cmd.env("READER_DEX2JAR_HOME", &home);
        eprintln!("[tv-jar-host] READER_DEX2JAR_HOME={}", home.display());
    } else {
        eprintln!("[tv-jar-host] dex2jar not found; run tools/tv-jar-host/fetch-dex2jar.ps1");
    }
    eprintln!(
        "[tv-jar-host] spawn java -noverify -cp <host+lib> com.reader.tvjarhost.Main --port {} --cache {}",
        port,
        cache.display()
    );
    eprintln!("[tv-jar-host] classpath entries={}", cp.split(if cfg!(windows) { ';' } else { ':' }).count());
    let child = cmd
        .spawn()
        .map_err(|e| format!("启动 tv-jar-host 失败: {e}"))?;

    for _ in 0..40 {
        if TcpStream::connect_timeout(
            &format!("127.0.0.1:{port}").parse().unwrap(),
            Duration::from_millis(200),
        )
        .is_ok()
        {
            break;
        }
        std::thread::sleep(Duration::from_millis(100));
    }

    let mut g = state().lock().map_err(|e| e.to_string())?;
    *g = Some(JarHostState {
        child: Some(child),
        port,
    });
    Ok(port)
}

#[cfg(not(target_os = "android"))]
pub fn rpc_call(port: u16, method: &str, params: serde_json::Value) -> Result<String, String> {
    let mut stream = TcpStream::connect_timeout(
        &format!("127.0.0.1:{port}").parse().unwrap(),
        Duration::from_secs(3),
    )
    .map_err(|e| format!("连接 jar-host 失败: {e}"))?;
    let _ = stream.set_read_timeout(Some(Duration::from_secs(120)));
    let req = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params,
    });
    let line = format!("{}\n", req);
    stream
        .write_all(line.as_bytes())
        .map_err(|e| e.to_string())?;
    let mut reader = BufReader::new(stream);
    let mut resp = String::new();
    reader.read_line(&mut resp).map_err(|e| e.to_string())?;
    let v: serde_json::Value =
        serde_json::from_str(&resp).map_err(|e| format!("jar-host 响应无效: {e}"))?;
    if let Some(err) = v.get("error") {
        return Err(err.to_string());
    }
    Ok(v
        .get("result")
        .map(|r| {
            if r.is_string() {
                r.as_str().unwrap_or("").to_string()
            } else {
                r.to_string()
            }
        })
        .unwrap_or_default())
}

#[cfg(not(target_os = "android"))]
pub fn jar_proxy(params: serde_json::Value) -> Result<String, String> {
    let port = ensure_host()?;
    rpc_call(port, "proxy", params)
}

#[tauri::command]
pub fn tv_jar_engine_kind(app: AppHandle) -> String {
    engine_kind_inner(&app)
}

#[tauri::command]
pub async fn tv_jar_invoke(
    app: AppHandle,
    site_key: String,
    api: String,
    ext: String,
    jar: String,
    method: String,
    args_json: String,
) -> Result<String, String> {
    #[cfg(target_os = "android")]
    {
        if !jar.trim().is_empty() {
            crate::platform::android::jar_download::prewarm_android_jar_cache(&app, &jar).await?;
        }
        crate::platform::android::tv_spider::invoke_call_spider(
            &app, site_key, api, ext, jar, method, args_json,
        )
    }

    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        let port = ensure_host()?;
        let args: serde_json::Value =
            serde_json::from_str(&args_json).unwrap_or(serde_json::json!([]));
        rpc_call(
            port,
            "callSpider",
            serde_json::json!({
                "siteKey": site_key,
                "api": api,
                "ext": ext,
                "jar": jar,
                "method": method,
                "args": args,
            }),
        )
    }
}

#[tauri::command]
pub async fn tv_jar_json_ext(
    app: AppHandle,
    parse_type: i32,
    name: String,
    url: String,
    flag: String,
) -> Result<String, String> {
    #[cfg(target_os = "android")]
    {
        crate::platform::android::tv_spider::invoke_json_ext(&app, parse_type, name, url, flag)
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        let port = ensure_host()?;
        rpc_call(
            port,
            "jsonExt",
            serde_json::json!({
                "parseType": parse_type,
                "name": name,
                "url": url,
                "flag": flag,
            }),
        )
    }
}

#[tauri::command]
pub async fn tv_jar_prefetch(
    app: AppHandle,
    jar: String,
) -> Result<String, String> {
    #[cfg(target_os = "android")]
    {
        if !jar.trim().is_empty() {
            crate::platform::android::jar_download::prewarm_android_jar_cache(&app, &jar).await?;
        }
        // 对齐桌面：下载远程 JAR 到 cacheDir/jar 并预热 DexClassLoader
        crate::platform::android::tv_spider::invoke_prefetch_jar(&app, jar)
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        let port = ensure_host()?;
        rpc_call(
            port,
            "prefetchJar",
            serde_json::json!({ "jar": jar }),
        )
    }
}

#[tauri::command]
pub fn tv_start_jar_host(app: AppHandle) -> Result<String, String> {
    #[cfg(target_os = "android")]
    {
        Ok(engine_kind_inner(&app))
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        let port = ensure_host()?;
        Ok(format!("http://127.0.0.1:{port}"))
    }
}

#[tauri::command]
pub async fn tv_jar_clear_cache(app: AppHandle) -> Result<String, String> {
    #[cfg(target_os = "android")]
    {
        crate::platform::android::tv_spider::invoke_clear_cache(&app)?;
        Ok("cleared".into())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        let port = ensure_host()?;
        rpc_call(port, "clearCache", serde_json::json!({}))
    }
}

#[cfg(not(target_os = "android"))]
fn empty_crash_fence_json() -> String {
    r#"{"newlyAbsorbed":false,"siteKey":"","api":"","jar":"","jarKey":"","phase":"","entries":[]}"#
        .into()
}

#[tauri::command]
pub async fn tv_jar_crash_fence(app: AppHandle) -> Result<String, String> {
    #[cfg(target_os = "android")]
    {
        crate::platform::android::tv_spider::invoke_crash_fence_boot(&app)
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(empty_crash_fence_json())
    }
}

#[tauri::command]
pub async fn tv_jar_unquarantine(app: AppHandle, jar_key: String) -> Result<String, String> {
    #[cfg(target_os = "android")]
    {
        crate::platform::android::tv_spider::invoke_unquarantine_jar(&app, jar_key)
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, jar_key);
        Ok(empty_crash_fence_json())
    }
}
