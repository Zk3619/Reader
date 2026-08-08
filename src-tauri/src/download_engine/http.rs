//! HTTP/HTTPS 多连接 Range 下载：流式写盘、.part 续传、进度事件。

use std::collections::HashMap;
use std::io::SeekFrom;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;

use futures_util::StreamExt;
use tauri::AppHandle;
use tokio::io::{AsyncSeekExt, AsyncWriteExt};

use super::{
    filename_from_url, sanitize_filename, update_task_progress, ResolveFile, ResolveResult,
    TaskControl, TaskStatus,
};

const DEFAULT_CONNECTIONS: u32 = 16;
const PROGRESS_INTERVAL_MS: u64 = 250;

#[derive(Clone)]
pub struct HttpProbe {
    pub url: String,
    pub name: String,
    pub size: Option<u64>,
    pub resumable: bool,
    pub content_type: Option<String>,
    /// 实际探测成功时使用的请求头（可能含自动补全的 Referer）
    pub request_headers: HashMap<String, String>,
}

/// 明显是网页/脚本入口的后缀：不按「直链文件」做防盗链重试
const WEB_PAGE_EXT: &[&str] = &[
    "html", "htm", "shtml", "xhtml", "mhtml", "php", "asp", "aspx", "jsp", "jspx", "cgi", "cfm",
    "do", "action", "htmx", "cshtml", "vbhtml",
];

/// 复合后缀（取最后一段会丢信息）
const COMPOUND_FILE_EXT: &[&str] = &[
    ".tar.gz", ".tar.bz2", ".tar.xz", ".tar.zst", ".tar.lz", ".tar.lzma", ".tar.z", ".user.js",
];

fn parse_content_disposition_filename(value: &str) -> Option<String> {
    // filename*=UTF-8''... 优先
    for part in value.split(';') {
        let part = part.trim();
        let lower = part.to_ascii_lowercase();
        if let Some(rest) = lower.strip_prefix("filename*=") {
            let _ = rest;
            if let Some(eq) = part.find('=') {
                let raw = part[eq + 1..].trim().trim_matches('"');
                if let Some(idx) = raw.find("''") {
                    let encoded = &raw[idx + 2..];
                    if let Ok(decoded) = urlencoding::decode(encoded) {
                        let s = decoded.into_owned();
                        if !s.is_empty() {
                            return Some(s);
                        }
                    }
                }
            }
        }
    }
    for part in value.split(';') {
        let part = part.trim();
        if part.to_ascii_lowercase().starts_with("filename=") {
            if let Some(eq) = part.find('=') {
                let raw = part[eq + 1..].trim().trim_matches('"');
                if !raw.is_empty() {
                    return Some(raw.to_string());
                }
            }
        }
    }
    None
}

fn header_get_ci<'a>(headers: &'a HashMap<String, String>, name: &str) -> Option<&'a str> {
    headers
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case(name))
        .map(|(_, v)| v.as_str())
}

fn header_has_ci(headers: &HashMap<String, String>, name: &str) -> bool {
    header_get_ci(headers, name).is_some()
}

fn content_type_is_html(content_type: Option<&str>) -> bool {
    content_type
        .map(|s| {
            let lower = s.to_ascii_lowercase();
            lower.contains("text/html") || lower.contains("application/xhtml")
        })
        .unwrap_or(false)
}

fn file_base_name(name: &str) -> &str {
    let base = name.rsplit('/').next().unwrap_or(name);
    let base = base.rsplit('\\').next().unwrap_or(base);
    let base = base.split('?').next().unwrap_or(base);
    base.split('#').next().unwrap_or(base)
}

fn file_ext_of(name: &str) -> Option<String> {
    let base = file_base_name(name);
    let ext = base.rsplit('.').next()?;
    if ext.is_empty() || ext.len() > 16 || ext.eq_ignore_ascii_case(base) {
        return None;
    }
    if !ext.chars().all(|c| c.is_ascii_alphanumeric()) {
        return None;
    }
    Some(ext.to_ascii_lowercase())
}

fn looks_like_direct_file_name(name: &str) -> bool {
    let base = file_base_name(name);
    if base.is_empty() || base == "/" {
        return false;
    }
    let lower = base.to_ascii_lowercase();
    if COMPOUND_FILE_EXT.iter().any(|suffix| lower.ends_with(suffix)) {
        return true;
    }
    match file_ext_of(base) {
        // 有常见文件后缀且不是网页入口 → 视为直链文件
        Some(ext) => !WEB_PAGE_EXT.iter().any(|e| *e == ext.as_str()),
        None => false,
    }
}

fn looks_like_direct_file_url(url: &str) -> bool {
    looks_like_direct_file_name(&filename_from_url(url))
}

/// 防盗链常见 Referer 候选：自身 / origin / 去左标签父域 / www.父域
fn referer_candidates(url: &str) -> Vec<String> {
    let Ok(parsed) = url::Url::parse(url) else {
        return Vec::new();
    };
    let Some(host) = parsed.host_str() else {
        return Vec::new();
    };
    let scheme = parsed.scheme();
    let mut out = Vec::new();
    let push_unique = |acc: &mut Vec<String>, value: String| {
        if !value.is_empty() && !acc.iter().any(|x| x == &value) {
            acc.push(value);
        }
    };

    push_unique(&mut out, url.to_string());
    push_unique(&mut out, format!("{scheme}://{host}/"));

    let labels: Vec<&str> = host.split('.').filter(|s| !s.is_empty()).collect();
    if labels.len() >= 3 {
        let parent = labels[1..].join(".");
        push_unique(&mut out, format!("{scheme}://{parent}/"));
        push_unique(&mut out, format!("{scheme}://www.{parent}/"));
    }

    out
}

fn probe_looks_hotlink_blocked(original_url: &str, probe: &HttpProbe) -> bool {
    if !looks_like_direct_file_url(original_url) {
        return false;
    }
    if content_type_is_html(probe.content_type.as_deref()) {
        return true;
    }
    let orig_name = filename_from_url(original_url);
    if !looks_like_direct_file_name(&orig_name) {
        return false;
    }
    // 跟随重定向后落到无扩展名/非文件路径，且体积偏小：多为落地页
    let final_name = filename_from_url(&probe.url);
    if probe.url != original_url
        && !final_name.eq_ignore_ascii_case(&orig_name)
        && !looks_like_direct_file_name(&final_name)
    {
        return probe.size.map(|s| s < 2 * 1024 * 1024).unwrap_or(true);
    }
    false
}

fn normalize_probe_name(original_url: &str, name_hint: Option<String>, final_url: &str) -> String {
    if let Some(n) = name_hint {
        let cleaned = sanitize_filename(&n);
        if looks_like_direct_file_name(&cleaned) || !looks_like_direct_file_url(original_url) {
            return cleaned;
        }
    }
    let from_original = sanitize_filename(&filename_from_url(original_url));
    if looks_like_direct_file_name(&from_original) {
        return from_original;
    }
    sanitize_filename(&filename_from_url(final_url))
}

pub async fn resolve_http(
    url: &str,
    headers: &HashMap<String, String>,
) -> Result<ResolveResult, String> {
    let probe = probe_http(url, headers, &super::HttpClientOpts::default()).await?;
    let auto_referer = header_get_ci(&probe.request_headers, "referer")
        .filter(|v| header_get_ci(headers, "referer") != Some(*v))
        .map(|s| s.to_string());
    Ok(ResolveResult {
        protocol: "http".into(),
        url: probe.url.clone(),
        name: Some(probe.name.clone()),
        size: probe.size,
        hash: None,
        files: vec![ResolveFile {
            name: probe.name.clone(),
            size: probe.size.unwrap_or(0),
            path: Some(probe.name.clone()),
            selected: Some(true),
        }],
        resumable: probe.resumable,
        meta: serde_json::json!({
            "contentType": probe.content_type,
            "finalUrl": probe.url,
            "autoReferer": auto_referer,
        }),
    })
}

pub async fn probe_http(
    url: &str,
    headers: &HashMap<String, String>,
    client_opts: &super::HttpClientOpts,
) -> Result<HttpProbe, String> {
    let mut attempts: Vec<HashMap<String, String>> = vec![headers.clone()];
    if !header_has_ci(headers, "referer") && looks_like_direct_file_url(url) {
        for referer in referer_candidates(url) {
            let mut next = headers.clone();
            next.insert("Referer".into(), referer);
            attempts.push(next);
        }
    }

    let mut last_err: Option<String> = None;
    let mut last_blocked: Option<HttpProbe> = None;

    for attempt_headers in attempts {
        match probe_http_once(url, &attempt_headers, client_opts).await {
            Ok(mut probe) => {
                if probe_looks_hotlink_blocked(url, &probe) {
                    last_blocked = Some(probe);
                    continue;
                }
                // 直链名优先保留原始 URL 文件名，避免重定向落地页改名
                if looks_like_direct_file_url(url) && !looks_like_direct_file_name(&probe.name) {
                    probe.name = sanitize_filename(&filename_from_url(url));
                }
                probe.request_headers = attempt_headers;
                return Ok(probe);
            }
            Err(e) => last_err = Some(e),
        }
    }

    if looks_like_direct_file_url(url) {
        return Err(
            "直链疑似被防盗链拦截（返回了网页而非文件）。请在请求头中设置正确的 Referer 后重试。"
                .into(),
        );
    }
    if let Some(err) = last_err {
        return Err(err);
    }
    if let Some(mut probe) = last_blocked {
        probe.request_headers = headers.clone();
        return Ok(probe);
    }
    Err("探测失败".into())
}

async fn probe_http_once(
    url: &str,
    headers: &HashMap<String, String>,
    client_opts: &super::HttpClientOpts,
) -> Result<HttpProbe, String> {
    let client = super::build_http_client_with_opts(headers, 60_000, client_opts)?;
    let mut req = client.head(url);
    for (k, v) in headers {
        req = req.header(k, v);
    }
    let head = req.send().await;

    let (final_url, size, resumable, name_hint, content_type) = match head {
        Ok(resp) if resp.status().is_success() || resp.status().as_u16() == 405 => {
            let final_url = crate::http_client::response_final_url(&resp);
            let size = resp
                .headers()
                .get(crate::http_client::header::CONTENT_LENGTH)
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse::<u64>().ok());
            let accept = resp
                .headers()
                .get(crate::http_client::header::ACCEPT_RANGES)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_ascii_lowercase().contains("bytes"))
                .unwrap_or(false);
            let name = resp
                .headers()
                .get(crate::http_client::header::CONTENT_DISPOSITION)
                .and_then(|v| v.to_str().ok())
                .and_then(parse_content_disposition_filename);
            let ct = resp
                .headers()
                .get(crate::http_client::header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string());
            // 部分站点 HEAD 无 Accept-Ranges，再用 Range 探测
            let resumable = if accept {
                true
            } else {
                probe_range_support(&client, &final_url, headers).await
            };
            (final_url, size, resumable, name, ct)
        }
        _ => {
            // HEAD 失败：用 Range GET 探测
            let mut req = client.get(url).header(crate::http_client::header::RANGE, "bytes=0-0");
            for (k, v) in headers {
                req = req.header(k, v);
            }
            let resp = req
                .send()
                .await
                .map_err(|e| format!("探测失败: {e}"))?;
            let final_url = crate::http_client::response_final_url(&resp);
            let status = resp.status().as_u16();
            let ct = resp
                .headers()
                .get(crate::http_client::header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string());
            let name = resp
                .headers()
                .get(crate::http_client::header::CONTENT_DISPOSITION)
                .and_then(|v| v.to_str().ok())
                .and_then(parse_content_disposition_filename);
            let (size, resumable) = if status == 206 {
                let total = resp
                    .headers()
                    .get(crate::http_client::header::CONTENT_RANGE)
                    .and_then(|v| v.to_str().ok())
                    .and_then(parse_content_range_total);
                (total, true)
            } else {
                let size = resp
                    .headers()
                    .get(crate::http_client::header::CONTENT_LENGTH)
                    .and_then(|v| v.to_str().ok())
                    .and_then(|s| s.parse::<u64>().ok());
                (size, false)
            };
            let _ = resp.bytes().await;
            (final_url, size, resumable, name, ct)
        }
    };

    let name = normalize_probe_name(url, name_hint, &final_url);

    Ok(HttpProbe {
        url: final_url,
        name,
        size,
        resumable,
        content_type,
        request_headers: headers.clone(),
    })
}

async fn probe_range_support(
    client: &crate::http_client::Client,
    url: &str,
    headers: &HashMap<String, String>,
) -> bool {
    let mut req = client.get(url).header(crate::http_client::header::RANGE, "bytes=0-0");
    for (k, v) in headers {
        req = req.header(k, v);
    }
    match req.send().await {
        Ok(resp) => {
            let ok = resp.status().as_u16() == 206;
            let _ = resp.bytes().await;
            ok
        }
        Err(_) => false,
    }
}

fn parse_content_range_total(value: &str) -> Option<u64> {
    // bytes 0-0/12345
    value.split('/').nth(1)?.parse().ok()
}

struct Segment {
    start: u64,
    /// inclusive；work-stealing 时可变
    end: AtomicU64,
    written: AtomicU64,
    /// 粗略字节/秒，供偷工作估算
    speed: AtomicU64,
}

const STEAL_THRESHOLD_SECS: u64 = 5;
const STEAL_MIN_CHUNK: u64 = 256 * 1024;

struct SlowStartController {
    max_connections: usize,
    total_launched: usize,
    batch_pending: usize,
    batch_ready: usize,
    next_batch_size: usize,
}

impl SlowStartController {
    fn new(max_connections: usize) -> Self {
        Self {
            max_connections,
            total_launched: 0,
            batch_pending: 0,
            batch_ready: 0,
            next_batch_size: 1,
        }
    }

    fn get_next_batch_size(&self) -> usize {
        let remaining = self.max_connections.saturating_sub(self.total_launched);
        if remaining == 0 {
            return 0;
        }
        self.next_batch_size.min(remaining)
    }

    fn commit_batch(&mut self, count: usize) {
        self.total_launched += count;
        self.next_batch_size = (self.next_batch_size * 2).max(1);
        self.batch_pending = count;
        self.batch_ready = 0;
    }

    fn on_success(&mut self) -> bool {
        self.batch_ready += 1;
        if self.batch_ready >= self.batch_pending {
            self.batch_pending = 0;
            true
        } else {
            false
        }
    }

    fn on_failed(&mut self) {
        if self.batch_pending > 0 {
            self.batch_pending -= 1;
        }
    }
}

pub async fn run_http_download(
    app: AppHandle,
    task_id: String,
    url: String,
    dest: PathBuf,
    connections: u32,
    headers: HashMap<String, String>,
    control: Arc<TaskControl>,
) {
    run_http_download_with_opts(
        app,
        task_id,
        url,
        dest,
        connections,
        headers,
        control,
        super::HttpClientOpts::default(),
    )
    .await
}

pub async fn run_http_download_with_opts(
    app: AppHandle,
    task_id: String,
    url: String,
    dest: PathBuf,
    connections: u32,
    headers: HashMap<String, String>,
    control: Arc<TaskControl>,
    client_opts: super::HttpClientOpts,
) {
    let result = http_download_inner(
        &app,
        &task_id,
        &url,
        &dest,
        connections.max(1),
        &headers,
        &control,
        &client_opts,
    )
    .await;

    match result {
        Ok(final_path) => {
            let size = std::fs::metadata(&final_path).map(|m| m.len()).unwrap_or(0);
            update_task_progress(
                &app,
                &task_id,
                size,
                size,
                TaskStatus::Done,
                None,
                Some(final_path.to_string_lossy().into_owned()),
            );
        }
        Err(e) => {
            if e == "paused" || control.is_paused() {
                // 进度已在内层更新为 paused
                return;
            }
            let (downloaded, total) = super::with_task(&task_id, |t| (t.info.downloaded, t.info.total))
                .unwrap_or((0, 0));
            if control.is_cancelled() || e == "已取消" {
                update_task_progress(
                    &app,
                    &task_id,
                    downloaded,
                    total,
                    TaskStatus::Error,
                    Some("已取消".into()),
                    None,
                );
            } else {
                update_task_progress(
                    &app,
                    &task_id,
                    downloaded,
                    total,
                    TaskStatus::Error,
                    Some(e),
                    None,
                );
            }
        }
    }
}

fn part_path(dest: &Path) -> PathBuf {
    let mut p = dest.as_os_str().to_os_string();
    p.push(".part");
    PathBuf::from(p)
}

async fn http_download_inner(
    app: &AppHandle,
    task_id: &str,
    url: &str,
    dest: &Path,
    connections: u32,
    headers: &HashMap<String, String>,
    control: &Arc<TaskControl>,
    client_opts: &super::HttpClientOpts,
) -> Result<PathBuf, String> {
    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("创建目录失败: {e}"))?;
    }

    let probe = probe_http(url, headers, client_opts).await?;
    let headers = &probe.request_headers;
    let total = probe.size.unwrap_or(0);
    let part = part_path(dest);
    let client = build_long_client(headers, client_opts)?;
    // BitChute 等：即使调用方传了多连接，也强制单流，避免分片 Range 404/416
    let connections = if disable_http_byte_resume(&probe.url) {
        1
    } else {
        connections
    };

    update_task_progress(
        app,
        task_id,
        0,
        total,
        TaskStatus::Running,
        None,
        Some(part.to_string_lossy().into_owned()),
    );

    if total == 0 || !probe.resumable || connections <= 1 || !is_get_method(client_opts) {
        single_stream_download(
            app,
            task_id,
            &probe.url,
            &part,
            dest,
            headers,
            &client,
            control,
            total,
            client_opts,
        )
        .await?;
        return Ok(dest.to_path_buf());
    }

    // 续传子集：已有非空 .part 时强制单连接 Range，避免多分片从 0 重下
    if let Ok(meta) = tokio::fs::metadata(&part).await {
        if meta.is_file() && meta.len() > 0 {
            single_stream_download(
                app,
                task_id,
                &probe.url,
                &part,
                dest,
                headers,
                &client,
                control,
                total,
                client_opts,
            )
            .await?;
            return Ok(dest.to_path_buf());
        }
    }

    // 预分配 .part
    {
        let file = tokio::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .read(true)
            .open(&part)
            .await
            .map_err(|e| format!("打开 .part 失败: {e}"))?;
        file.set_len(total)
            .await
            .map_err(|e| format!("预分配失败: {e}"))?;
    }

    let conn = connections.min(64).max(1) as usize;
    let chunk = (total + conn as u64 - 1) / conn as u64;
    let segments: Vec<Arc<Segment>> = (0..conn)
        .filter_map(|i| {
            let start = i as u64 * chunk;
            if start >= total {
                return None;
            }
            let end = (start + chunk - 1).min(total - 1);
            Some(Arc::new(Segment {
                start,
                end: AtomicU64::new(end),
                written: AtomicU64::new(0),
                speed: AtomicU64::new(0),
            }))
        })
        .collect();

    let downloaded = Arc::new(AtomicU64::new(0));
    let err_flag = Arc::new(AtomicBool::new(false));
    let first_err: Arc<std::sync::Mutex<Option<String>>> =
        Arc::new(std::sync::Mutex::new(None));

    // 进度汇报任务
    let progress_stop = Arc::new(AtomicBool::new(false));
    let progress_task = {
        let app = app.clone();
        let task_id = task_id.to_string();
        let downloaded = downloaded.clone();
        let progress_stop = progress_stop.clone();
        let part_s = part.to_string_lossy().into_owned();
        let control = Arc::clone(control);
        tokio::spawn(async move {
            while !progress_stop.load(Ordering::SeqCst) {
                if control.is_cancelled() || control.is_paused() {
                    break;
                }
                let d = downloaded.load(Ordering::SeqCst);
                update_task_progress(
                    &app,
                    &task_id,
                    d,
                    total,
                    TaskStatus::Running,
                    None,
                    Some(part_s.clone()),
                );
                tokio::time::sleep(std::time::Duration::from_millis(PROGRESS_INTERVAL_MS)).await;
            }
        })
    };

    // Slow-start：按 1,2,4… 批次启动段；完成后 work-stealing
    let mut slow = SlowStartController::new(segments.len());
    let mut next_seg_idx = 0usize;
    let mut handles = Vec::new();
    let segments_arc = Arc::new(segments);

    loop {
        if control.is_cancelled() || control.is_paused() || err_flag.load(Ordering::SeqCst) {
            break;
        }
        let batch = slow.get_next_batch_size();
        if batch == 0 && next_seg_idx >= segments_arc.len() {
            break;
        }
        if batch > 0 && next_seg_idx < segments_arc.len() {
            let n = batch.min(segments_arc.len() - next_seg_idx);
            slow.commit_batch(n);
            for _ in 0..n {
                let seg = Arc::clone(&segments_arc[next_seg_idx]);
                next_seg_idx += 1;
                let url = probe.url.clone();
                let part = part.clone();
                let headers = headers.clone();
                let client = client.clone();
                let control = Arc::clone(control);
                let downloaded = downloaded.clone();
                let err_flag = err_flag.clone();
                let first_err = first_err.clone();
                let segs = Arc::clone(&segments_arc);
                handles.push(tokio::spawn(async move {
                    loop {
                        match download_segment(
                            &client, &url, &part, &headers, &seg, &downloaded, &control,
                        )
                        .await
                        {
                            Ok(()) => {
                                // work-stealing：尝试从最慢段偷半段
                                if try_steal_work(&segs, &seg) {
                                    continue;
                                }
                                break;
                            }
                            Err(e) => {
                                err_flag.store(true, Ordering::SeqCst);
                                if let Ok(mut g) = first_err.lock() {
                                    if g.is_none() {
                                        *g = Some(e);
                                    }
                                }
                                break;
                            }
                        }
                    }
                }));
            }
            // 等当前批次至少一个完成再扩（简化：短暂等待后继续扩）
            tokio::time::sleep(std::time::Duration::from_millis(80)).await;
            slow.on_success();
        } else {
            break;
        }
    }

    for h in handles {
        let _ = h.await;
    }
    progress_stop.store(true, Ordering::SeqCst);
    let _ = progress_task.await;

    if control.is_cancelled() {
        let _ = tokio::fs::remove_file(&part).await;
        return Err("已取消".into());
    }
    if control.is_paused() {
        let d = downloaded.load(Ordering::SeqCst);
        update_task_progress(
            app,
            task_id,
            d,
            total,
            TaskStatus::Paused,
            None,
            Some(part.to_string_lossy().into_owned()),
        );
        return Err("paused".into());
    }
    if err_flag.load(Ordering::SeqCst) {
        let msg = first_err
            .lock()
            .ok()
            .and_then(|g| g.clone())
            .unwrap_or_else(|| "分片下载失败".into());
        return Err(msg);
    }

    // 校验写满
    let done = segments_arc
        .iter()
        .map(|s| s.written.load(Ordering::SeqCst))
        .sum::<u64>();
    if done < total {
        let expected: u64 = segments_arc
            .iter()
            .map(|s| {
                let end = s.end.load(Ordering::SeqCst);
                end.saturating_sub(s.start).saturating_add(1)
            })
            .sum();
        if done < expected {
            return Err(format!("下载不完整: {done}/{expected}"));
        }
    }

    if dest.exists() {
        tokio::fs::remove_file(dest)
            .await
            .map_err(|e| format!("覆盖目标失败: {e}"))?;
    }
    tokio::fs::rename(&part, dest)
        .await
        .map_err(|e| format!("重命名失败: {e}"))?;

    update_task_progress(
        app,
        task_id,
        total,
        total,
        TaskStatus::Done,
        None,
        Some(dest.to_string_lossy().into_owned()),
    );

    Ok(dest.to_path_buf())
}

fn build_long_client(
    headers: &HashMap<String, String>,
    opts: &super::HttpClientOpts,
) -> Result<crate::http_client::Client, String> {
    // 长下载：超时更宽松
    super::build_http_client_with_opts(headers, 3_600_000, opts)
}

async fn download_segment(
    client: &crate::http_client::Client,
    url: &str,
    part: &Path,
    headers: &HashMap<String, String>,
    seg: &Segment,
    downloaded: &AtomicU64,
    control: &TaskControl,
) -> Result<(), String> {
    let mut cursor = seg.start + seg.written.load(Ordering::SeqCst);
    let started = std::time::Instant::now();
    let mut bytes_this = 0u64;
    loop {
        let end = seg.end.load(Ordering::SeqCst);
        if cursor > end {
            break;
        }
        if control.is_cancelled() {
            return Err("已取消".into());
        }
        if control.is_paused() {
            return Err("paused".into());
        }

        let range = format!("bytes={}-{}", cursor, end);
        let mut req = client.get(url).header(crate::http_client::header::RANGE, &range);
        for (k, v) in headers {
            req = req.header(k, v);
        }
        let resp = req.send().await.map_err(|e| format!("分片请求失败: {e}"))?;
        let status = resp.status().as_u16();
        if status != 206 && status != 200 {
            return Err(format!("分片状态异常: {status}"));
        }

        let mut file = tokio::fs::OpenOptions::new()
            .write(true)
            .open(part)
            .await
            .map_err(|e| format!("打开 .part 失败: {e}"))?;
        file.seek(SeekFrom::Start(cursor))
            .await
            .map_err(|e| format!("seek 失败: {e}"))?;

        let mut stream = resp.bytes_stream();
        while let Some(chunk) = stream.next().await {
            if control.is_cancelled() {
                return Err("已取消".into());
            }
            if control.is_paused() {
                return Err("paused".into());
            }
            let end_now = seg.end.load(Ordering::SeqCst);
            let chunk = chunk.map_err(|e| format!("读取流失败: {e}"))?;
            let mut data = chunk.as_ref();
            let max_write = end_now.saturating_sub(cursor) + 1;
            if data.len() as u64 > max_write {
                data = &data[..max_write as usize];
            }
            if data.is_empty() {
                break;
            }
            file.write_all(data)
                .await
                .map_err(|e| format!("写盘失败: {e}"))?;
            let n = data.len() as u64;
            cursor += n;
            bytes_this += n;
            seg.written.fetch_add(n, Ordering::SeqCst);
            downloaded.fetch_add(n, Ordering::SeqCst);
            if cursor > end_now {
                break;
            }
        }
        file.flush().await.map_err(|e| format!("flush 失败: {e}"))?;

        let elapsed = started.elapsed().as_secs_f64().max(0.001);
        seg.speed
            .store((bytes_this as f64 / elapsed) as u64, Ordering::SeqCst);

        if cursor > seg.end.load(Ordering::SeqCst) {
            break;
        }
        // 连接中断则续传同一段
    }
    Ok(())
}

/// 从最慢的未完成段偷取一半剩余工作到 helper（已完成的段）。
fn try_steal_work(segments: &[Arc<Segment>], helper: &Arc<Segment>) -> bool {
    let helper_end = helper.end.load(Ordering::SeqCst);
    let helper_done = helper.start + helper.written.load(Ordering::SeqCst) > helper_end;
    if !helper_done {
        return false;
    }

    let mut best: Option<&Arc<Segment>> = None;
    let mut best_remain_secs = 0u64;
    for seg in segments {
        if Arc::ptr_eq(seg, helper) {
            continue;
        }
        let end = seg.end.load(Ordering::SeqCst);
        let written = seg.written.load(Ordering::SeqCst);
        let cursor = seg.start + written;
        if cursor > end {
            continue;
        }
        let remain = end - cursor + 1;
        if remain < STEAL_MIN_CHUNK {
            continue;
        }
        let speed = seg.speed.load(Ordering::SeqCst).max(1);
        let remain_secs = remain / speed;
        if remain_secs > STEAL_THRESHOLD_SECS && remain_secs > best_remain_secs {
            best_remain_secs = remain_secs;
            best = Some(seg);
        }
    }
    let Some(victim) = best else {
        return false;
    };
    let end = victim.end.load(Ordering::SeqCst);
    let written = victim.written.load(Ordering::SeqCst);
    let cursor = victim.start + written;
    if cursor > end {
        return false;
    }
    let remain = end - cursor + 1;
    let steal = remain / 2;
    if steal < STEAL_MIN_CHUNK / 2 {
        return false;
    }
    let new_begin = end - steal + 1;
    // shrink victim
    victim.end.store(new_begin.saturating_sub(1), Ordering::SeqCst);
    // reassign helper to stolen range
    // Segment.start is not atomic — we can't change start safely on shared helper.
    // Spawn semantics: helper already finished; we mutate helper by resetting written and
    // using a trick: store stolen range in end/written relative to original start won't work.
    // Instead: only steal into helper if helper.start can cover — use written reset with
    // adjusting via end only when helper.start <= new_begin.
    if helper.start > new_begin {
        // rollback victim
        victim.end.store(end, Ordering::SeqCst);
        return false;
    }
    // Set helper to download [new_begin, end] by setting written so cursor=new_begin
    helper.written.store(new_begin.saturating_sub(helper.start), Ordering::SeqCst);
    helper.end.store(end, Ordering::SeqCst);
    helper.speed.store(0, Ordering::SeqCst);
    true
}

fn is_get_method(opts: &super::HttpClientOpts) -> bool {
    let m = opts.method.trim().to_ascii_uppercase();
    m.is_empty() || m == "GET"
}

fn build_request(
    client: &crate::http_client::Client,
    url: &str,
    opts: &super::HttpClientOpts,
) -> crate::http_client::RequestBuilder {
    let method = opts.method.trim().to_ascii_uppercase();
    match method.as_str() {
        "POST" => {
            let mut r = client.post(url);
            if let Some(b) = &opts.body {
                r = r.body(b.clone());
            }
            r
        }
        "PUT" => {
            let mut r = client.put(url);
            if let Some(b) = &opts.body {
                r = r.body(b.clone());
            }
            r
        }
        "PATCH" => {
            let mut r = client.patch(url);
            if let Some(b) = &opts.body {
                r = r.body(b.clone());
            }
            r
        }
        "DELETE" => client.delete(url),
        "HEAD" => client.head(url),
        _ => client.get(url),
    }
}

fn is_range_header_name(name: &str) -> bool {
    name.eq_ignore_ascii_case("range")
}

/// BitChute seed CDN 对错位/过期 Range 常回 416，且 seed 轮换后旧 .part 不可续。
fn disable_http_byte_resume(url: &str) -> bool {
    url.to_ascii_lowercase().contains("bitchute.com")
}

async fn single_stream_download(
    app: &AppHandle,
    task_id: &str,
    url: &str,
    part: &Path,
    dest: &Path,
    headers: &HashMap<String, String>,
    client: &crate::http_client::Client,
    control: &Arc<TaskControl>,
    known_total: u64,
    client_opts: &super::HttpClientOpts,
) -> Result<(), String> {
    let no_resume = disable_http_byte_resume(url);
    let mut existing = if part.exists() && is_get_method(client_opts) {
        tokio::fs::metadata(part)
            .await
            .map(|m| m.len())
            .unwrap_or(0)
    } else {
        0
    };

    // 不支持字节续传的 CDN：开下前丢掉残留 .part，避免一上来就 416
    if no_resume && existing > 0 {
        let _ = tokio::fs::remove_file(part).await;
        existing = 0;
    }

    // .part 已达探测大小：直接落成片，避免再发 Range 触发 416
    if existing > 0 && known_total > 0 && existing >= known_total {
        if dest.exists() {
            tokio::fs::remove_file(dest)
                .await
                .map_err(|e| format!("覆盖目标失败: {e}"))?;
        }
        tokio::fs::rename(part, dest)
            .await
            .map_err(|e| format!("重命名失败: {e}"))?;
        update_task_progress(
            app,
            task_id,
            known_total,
            known_total,
            TaskStatus::Done,
            None,
            Some(dest.to_string_lossy().into_owned()),
        );
        return Ok(());
    }

    // 416：丢掉坏 .part / 去掉 Range，最多整文件重试一次
    let mut allow_range = existing > 0 && !no_resume;
    for attempt in 0..2u8 {
        let mut req = build_request(client, url, client_opts);
        for (k, v) in headers {
            // 整文件重试时忽略调用方误带的 Range，避免二次 416
            if !allow_range && is_range_header_name(k) {
                continue;
            }
            req = req.header(k, v);
        }
        if allow_range && existing > 0 {
            req = req.header(
                crate::http_client::header::RANGE,
                format!("bytes={}-", existing),
            );
        }

        let resp = req.send().await.map_err(|e| format!("请求失败: {e}"))?;
        let status = resp.status().as_u16();

        if status == 416 && attempt == 0 {
            // Range Not Satisfiable：丢掉坏 .part，从头拉
            drop(resp);
            let _ = tokio::fs::remove_file(part).await;
            existing = 0;
            allow_range = false;
            continue;
        }

        if !(status == 200 || status == 206) {
            return Err(format!("HTTP 状态异常: {status}"));
        }

        let total = if status == 206 {
            resp.headers()
                .get(crate::http_client::header::CONTENT_RANGE)
                .and_then(|v| v.to_str().ok())
                .and_then(parse_content_range_total)
                .unwrap_or(known_total)
        } else {
            resp.headers()
                .get(crate::http_client::header::CONTENT_LENGTH)
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse().ok())
                .unwrap_or(known_total)
        };

        let mut file = if status == 206 && existing > 0 {
            tokio::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(part)
                .await
                .map_err(|e| format!("打开 .part 失败: {e}"))?
        } else {
            tokio::fs::OpenOptions::new()
                .create(true)
                .write(true)
                .truncate(true)
                .open(part)
                .await
                .map_err(|e| format!("打开 .part 失败: {e}"))?
        };

        let mut downloaded = if status == 206 { existing } else { 0 };
        let mut stream = resp.bytes_stream();
        let mut last_emit = std::time::Instant::now();

        while let Some(chunk) = stream.next().await {
            if control.is_cancelled() {
                drop(file);
                let _ = tokio::fs::remove_file(part).await;
                return Err("已取消".into());
            }
            if control.is_paused() {
                file.flush().await.ok();
                update_task_progress(
                    app,
                    task_id,
                    downloaded,
                    total,
                    TaskStatus::Paused,
                    None,
                    Some(part.to_string_lossy().into_owned()),
                );
                return Err("paused".into());
            }
            let chunk = chunk.map_err(|e| format!("读取流失败: {e}"))?;
            file.write_all(&chunk)
                .await
                .map_err(|e| format!("写盘失败: {e}"))?;
            downloaded += chunk.len() as u64;

            if last_emit.elapsed().as_millis() as u64 >= PROGRESS_INTERVAL_MS {
                last_emit = std::time::Instant::now();
                update_task_progress(
                    app,
                    task_id,
                    downloaded,
                    total,
                    TaskStatus::Running,
                    None,
                    Some(part.to_string_lossy().into_owned()),
                );
            }
        }
        file.flush().await.map_err(|e| format!("flush 失败: {e}"))?;
        drop(file);

        if dest.exists() {
            tokio::fs::remove_file(dest)
                .await
                .map_err(|e| format!("覆盖目标失败: {e}"))?;
        }
        tokio::fs::rename(part, dest)
            .await
            .map_err(|e| format!("重命名失败: {e}"))?;

        let final_size = tokio::fs::metadata(dest)
            .await
            .map(|m| m.len())
            .unwrap_or(downloaded);
        update_task_progress(
            app,
            task_id,
            final_size,
            if total > 0 { total } else { final_size },
            TaskStatus::Done,
            None,
            Some(dest.to_string_lossy().into_owned()),
        );

        return Ok(());
    }

    Err("HTTP 状态异常: 416".into())
}

pub fn default_connections() -> u32 {
    DEFAULT_CONNECTIONS
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_direct_file_urls() {
        assert!(looks_like_direct_file_url(
            "https://dw.oray.com/sl/windows/AweSun_v16.5.0.30905_x64.exe"
        ));
        assert!(looks_like_direct_file_url(
            "https://example.com/a/b/app.zip?token=1"
        ));
        assert!(looks_like_direct_file_url(
            "https://cdn.example.com/book.epub"
        ));
        assert!(looks_like_direct_file_url(
            "https://cdn.example.com/video.mkv"
        ));
        assert!(looks_like_direct_file_url(
            "https://cdn.example.com/archive.tar.gz"
        ));
        assert!(looks_like_direct_file_url(
            "https://cdn.example.com/model.safetensors"
        ));
        assert!(!looks_like_direct_file_url("https://sunlogin.oray.com/download"));
        assert!(!looks_like_direct_file_url("https://example.com/watch?v=1"));
        assert!(!looks_like_direct_file_url("https://example.com/index.html"));
        assert!(!looks_like_direct_file_url("https://example.com/page.php"));
    }

    #[test]
    fn referer_candidates_include_parent_domain() {
        let url = "https://dw.oray.com/sl/windows/AweSun_v16.5.0.30905_x64.exe";
        let c = referer_candidates(url);
        assert!(c.iter().any(|x| x == url));
        assert!(c.iter().any(|x| x == "https://dw.oray.com/"));
        assert!(c.iter().any(|x| x == "https://oray.com/"));
        assert!(c.iter().any(|x| x == "https://www.oray.com/"));
    }

    #[test]
    fn blocked_probe_detects_html_for_exe() {
        let original = "https://dw.oray.com/sl/windows/AweSun_v16.5.0.30905_x64.exe";
        let probe = HttpProbe {
            url: "https://sunlogin.oray.com/download".into(),
            name: "download".into(),
            size: Some(153608),
            resumable: false,
            content_type: Some("text/html; charset=utf-8".into()),
            request_headers: HashMap::new(),
        };
        assert!(probe_looks_hotlink_blocked(original, &probe));
    }

    #[test]
    fn blocked_probe_allows_octet_stream() {
        let original = "https://dw.oray.com/sl/windows/AweSun_v16.5.0.30905_x64.exe";
        let probe = HttpProbe {
            url: original.into(),
            name: "AweSun_v16.5.0.30905_x64.exe".into(),
            size: Some(171715520),
            resumable: true,
            content_type: Some("application/octet-stream".into()),
            request_headers: HashMap::new(),
        };
        assert!(!probe_looks_hotlink_blocked(original, &probe));
    }

    #[test]
    fn normalize_name_keeps_original_exe() {
        let original = "https://dw.oray.com/sl/windows/AweSun_v16.5.0.30905_x64.exe";
        let name = normalize_probe_name(original, None, "https://sunlogin.oray.com/download");
        assert_eq!(name, "AweSun_v16.5.0.30905_x64.exe");
    }

    /// 需要外网；验证 Oray 防盗链直链可被自动 Referer 解锁
    #[tokio::test]
    #[ignore]
    async fn probe_oray_direct_exe_with_auto_referer() {
        let url = "https://dw.oray.com/sl/windows/AweSun_v16.5.0.30905_x64.exe";
        let probe = probe_http(url, &HashMap::new(), &crate::download_engine::HttpClientOpts::default())
            .await
            .expect("probe should succeed with auto referer");
        assert!(
            !content_type_is_html(probe.content_type.as_deref()),
            "content-type should not be html: {:?}",
            probe.content_type
        );
        assert!(
            probe.size.unwrap_or(0) > 10 * 1024 * 1024,
            "expected large exe, got {:?}",
            probe.size
        );
        assert!(
            probe.name.to_ascii_lowercase().ends_with(".exe"),
            "name={}",
            probe.name
        );
        assert!(header_has_ci(&probe.request_headers, "referer"));
    }
}
