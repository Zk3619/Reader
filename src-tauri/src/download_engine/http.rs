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
    build_http_client, emit_progress, filename_from_url, sanitize_filename, update_task_progress,
    ProgressPayload, ResolveFile, ResolveResult, TaskControl, TaskStatus,
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
}

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

pub async fn resolve_http(
    url: &str,
    headers: &HashMap<String, String>,
) -> Result<ResolveResult, String> {
    let probe = probe_http(url, headers).await?;
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
        }),
    })
}

pub async fn probe_http(
    url: &str,
    headers: &HashMap<String, String>,
) -> Result<HttpProbe, String> {
    let client = build_http_client(headers, 60_000)?;
    let mut req = client.head(url);
    for (k, v) in headers {
        req = req.header(k, v);
    }
    let head = req.send().await;

    let (final_url, size, resumable, name_hint, content_type) = match head {
        Ok(resp) if resp.status().is_success() || resp.status().as_u16() == 405 => {
            let final_url = resp.url().to_string();
            let size = resp
                .headers()
                .get(reqwest::header::CONTENT_LENGTH)
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse::<u64>().ok());
            let accept = resp
                .headers()
                .get(reqwest::header::ACCEPT_RANGES)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_ascii_lowercase().contains("bytes"))
                .unwrap_or(false);
            let name = resp
                .headers()
                .get(reqwest::header::CONTENT_DISPOSITION)
                .and_then(|v| v.to_str().ok())
                .and_then(parse_content_disposition_filename);
            let ct = resp
                .headers()
                .get(reqwest::header::CONTENT_TYPE)
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
            let mut req = client.get(url).header(reqwest::header::RANGE, "bytes=0-0");
            for (k, v) in headers {
                req = req.header(k, v);
            }
            let resp = req
                .send()
                .await
                .map_err(|e| format!("探测失败: {e}"))?;
            let final_url = resp.url().to_string();
            let status = resp.status().as_u16();
            let ct = resp
                .headers()
                .get(reqwest::header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string());
            let name = resp
                .headers()
                .get(reqwest::header::CONTENT_DISPOSITION)
                .and_then(|v| v.to_str().ok())
                .and_then(parse_content_disposition_filename);
            let (size, resumable) = if status == 206 {
                let total = resp
                    .headers()
                    .get(reqwest::header::CONTENT_RANGE)
                    .and_then(|v| v.to_str().ok())
                    .and_then(parse_content_range_total);
                (total, true)
            } else {
                let size = resp
                    .headers()
                    .get(reqwest::header::CONTENT_LENGTH)
                    .and_then(|v| v.to_str().ok())
                    .and_then(|s| s.parse::<u64>().ok());
                (size, false)
            };
            let _ = resp.bytes().await;
            (final_url, size, resumable, name, ct)
        }
    };

    let name = name_hint
        .map(|n| sanitize_filename(&n))
        .unwrap_or_else(|| sanitize_filename(&filename_from_url(&final_url)));

    Ok(HttpProbe {
        url: final_url,
        name,
        size,
        resumable,
        content_type,
    })
}

async fn probe_range_support(
    client: &reqwest::Client,
    url: &str,
    headers: &HashMap<String, String>,
) -> bool {
    let mut req = client.get(url).header(reqwest::header::RANGE, "bytes=0-0");
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
    end: u64, // inclusive
    written: AtomicU64,
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
    let result = http_download_inner(
        &app,
        &task_id,
        &url,
        &dest,
        connections.max(1),
        &headers,
        &control,
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
) -> Result<PathBuf, String> {
    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("创建目录失败: {e}"))?;
    }

    let probe = probe_http(url, headers).await?;
    let total = probe.size.unwrap_or(0);
    let part = part_path(dest);
    let client = build_long_client(headers)?;

    update_task_progress(
        app,
        task_id,
        0,
        total,
        TaskStatus::Running,
        None,
        Some(part.to_string_lossy().into_owned()),
    );

    if total == 0 || !probe.resumable || connections <= 1 {
        single_stream_download(
            app, task_id, &probe.url, &part, dest, headers, &client, control, total,
        )
        .await?;
        return Ok(dest.to_path_buf());
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
            // 续传：若已有完整段则跳过（简化：按段起始探测本地已写长度不可靠，这里从 0 写；
            // 若 .part 已存在且长度匹配，仍重下各段，保证正确性）
            Some(Arc::new(Segment {
                start,
                end,
                written: AtomicU64::new(0),
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

    let mut handles = Vec::new();
    for seg in &segments {
        let app = app.clone();
        let task_id = task_id.to_string();
        let url = probe.url.clone();
        let part = part.clone();
        let headers = headers.clone();
        let client = client.clone();
        let control = Arc::clone(control);
        let seg = Arc::clone(seg);
        let downloaded = downloaded.clone();
        let err_flag = err_flag.clone();
        let first_err = first_err.clone();

        handles.push(tokio::spawn(async move {
            if let Err(e) = download_segment(
                &client,
                &url,
                &part,
                &headers,
                &seg,
                &downloaded,
                &control,
            )
            .await
            {
                err_flag.store(true, Ordering::SeqCst);
                if let Ok(mut g) = first_err.lock() {
                    if g.is_none() {
                        *g = Some(e.clone());
                    }
                }
                let _ = app;
                let _ = task_id;
            }
        }));
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
    let done = segments
        .iter()
        .map(|s| s.written.load(Ordering::SeqCst))
        .sum::<u64>();
    if done < total {
        // 允许微小差异？严格要求
        let expected: u64 = segments.iter().map(|s| s.end - s.start + 1).sum();
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

    emit_progress(
        app,
        ProgressPayload {
            id: task_id.to_string(),
            percent: 100.0,
            downloaded: total,
            total,
            speed: 0,
            status: TaskStatus::Done.as_str().into(),
            error: None,
            filepath: Some(dest.to_string_lossy().into_owned()),
        },
    );

    Ok(dest.to_path_buf())
}

fn build_long_client(headers: &HashMap<String, String>) -> Result<reqwest::Client, String> {
    let has_ua = headers
        .keys()
        .any(|k| k.eq_ignore_ascii_case("user-agent"));
    let mut builder = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .pool_idle_timeout(std::time::Duration::from_secs(90))
        .redirect(reqwest::redirect::Policy::limited(10))
        .gzip(true)
        .brotli(true)
        .deflate(true)
        .danger_accept_invalid_certs(true);
    if !has_ua {
        builder = builder.user_agent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        );
    }
    builder
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))
}

async fn download_segment(
    client: &reqwest::Client,
    url: &str,
    part: &Path,
    headers: &HashMap<String, String>,
    seg: &Segment,
    downloaded: &AtomicU64,
    control: &TaskControl,
) -> Result<(), String> {
    let mut cursor = seg.start + seg.written.load(Ordering::SeqCst);
    while cursor <= seg.end {
        if control.is_cancelled() {
            return Err("已取消".into());
        }
        if control.is_paused() {
            return Err("paused".into());
        }

        let range = format!("bytes={}-{}", cursor, seg.end);
        let mut req = client.get(url).header(reqwest::header::RANGE, &range);
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
            let chunk = chunk.map_err(|e| format!("读取流失败: {e}"))?;
            file.write_all(&chunk)
                .await
                .map_err(|e| format!("写盘失败: {e}"))?;
            let n = chunk.len() as u64;
            cursor += n;
            seg.written.fetch_add(n, Ordering::SeqCst);
            downloaded.fetch_add(n, Ordering::SeqCst);
            if cursor > seg.end + 1 {
                break;
            }
        }
        file.flush().await.map_err(|e| format!("flush 失败: {e}"))?;

        if cursor > seg.end {
            break;
        }
        // 连接中断则续传同一段
    }
    Ok(())
}

async fn single_stream_download(
    app: &AppHandle,
    task_id: &str,
    url: &str,
    part: &Path,
    dest: &Path,
    headers: &HashMap<String, String>,
    client: &reqwest::Client,
    control: &Arc<TaskControl>,
    known_total: u64,
) -> Result<(), String> {
    let existing = if part.exists() {
        tokio::fs::metadata(part)
            .await
            .map(|m| m.len())
            .unwrap_or(0)
    } else {
        0
    };

    let mut req = client.get(url);
    for (k, v) in headers {
        req = req.header(k, v);
    }
    if existing > 0 {
        req = req.header(
            reqwest::header::RANGE,
            format!("bytes={}-", existing),
        );
    }

    let resp = req.send().await.map_err(|e| format!("请求失败: {e}"))?;
    let status = resp.status().as_u16();
    if !(status == 200 || status == 206) {
        return Err(format!("HTTP 状态异常: {status}"));
    }

    let total = if status == 206 {
        resp.headers()
            .get(reqwest::header::CONTENT_RANGE)
            .and_then(|v| v.to_str().ok())
            .and_then(parse_content_range_total)
            .unwrap_or(known_total)
    } else {
        resp.headers()
            .get(reqwest::header::CONTENT_LENGTH)
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

    Ok(())
}

pub fn default_connections() -> u32 {
    DEFAULT_CONNECTIONS
}
