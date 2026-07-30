//! Tauri IPC：download_engine_* 命令面。

use std::collections::HashMap;
use std::sync::atomic::Ordering;
use std::sync::Arc;

use tauri::AppHandle;

use super::bt;
use super::ed2k;
use super::http::{self, default_connections};
use super::{
    detect_protocol, engine_stats, insert_task, list_tasks, remove_task, resolve_dest_path,
    sanitize_filename, set_task_status, with_task, CreateRequest, DownloadTask, EngineStats,
    ProtocolKind, ResolveRequest, ResolveResult, SpeedWindow, TaskControl, TaskInfo, TaskStatus,
};

fn headers_or_empty(h: &Option<HashMap<String, String>>) -> HashMap<String, String> {
    h.clone().unwrap_or_default()
}

fn extract_ed2k_servers(extra: &Option<serde_json::Value>) -> Vec<String> {
    extra
        .as_ref()
        .and_then(|v| v.get("servers").or_else(|| v.get("serverList")))
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|x| x.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default()
}

#[tauri::command]
pub async fn download_engine_resolve(req: ResolveRequest) -> Result<ResolveResult, String> {
    let url = req.url.trim().to_string();
    if url.is_empty() {
        return Err("URL 为空".into());
    }
    let headers = headers_or_empty(&req.headers);
    match detect_protocol(&url) {
        ProtocolKind::Http => http::resolve_http(&url, &headers).await,
        ProtocolKind::Bt => bt::resolve_bt(&url, &headers).await,
        ProtocolKind::Ed2k => ed2k::resolve_ed2k(&url),
    }
}

#[tauri::command]
pub async fn download_engine_create(
    app: AppHandle,
    req: CreateRequest,
) -> Result<TaskInfo, String> {
    let url = req.url.trim().to_string();
    if url.is_empty() {
        return Err("URL 为空".into());
    }
    let headers = headers_or_empty(&req.headers);
    let protocol = detect_protocol(&url);
    let connections = req.connections.unwrap_or_else(default_connections).max(1);

    // 预解析名称
    let (name, total, meta) = match protocol {
        ProtocolKind::Http => {
            let probe = http::probe_http(&url, &headers).await?;
            (
                req.name
                    .clone()
                    .filter(|s| !s.trim().is_empty())
                    .map(|s| sanitize_filename(&s))
                    .unwrap_or(probe.name),
                probe.size.unwrap_or(0),
                serde_json::json!({ "resumable": probe.resumable, "finalUrl": probe.url }),
            )
        }
        ProtocolKind::Bt => {
            let resolved = bt::resolve_bt(&url, &headers).await?;
            (
                req.name
                    .clone()
                    .filter(|s| !s.trim().is_empty())
                    .map(|s| sanitize_filename(&s))
                    .or(resolved.name.clone())
                    .unwrap_or_else(|| "torrent-download".into()),
                resolved.size.unwrap_or(0),
                resolved.meta,
            )
        }
        ProtocolKind::Ed2k => {
            let resolved = ed2k::resolve_ed2k(&url)?;
            (
                req.name
                    .clone()
                    .filter(|s| !s.trim().is_empty())
                    .map(|s| sanitize_filename(&s))
                    .or(resolved.name.clone())
                    .unwrap_or_else(|| "ed2k-download".into()),
                resolved.size.unwrap_or(0),
                resolved.meta,
            )
        }
    };

    let dest = resolve_dest_path(req.path.as_deref(), &name)?;
    let id = uuid::Uuid::new_v4().to_string();
    let control = TaskControl::new();
    let info = TaskInfo {
        id: id.clone(),
        protocol: protocol.as_str().to_string(),
        url: url.clone(),
        name: name.clone(),
        status: TaskStatus::Waiting.as_str().to_string(),
        downloaded: 0,
        total,
        speed: 0,
        percent: 0.0,
        filepath: Some(dest.to_string_lossy().into_owned()),
        error: None,
        connections,
        created_at: super::now_unix_ms(),
        meta,
    };

    let task = DownloadTask {
        info: info.clone(),
        headers: headers.clone(),
        control: Arc::clone(&control),
        speed_window: std::sync::Mutex::new(SpeedWindow::new(0)),
    };
    insert_task(task)?;

    // 置 running 并后台执行
    set_task_status(&id, TaskStatus::Running, None)?;

    let app2 = app.clone();
    let id2 = id.clone();
    let dest2 = dest.clone();
    let servers = extract_ed2k_servers(&req.extra);

    tauri::async_runtime::spawn(async move {
        match protocol {
            ProtocolKind::Http => {
                http::run_http_download(
                    app2, id2, url, dest2, connections, headers, control,
                )
                .await;
            }
            ProtocolKind::Bt => {
                bt::start_bt_task(app2, id2, url, dest2, connections, headers, control).await;
            }
            ProtocolKind::Ed2k => {
                ed2k::start_ed2k_task(app2, id2, url, dest2, headers, control, servers).await;
            }
        }
    });

    with_task(&id, |t| t.info.clone())
}

#[tauri::command]
pub async fn download_engine_pause(id: String) -> Result<TaskInfo, String> {
    with_task(&id, |task| {
        if task.info.status == TaskStatus::Done.as_str()
            || task.info.status == TaskStatus::Error.as_str()
        {
            return Err(format!("任务无法暂停: {}", task.info.status));
        }
        task.control.pause.store(true, Ordering::SeqCst);
        task.info.status = TaskStatus::Paused.as_str().to_string();
        task.info.speed = 0;
        Ok(task.info.clone())
    })?
}

#[tauri::command]
pub async fn download_engine_continue(
    app: AppHandle,
    id: String,
) -> Result<TaskInfo, String> {
    let (protocol, url, dest, connections, headers, control, status) = with_task(&id, |task| {
        let status = task.info.status.clone();
        if status != TaskStatus::Paused.as_str()
            && status != TaskStatus::Error.as_str()
            && status != TaskStatus::Waiting.as_str()
        {
            return Err(format!("任务无法继续: {status}"));
        }
        task.control.pause.store(false, Ordering::SeqCst);
        task.control.cancel.store(false, Ordering::SeqCst);
        task.info.status = TaskStatus::Running.as_str().to_string();
        task.info.error = None;
        Ok((
            task.info.protocol.clone(),
            task.info.url.clone(),
            task.info
                .filepath
                .clone()
                .unwrap_or_else(|| task.info.name.clone()),
            task.info.connections,
            task.headers.clone(),
            Arc::clone(&task.control),
            task.info.status.clone(),
        ))
    })??;

    let _ = status;
    let dest = std::path::PathBuf::from(dest);
    // 若 filepath 指向最终文件，续传仍用同路径（http 层写 .part）
    let protocol = match protocol.as_str() {
        "bt" => ProtocolKind::Bt,
        "ed2k" => ProtocolKind::Ed2k,
        _ => ProtocolKind::Http,
    };

    let id2 = id.clone();
    tauri::async_runtime::spawn(async move {
        match protocol {
            ProtocolKind::Http => {
                http::run_http_download(
                    app, id2, url, dest, connections, headers, control,
                )
                .await;
            }
            ProtocolKind::Bt => {
                bt::start_bt_task(app, id2, url, dest, connections, headers, control).await;
            }
            ProtocolKind::Ed2k => {
                ed2k::start_ed2k_task(app, id2, url, dest, headers, control, vec![]).await;
            }
        }
    });

    with_task(&id, |t| t.info.clone())
}

#[tauri::command]
pub async fn download_engine_delete(
    id: String,
    remove_files: Option<bool>,
) -> Result<(), String> {
    let task = remove_task(&id)?.ok_or_else(|| format!("任务不存在: {id}"))?;
    task.control.cancel.store(true, Ordering::SeqCst);
    task.control.pause.store(true, Ordering::SeqCst);

    if remove_files.unwrap_or(false) {
        if let Some(fp) = &task.info.filepath {
            let path = std::path::PathBuf::from(fp);
            let part = {
                let mut p = path.as_os_str().to_os_string();
                p.push(".part");
                std::path::PathBuf::from(p)
            };
            let _ = std::fs::remove_file(&path);
            let _ = std::fs::remove_file(&part);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn download_engine_list() -> Result<Vec<TaskInfo>, String> {
    list_tasks()
}

#[tauri::command]
pub async fn download_engine_stats() -> Result<EngineStats, String> {
    engine_stats()
}

/// Gopeed 扩展等场景：用 boa_engine 执行 JS，返回 JSON 字符串结果。
#[tauri::command]
pub async fn download_engine_eval_js(code: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || eval_js_to_json(&code))
        .await
        .map_err(|e| format!("JS 执行任务失败: {e}"))?
}

fn eval_js_to_json(code: &str) -> Result<String, String> {
    use boa_engine::{js_string, property::Attribute, Context, Source};

    let mut context = Context::default();
    let value = context
        .eval(Source::from_bytes(code.as_bytes()))
        .map_err(|e| format!("脚本执行错误: {e}"))?;

    if value.is_undefined() || value.is_null() {
        return Ok("null".into());
    }

    context
        .register_global_property(
            js_string!("__reader_eval_result__"),
            value,
            Attribute::all(),
        )
        .map_err(|e| e.to_string())?;

    let json_val = context
        .eval(Source::from_bytes(
            br#"(() => {
                try {
                    const v = globalThis.__reader_eval_result__;
                    if (typeof v === 'undefined') return 'null';
                    return JSON.stringify(v);
                } catch (e) {
                    return JSON.stringify(String(globalThis.__reader_eval_result__));
                }
            })()"#,
        ))
        .map_err(|e| format!("JSON.stringify 失败: {e}"))?;

    let s = json_val
        .to_string(&mut context)
        .map_err(|e| e.to_string())?
        .to_std_string_escaped();
    Ok(s)
}
