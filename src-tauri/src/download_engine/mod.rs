//! 进程内下载引擎：HTTP 多连接 / BT·Magnet 脚手架 / ED2K 解析。
//! 进度事件：`download-engine-progress`。

pub mod archive;
pub mod bt;
pub mod commands;
pub mod ed2k;
pub mod http;

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Instant;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

pub const PROGRESS_EVENT: &str = "download-engine-progress";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ProtocolKind {
    Http,
    Bt,
    Ed2k,
}

impl ProtocolKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Http => "http",
            Self::Bt => "bt",
            Self::Ed2k => "ed2k",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TaskStatus {
    Waiting,
    Running,
    Paused,
    Error,
    Done,
}

impl TaskStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Waiting => "waiting",
            Self::Running => "running",
            Self::Paused => "paused",
            Self::Error => "error",
            Self::Done => "done",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressPayload {
    pub id: String,
    pub percent: f64,
    pub downloaded: u64,
    pub total: u64,
    pub speed: u64,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filepath: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveRequest {
    pub url: String,
    #[serde(default)]
    pub headers: Option<HashMap<String, String>>,
    #[serde(default)]
    pub extra: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveFile {
    pub name: String,
    pub size: u64,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub selected: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveResult {
    pub protocol: String,
    pub url: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub size: Option<u64>,
    #[serde(default)]
    pub hash: Option<String>,
    #[serde(default)]
    pub files: Vec<ResolveFile>,
    #[serde(default)]
    pub resumable: bool,
    #[serde(default)]
    pub meta: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRequest {
    pub url: String,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub connections: Option<u32>,
    #[serde(default)]
    pub headers: Option<HashMap<String, String>>,
    #[serde(default)]
    pub selected_files: Option<Vec<usize>>,
    #[serde(default)]
    pub extra: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskInfo {
    pub id: String,
    pub protocol: String,
    pub url: String,
    pub name: String,
    pub status: String,
    pub downloaded: u64,
    pub total: u64,
    pub speed: u64,
    pub percent: f64,
    #[serde(default)]
    pub filepath: Option<String>,
    #[serde(default)]
    pub error: Option<String>,
    pub connections: u32,
    pub created_at: u64,
    #[serde(default)]
    pub meta: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineStats {
    pub total: usize,
    pub waiting: usize,
    pub running: usize,
    pub paused: usize,
    pub error: usize,
    pub done: usize,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub speed: u64,
}

pub struct TaskControl {
    pub pause: AtomicBool,
    pub cancel: AtomicBool,
}

impl TaskControl {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            pause: AtomicBool::new(false),
            cancel: AtomicBool::new(false),
        })
    }

    pub fn is_paused(&self) -> bool {
        self.pause.load(Ordering::SeqCst)
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancel.load(Ordering::SeqCst)
    }
}

pub struct DownloadTask {
    pub info: TaskInfo,
    pub headers: HashMap<String, String>,
    pub control: Arc<TaskControl>,
    pub speed_window: Mutex<SpeedWindow>,
}

pub struct SpeedWindow {
    pub last_bytes: u64,
    pub last_at: Instant,
    pub speed: u64,
}

impl SpeedWindow {
    pub fn new(downloaded: u64) -> Self {
        Self {
            last_bytes: downloaded,
            last_at: Instant::now(),
            speed: 0,
        }
    }

    pub fn tick(&mut self, downloaded: u64) -> u64 {
        let now = Instant::now();
        let elapsed = now.duration_since(self.last_at).as_secs_f64();
        if elapsed >= 0.2 {
            let delta = downloaded.saturating_sub(self.last_bytes);
            self.speed = (delta as f64 / elapsed) as u64;
            self.last_bytes = downloaded;
            self.last_at = now;
        }
        self.speed
    }
}

fn task_map() -> &'static Mutex<HashMap<String, DownloadTask>> {
    static MAP: OnceLock<Mutex<HashMap<String, DownloadTask>>> = OnceLock::new();
    MAP.get_or_init(|| Mutex::new(HashMap::new()))
}

static TOTAL_DOWNLOADED: AtomicU64 = AtomicU64::new(0);

pub fn detect_protocol(url: &str) -> ProtocolKind {
    let u = url.trim().to_ascii_lowercase();
    if u.starts_with("magnet:") || u.ends_with(".torrent") || u.contains(".torrent?") {
        ProtocolKind::Bt
    } else if u.starts_with("ed2k://") {
        ProtocolKind::Ed2k
    } else {
        ProtocolKind::Http
    }
}

pub fn now_unix_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn calc_percent(downloaded: u64, total: u64) -> f64 {
    if total == 0 {
        0.0
    } else {
        ((downloaded as f64 / total as f64) * 10000.0).round() / 100.0
    }
}

pub fn emit_progress(app: &AppHandle, payload: ProgressPayload) {
    let _ = app.emit(PROGRESS_EVENT, &payload);
}

pub fn with_task<F, R>(id: &str, f: F) -> Result<R, String>
where
    F: FnOnce(&mut DownloadTask) -> R,
{
    let mut map = task_map()
        .lock()
        .map_err(|e| format!("任务锁失败: {e}"))?;
    let task = map
        .get_mut(id)
        .ok_or_else(|| format!("任务不存在: {id}"))?;
    Ok(f(task))
}

pub fn insert_task(task: DownloadTask) -> Result<TaskInfo, String> {
    let info = task.info.clone();
    task_map()
        .lock()
        .map_err(|e| format!("任务锁失败: {e}"))?
        .insert(info.id.clone(), task);
    Ok(info)
}

pub fn remove_task(id: &str) -> Result<Option<DownloadTask>, String> {
    Ok(task_map()
        .lock()
        .map_err(|e| format!("任务锁失败: {e}"))?
        .remove(id))
}

pub fn list_tasks() -> Result<Vec<TaskInfo>, String> {
    let map = task_map()
        .lock()
        .map_err(|e| format!("任务锁失败: {e}"))?;
    let mut list: Vec<TaskInfo> = map.values().map(|t| t.info.clone()).collect();
    list.sort_by_key(|t| t.created_at);
    Ok(list)
}

pub fn engine_stats() -> Result<EngineStats, String> {
    let map = task_map()
        .lock()
        .map_err(|e| format!("任务锁失败: {e}"))?;
    let mut stats = EngineStats {
        total: map.len(),
        waiting: 0,
        running: 0,
        paused: 0,
        error: 0,
        done: 0,
        downloaded_bytes: 0,
        total_bytes: 0,
        speed: 0,
    };
    for t in map.values() {
        stats.downloaded_bytes += t.info.downloaded;
        stats.total_bytes += t.info.total;
        stats.speed += t.info.speed;
        match t.info.status.as_str() {
            "waiting" => stats.waiting += 1,
            "running" => stats.running += 1,
            "paused" => stats.paused += 1,
            "error" => stats.error += 1,
            "done" => stats.done += 1,
            _ => {}
        }
    }
    let _ = TOTAL_DOWNLOADED.load(Ordering::Relaxed);
    Ok(stats)
}

pub fn update_task_progress(
    app: &AppHandle,
    id: &str,
    downloaded: u64,
    total: u64,
    status: TaskStatus,
    error: Option<String>,
    filepath: Option<String>,
) {
    let payload = {
        let Ok(mut map) = task_map().lock() else {
            return;
        };
        let Some(task) = map.get_mut(id) else {
            return;
        };
        let speed = task
            .speed_window
            .lock()
            .map(|mut w| w.tick(downloaded))
            .unwrap_or(0);
        task.info.downloaded = downloaded;
        if total > 0 {
            task.info.total = total;
        }
        task.info.speed = speed;
        task.info.percent = calc_percent(downloaded, task.info.total);
        task.info.status = status.as_str().to_string();
        if let Some(e) = error.clone() {
            task.info.error = Some(e);
        } else if status != TaskStatus::Error {
            task.info.error = None;
        }
        if let Some(fp) = filepath.clone() {
            task.info.filepath = Some(fp);
        }
        ProgressPayload {
            id: id.to_string(),
            percent: task.info.percent,
            downloaded,
            total: task.info.total,
            speed,
            status: task.info.status.clone(),
            error,
            filepath: task.info.filepath.clone(),
        }
    };
    emit_progress(app, payload);
}

pub fn set_task_status(id: &str, status: TaskStatus, error: Option<String>) -> Result<(), String> {
    with_task(id, |task| {
        task.info.status = status.as_str().to_string();
        if let Some(e) = error {
            task.info.error = Some(e);
        } else if status != TaskStatus::Error {
            task.info.error = None;
        }
        if status == TaskStatus::Paused {
            task.control.pause.store(true, Ordering::SeqCst);
        }
        if status == TaskStatus::Running {
            task.control.pause.store(false, Ordering::SeqCst);
        }
    })
}

pub fn filename_from_url(url: &str) -> String {
    let trimmed = url.trim();
    if let Ok(parsed) = url::Url::parse(trimmed) {
        let seg = parsed
            .path_segments()
            .and_then(|mut s| s.next_back())
            .unwrap_or("");
        let decoded = urlencoding::decode(seg)
            .map(|c| c.into_owned())
            .unwrap_or_else(|_| seg.to_string());
        if !decoded.is_empty() && decoded != "/" {
            return decoded;
        }
    }
    format!("download-{}", now_unix_ms())
}

pub fn sanitize_filename(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.');
    if trimmed.is_empty() {
        format!("download-{}", now_unix_ms())
    } else {
        trimmed.to_string()
    }
}

pub fn resolve_dest_path(dir_or_file: Option<&str>, name: &str) -> Result<std::path::PathBuf, String> {
    let name = sanitize_filename(name);
    match dir_or_file.map(str::trim).filter(|s| !s.is_empty()) {
        Some(p) => {
            let path = std::path::PathBuf::from(p);
            if path.extension().is_some() && !path.exists() {
                if let Some(parent) = path.parent() {
                    if !parent.as_os_str().is_empty() {
                        std::fs::create_dir_all(parent)
                            .map_err(|e| format!("创建目录失败: {e}"))?;
                    }
                }
                Ok(path)
            } else if path.is_dir() || p.ends_with('/') || p.ends_with('\\') {
                std::fs::create_dir_all(&path).map_err(|e| format!("创建目录失败: {e}"))?;
                Ok(path.join(name))
            } else if path.exists() && path.is_file() {
                Ok(path)
            } else {
                if let Some(parent) = path.parent() {
                    if !parent.as_os_str().is_empty() {
                        std::fs::create_dir_all(parent)
                            .map_err(|e| format!("创建目录失败: {e}"))?;
                    }
                }
                if path.file_name().is_some() && path.extension().is_some() {
                    Ok(path)
                } else {
                    std::fs::create_dir_all(&path).map_err(|e| format!("创建目录失败: {e}"))?;
                    Ok(path.join(name))
                }
            }
        }
        None => {
            let dir = std::env::temp_dir().join("reader-downloads");
            std::fs::create_dir_all(&dir).map_err(|e| format!("创建目录失败: {e}"))?;
            Ok(dir.join(name))
        }
    }
}

pub fn build_http_client(
    headers: &HashMap<String, String>,
    timeout_ms: u64,
) -> Result<crate::http_client::Client, String> {
    build_http_client_with_opts(headers, timeout_ms, &HttpClientOpts::default())
}

#[derive(Debug, Clone, Default)]
pub struct HttpClientOpts {
    pub skip_verify_cert: bool,
    pub proxy_mode: String,
    pub proxy_url: String,
    pub default_user_agent: String,
    /// HTTP 方法（默认 GET）；对齐 Gopeed ReqExtra.Method
    pub method: String,
    /// 请求体（POST/PUT 等）
    pub body: Option<String>,
}

impl HttpClientOpts {
    pub fn from_extra(extra: &Option<serde_json::Value>) -> Self {
        let mut opts = Self::default();
        let Some(v) = extra else { return opts };
        if let Some(b) = v.get("skipVerifyCert").and_then(|x| x.as_bool()) {
            opts.skip_verify_cert = b;
        }
        if let Some(s) = v.get("proxyMode").and_then(|x| x.as_str()) {
            opts.proxy_mode = s.to_string();
        }
        if let Some(s) = v.get("proxyUrl").and_then(|x| x.as_str()) {
            opts.proxy_url = s.to_string();
        }
        if let Some(s) = v.get("userAgent").and_then(|x| x.as_str()) {
            opts.default_user_agent = s.to_string();
        }
        if let Some(s) = v
            .get("method")
            .or_else(|| v.get("Method"))
            .and_then(|x| x.as_str())
        {
            opts.method = s.to_string();
        }
        if let Some(s) = v
            .get("body")
            .or_else(|| v.get("Body"))
            .and_then(|x| {
                if x.is_null() {
                    None
                } else if let Some(t) = x.as_str() {
                    Some(t.to_string())
                } else {
                    Some(x.to_string())
                }
            })
        {
            opts.body = Some(s);
        }
        opts
    }
}

pub fn build_http_client_with_opts(
    headers: &HashMap<String, String>,
    timeout_ms: u64,
    opts: &HttpClientOpts,
) -> Result<crate::http_client::Client, String> {
    use crate::http_client::{self, ClientOpts};

    let has_ua = headers
        .keys()
        .any(|k| k.eq_ignore_ascii_case("user-agent"));
    let mut client_opts = ClientOpts {
        timeout: std::time::Duration::from_millis(timeout_ms.max(1)),
        connect_timeout: Some(std::time::Duration::from_secs(30)),
        accept_invalid_certs: opts.skip_verify_cert,
        proxy_mode: opts.proxy_mode.clone(),
        proxy_url: opts.proxy_url.clone(),
        ..ClientOpts::default()
    };
    if !has_ua {
        let ua = if opts.default_user_agent.trim().is_empty() {
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
                .to_string()
        } else {
            opts.default_user_agent.trim().to_string()
        };
        client_opts.user_agent = Some(ua);
    }
    http_client::build_client(&client_opts)
}
