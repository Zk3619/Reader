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
    let (name, total, meta) = match protocol {
        ProtocolKind::Http => {
            let probe = http::probe_http(&url, &headers).await?;
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
                http::run_http_download_with_opts(
                    app,
                    id2,
                    url,
                    dest,
                    connections,
                    headers,
                    control,
                    super::HttpClientOpts::default(),
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
                    super::HttpClientOpts::default(),
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
    if url.is_empty() {
        return serde_json::json!({ "status": 0, "body": "", "error": "empty url" });
    }
    let client = match reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .redirect(reqwest::redirect::Policy::limited(10))
        .danger_accept_invalid_certs(true)
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return serde_json::json!({ "status": 0, "body": "", "error": e.to_string() });
        }
    };
    let mut builder = match method {
        "POST" => client.post(url),
        "PUT" => client.put(url),
        "PATCH" => client.patch(url),
        "DELETE" => client.delete(url),
        "HEAD" => client.head(url),
        _ => client.get(url),
    };
    for (k, v) in headers {
        builder = builder.header(k, v);
    }
    if let Some(b) = body {
        if method != "GET" && method != "HEAD" {
            builder = builder.body(b.to_string());
        }
    }
    match builder.send() {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let text = resp.text().unwrap_or_default();
            serde_json::json!({ "status": status, "body": text, "error": null })
        }
        Err(e) => serde_json::json!({ "status": 0, "body": "", "error": e.to_string() }),
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
