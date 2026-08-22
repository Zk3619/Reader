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
    let client_opts = super::HttpClientOpts::from_extra(&req.extra);
    let bt_opts = bt::BtDownloadOpts::from_extra(&req.extra);
    let mut headers = headers_or_empty(&req.headers);
    if !client_opts.default_user_agent.is_empty()
        && !headers
            .keys()
            .any(|k| k.eq_ignore_ascii_case("user-agent"))
    {
        headers.insert("User-Agent".into(), client_opts.default_user_agent.clone());
    }
    let protocol = detect_protocol(&url);
    let connections = req.connections.unwrap_or_else(default_connections).max(1);

    // 预解析名称
    let (name, total, meta, multi_file) = match protocol {
        ProtocolKind::Http => {
            let probe = http::probe_http(&url, &headers, &client_opts).await?;
            // 持久化自动补全的 Referer，供续传/多连接复用
            headers = probe.request_headers.clone();
            (
                req.name
                    .clone()
                    .filter(|s| !s.trim().is_empty())
                    .map(|s| sanitize_filename(&s))
                    .unwrap_or(probe.name),
                probe.size.unwrap_or(0),
                serde_json::json!({
                    "resumable": probe.resumable,
                    "finalUrl": probe.url,
                    "contentType": probe.content_type,
                }),
                req.selected_files
                    .as_ref()
                    .map(|s| s.len() > 1)
                    .unwrap_or(false),
            )
        }
        ProtocolKind::Bt => {
            let resolved = bt::resolve_bt(&url, &headers).await?;
            // BT / magnet：始终使用 Category/标题/ 容器目录（多文件必需；单文件种子也落在目录内）
            (
                req.name
                    .clone()
                    .filter(|s| !s.trim().is_empty())
                    .map(|s| sanitize_filename(&s))
                    .or(resolved.name.clone())
                    .unwrap_or_else(|| "torrent-download".into()),
                resolved.size.unwrap_or(0),
                resolved.meta,
                true,
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
                false,
            )
        }
    };

    let dest = resolve_dest_path(req.path.as_deref(), &name, multi_file)?;
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
        client_opts: client_opts.clone(),
    };
    insert_task(task)?;

    // 置 running 并后台执行
    set_task_status(&id, TaskStatus::Running, None)?;

    let app2 = app.clone();
    let id2 = id.clone();
    let dest2 = dest.clone();
    let servers = extract_ed2k_servers(&req.extra);
    let selected_files = req.selected_files.clone();
    let client_opts2 = client_opts.clone();
    let bt_opts2 = bt_opts.clone();

    tauri::async_runtime::spawn(async move {
        match protocol {
            ProtocolKind::Http => {
                http::run_http_download_with_opts(
                    app2, id2, url, dest2, connections, headers, control, client_opts2,
                )
                .await;
            }
            ProtocolKind::Bt => {
                bt::start_bt_task(
                    app2,
                    id2,
                    url,
                    dest2,
                    connections,
                    headers,
                    control,
                    selected_files,
                    client_opts2,
                    bt_opts2,
                )
                .await;
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
    let (protocol, url, dest, connections, headers, control, client_opts, status) =
        with_task(&id, |task| {
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
            task.client_opts.clone(),
            task.info.status.clone(),
        ))
    })??;

    let _ = status;
    // 进度事件会把 filepath 更新为 `*.part`；续传必须回到成片路径，否则完成后会永久落成 `xxx.mp4.part`
    let dest = super::final_dest_path(std::path::Path::new(&dest));
    // 成片路径传入 http 层；实际写入仍用旁路 `.part`
    let protocol = match protocol.as_str() {
        "bt" => ProtocolKind::Bt,
        "ed2k" => ProtocolKind::Ed2k,
        _ => ProtocolKind::Http,
    };

    let id2 = id.clone();
    tauri::async_runtime::spawn(async move {
        match protocol {
            ProtocolKind::Http => {
                http::run_http_download_with_opts(
                    app,
                    id2,
                    url,
                    dest,
                    connections,
                    headers,
                    control,
                    client_opts,
                )
                .await;
            }
            ProtocolKind::Bt => {
                bt::start_bt_task(
                    app,
                    id2,
                    url,
                    dest,
                    connections,
                    headers,
                    control,
                    None,
                    client_opts,
                    bt::BtDownloadOpts::default(),
                )
                .await;
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
            delete_local_path(fp);
        }
    }
    Ok(())
}

/// 删除下载产物路径（成片 / 分轨 / .part）；不受 plugin-fs scope 限制。
#[tauri::command]
pub async fn download_engine_delete_paths(paths: Vec<String>) -> Result<u32, String> {
    let mut removed = 0u32;
    for raw in paths {
        let fp = raw.trim();
        if fp.is_empty() {
            continue;
        }
        if delete_local_path(fp) {
            removed += 1;
        }
    }
    Ok(removed)
}

fn is_download_category_name(name: &str) -> bool {
    matches!(
        name,
        "General"
            | "Compressed"
            | "Documents"
            | "Audio"
            | "Music" // legacy
            | "Video"
            | "Programs"
    )
}

fn delete_local_path(fp: &str) -> bool {
    let path = std::path::PathBuf::from(fp);
    if path.as_os_str().is_empty() {
        return false;
    }
    let mut ok = false;
    if path.is_dir() {
        if std::fs::remove_dir_all(&path).is_ok() {
            ok = true;
        }
    } else if std::fs::remove_file(&path).is_ok() {
        ok = true;
    }
    // 成片旁的未完成 .part（filepath.part）；若传入本身已是 .part 再追加无意义，忽略失败即可
    let mut part = path.as_os_str().to_os_string();
    part.push(".part");
    if std::fs::remove_file(std::path::PathBuf::from(&part)).is_ok() {
        ok = true;
    }
    // 多轨独立工作目录：`{stem}.parts`
    let stem_parts = path.with_extension("").with_extension("parts");
    if stem_parts.is_dir() {
        if std::fs::remove_dir_all(&stem_parts).is_ok() {
            ok = true;
        }
    }
    // filepath 本身已是无扩展 stem 时：`{filepath}.parts`
    let mut parts_dir_os = path.as_os_str().to_os_string();
    parts_dir_os.push(".parts");
    let parts_dir = std::path::PathBuf::from(&parts_dir_os);
    if parts_dir != stem_parts && parts_dir.is_dir() {
        if std::fs::remove_dir_all(&parts_dir).is_ok() {
            ok = true;
        }
    }
    // 遗留 flat 命名：同目录下 `{stem}.part-*`
    if let Some(parent) = path.parent() {
        let stem_name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        if !stem_name.is_empty() {
            let prefix = format!("{stem_name}.part-");
            if let Ok(rd) = std::fs::read_dir(parent) {
                for entry in rd.filter_map(|e| e.ok()) {
                    let name = entry.file_name();
                    let name_str = name.to_string_lossy();
                    if name_str.starts_with(&prefix) {
                        let p = entry.path();
                        if p.is_dir() {
                            if std::fs::remove_dir_all(&p).is_ok() {
                                ok = true;
                            }
                        } else if std::fs::remove_file(&p).is_ok() {
                            ok = true;
                        }
                    }
                }
            }
            // 标题容器目录：Category/Title/（成片 Category/Title.mp4 或待合并时残留）
            let parent_name = parent.file_name().and_then(|s| s.to_str()).unwrap_or("");
            if is_download_category_name(parent_name) {
                let container = parent.join(&stem_name);
                if container.is_dir() {
                    if std::fs::remove_dir_all(&container).is_ok() {
                        ok = true;
                    }
                }
            }
        }
    }
    // 误识别时曾把无扩展名路径建成子目录（如 General/Title/file.mp4）；
    // 删成片后若该任务容器目录已空则一并移除（不碰 General 等分类根目录）。
    if let Some(parent) = path.parent() {
        let parent_name = parent.file_name().and_then(|s| s.to_str()).unwrap_or("");
        let grand_name = parent
            .parent()
            .and_then(|g| g.file_name())
            .and_then(|s| s.to_str())
            .unwrap_or("");
        if !parent_name.is_empty()
            && !is_download_category_name(parent_name)
            && is_download_category_name(grand_name)
        {
            if let Ok(rd) = std::fs::read_dir(parent) {
                if rd.filter_map(|e| e.ok()).next().is_none() {
                    let _ = std::fs::remove_dir(parent);
                }
            }
        }
    }
    ok
}

#[tauri::command]
pub async fn download_engine_list() -> Result<Vec<TaskInfo>, String> {
    list_tasks()
}

#[tauri::command]
pub async fn download_engine_stats() -> Result<EngineStats, String> {
    engine_stats()
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvalJsResult {
    pub result: serde_json::Value,
    pub storage: serde_json::Map<String, serde_json::Value>,
}

/// Gopeed 扩展：执行 JS，返回 `{ result, storage }`。
#[tauri::command]
pub async fn download_engine_eval_js(
    code: String,
    identity: Option<String>,
    event: Option<String>,
) -> Result<EvalJsResult, String> {
    let _ = (identity, event);
    tauri::async_runtime::spawn_blocking(move || eval_js_with_storage(&code))
        .await
        .map_err(|e| format!("JS 执行任务失败: {e}"))?
}

fn eval_js_with_storage(code: &str) -> Result<EvalJsResult, String> {
    use boa_engine::{js_string, property::Attribute, Context, JsArgs, JsValue, NativeFunction, Source};
    use std::collections::HashMap;

    let mut context = Context::default();

    // 同步 HTTP：供扩展 XMLHttpRequest / fetch polyfill 使用
    context
        .register_global_callable(
            js_string!("__reader_http"),
            1,
            NativeFunction::from_fn_ptr(|_this, args, ctx| {
                let raw = args
                    .get_or_undefined(0)
                    .to_string(ctx)?
                    .to_std_string_escaped();
                let parsed: serde_json::Value =
                    serde_json::from_str(&raw).unwrap_or(serde_json::json!({}));
                let method = parsed
                    .get("method")
                    .and_then(|v| v.as_str())
                    .unwrap_or("GET")
                    .to_ascii_uppercase();
                let url = parsed
                    .get("url")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let body = parsed
                    .get("body")
                    .and_then(|v| {
                        if v.is_null() {
                            None
                        } else if let Some(s) = v.as_str() {
                            Some(s.to_string())
                        } else {
                            Some(v.to_string())
                        }
                    });
                let mut headers = HashMap::new();
                if let Some(obj) = parsed.get("headers").and_then(|v| v.as_object()) {
                    for (k, v) in obj {
                        if let Some(s) = v.as_str() {
                            headers.insert(k.clone(), s.to_string());
                        }
                    }
                }
                let result = blocking_http_json(&method, &url, &headers, body.as_deref());
                let out = serde_json::to_string(&result).unwrap_or_else(|_| {
                    "{\"status\":0,\"body\":\"\",\"error\":\"serialize failed\"}".into()
                });
                Ok(JsValue::from(js_string!(out)))
            }),
        )
        .map_err(|e| e.to_string())?;

    let value = context
        .eval(Source::from_bytes(code.as_bytes()))
        .map_err(|e| format!("脚本执行错误: {e}"))?;

    context
        .register_global_property(
            js_string!("__reader_eval_result__"),
            value,
            Attribute::all(),
        )
        .map_err(|e| e.to_string())?;

    let packed = context
        .eval(Source::from_bytes(
            br#"(() => {
                const result = (() => {
                    try {
                        const v = globalThis.__reader_eval_result__;
                        if (typeof v === 'undefined') return null;
                        return v;
                    } catch (e) {
                        return String(e);
                    }
                })();
                let storage = {};
                try {
                    if (globalThis.__gopeed_storage__ && typeof globalThis.__gopeed_storage__ === 'object') {
                        storage = globalThis.__gopeed_storage__;
                    } else if (globalThis.gopeed && gopeed.storage && typeof gopeed.storage === 'object') {
                        storage = gopeed.storage;
                    }
                } catch (_) {}
                return JSON.stringify({ result, storage });
            })()"#,
        ))
        .map_err(|e| format!("打包 eval 结果失败: {e}"))?;

    let s = packed
        .to_string(&mut context)
        .map_err(|e| e.to_string())?
        .to_std_string_escaped();
    // boa 可能给字符串再包一层引号
    let trimmed = s.trim().trim_matches('"').replace("\\\"", "\"");
    let parsed: serde_json::Value = serde_json::from_str(&s)
        .or_else(|_| serde_json::from_str(&trimmed))
        .unwrap_or_else(|_| serde_json::json!({ "result": s, "storage": {} }));

    let result = parsed.get("result").cloned().unwrap_or(serde_json::Value::Null);
    let storage = parsed
        .get("storage")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();

    Ok(EvalJsResult { result, storage })
}

fn blocking_http_json(
    method: &str,
    url: &str,
    headers: &std::collections::HashMap<String, String>,
    body: Option<&str>,
) -> serde_json::Value {
    use crate::http_client::{self, ClientOpts};

    if url.is_empty() {
        return serde_json::json!({ "status": 0, "body": "", "error": "empty url" });
    }
    let opts = ClientOpts {
        timeout: std::time::Duration::from_secs(60),
        accept_invalid_certs: true,
        ..ClientOpts::default()
    };
    match http_client::blocking_fetch(method, url, headers, body, &opts) {
        Ok((status, bytes, _)) => {
            let text = String::from_utf8_lossy(&bytes).into_owned();
            serde_json::json!({ "status": status, "body": text, "error": null })
        }
        Err(e) => serde_json::json!({ "status": 0, "body": "", "error": e }),
    }
}

#[tauri::command]
pub async fn download_engine_extract_archive(
    archive_path: String,
    dest_dir: String,
    password: Option<String>,
    delete_after_extract: Option<bool>,
) -> Result<super::archive::ExtractArchiveResult, String> {
    let pw = password.unwrap_or_default();
    let del = delete_after_extract.unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || {
        super::archive::extract_archive(&archive_path, &dest_dir, &pw, del)
    })
    .await
    .map_err(|e| format!("解压任务失败: {e}"))?
}

#[tauri::command]
pub async fn download_engine_copy_extension(
    src: String,
    identity: String,
    dest_root: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        super::archive::copy_extension_dir(&src, &identity, &dest_root)
    })
    .await
    .map_err(|e| format!("复制扩展失败: {e}"))?
}
