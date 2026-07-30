//! ED2K 链接解析与任务 API。下载在无服务器列表时返回明确错误；parse/create/list 可用。

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use tauri::AppHandle;

use super::{
    update_task_progress, ResolveFile, ResolveResult, TaskControl, TaskStatus,
};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ed2kFileLink {
    pub filename: String,
    pub filesize: u64,
    pub filehash: String,
    #[serde(default)]
    pub root_hash: Option<String>,
    #[serde(default)]
    pub sources: Vec<String>,
    pub raw: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ed2kServerLink {
    pub host: String,
    pub port: u16,
    pub raw: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "kind")]
pub enum Ed2kLink {
    File(Ed2kFileLink),
    Server(Ed2kServerLink),
}

/// 解析 `ed2k://|file|name|size|hash|/` 与 `ed2k://|server|host|port|/` 等变体。
pub fn parse_ed2k(uri: &str) -> Result<Ed2kLink, String> {
    let raw = uri.trim().to_string();
    let lower = raw.to_ascii_lowercase();
    if !lower.starts_with("ed2k://") {
        return Err("不是 ed2k 链接".into());
    }

    // 去掉 scheme
    let body = raw[7..].trim_start_matches('/');
    // 标准形式：|type|...|/
    let parts: Vec<&str> = body
        .trim_matches('|')
        .split('|')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect();

    if parts.is_empty() {
        return Err("ed2k 链接为空".into());
    }

    let kind = parts[0].to_ascii_lowercase();
    match kind.as_str() {
        "file" => {
            // |file|filename|filesize|filehash|/
            // 可选后续：/|sources,... 或 root hash 等扩展段
            if parts.len() < 4 {
                return Err("ed2k file 链接字段不足（需要 name|size|hash）".into());
            }
            let filename = urlencoding::decode(parts[1])
                .map(|c| c.into_owned())
                .unwrap_or_else(|_| parts[1].to_string());
            let filesize: u64 = parts[2]
                .parse()
                .map_err(|_| format!("无效文件大小: {}", parts[2]))?;
            let filehash = parts[3].to_ascii_uppercase();
            if filehash.len() != 32
                && filehash.len() != 40
                && !filehash.chars().all(|c| c.is_ascii_hexdigit())
            {
                // 仍接受，部分链接使用 base16 MD4(32 hex)
            }
            let mut root_hash = None;
            let mut sources = Vec::new();
            for extra in parts.iter().skip(4) {
                let e = *extra;
                if e.contains(',') || e.contains(':') {
                    // sources: ip:port,ip:port
                    for s in e.split(',') {
                        let s = s.trim();
                        if !s.is_empty() {
                            sources.push(s.to_string());
                        }
                    }
                } else if e.len() >= 32 && e.chars().all(|c| c.is_ascii_hexdigit()) {
                    root_hash = Some(e.to_ascii_uppercase());
                }
            }
            Ok(Ed2kLink::File(Ed2kFileLink {
                filename,
                filesize,
                filehash,
                root_hash,
                sources,
                raw,
            }))
        }
        "server" => {
            if parts.len() < 3 {
                return Err("ed2k server 链接字段不足（需要 host|port）".into());
            }
            let host = parts[1].to_string();
            let port: u16 = parts[2]
                .parse()
                .map_err(|_| format!("无效端口: {}", parts[2]))?;
            Ok(Ed2kLink::Server(Ed2kServerLink { host, port, raw }))
        }
        other => Err(format!("不支持的 ed2k 类型: {other}")),
    }
}

pub fn resolve_ed2k(url: &str) -> Result<ResolveResult, String> {
    match parse_ed2k(url)? {
        Ed2kLink::File(f) => Ok(ResolveResult {
            protocol: "ed2k".into(),
            url: f.raw.clone(),
            name: Some(f.filename.clone()),
            size: Some(f.filesize),
            hash: Some(f.filehash.clone()),
            files: vec![ResolveFile {
                name: f.filename.clone(),
                size: f.filesize,
                path: Some(f.filename.clone()),
                selected: Some(true),
            }],
            resumable: true,
            meta: serde_json::json!({
                "filehash": f.filehash,
                "rootHash": f.root_hash,
                "sources": f.sources,
                "kind": "file",
            }),
        }),
        Ed2kLink::Server(s) => Ok(ResolveResult {
            protocol: "ed2k".into(),
            url: s.raw.clone(),
            name: Some(format!("ed2k-server://{}:{}", s.host, s.port)),
            size: None,
            hash: None,
            files: vec![],
            resumable: false,
            meta: serde_json::json!({
                "host": s.host,
                "port": s.port,
                "kind": "server",
            }),
        }),
    }
}

/// 尝试下载：无配置服务器且无 sources 时返回明确错误。
pub async fn start_ed2k_task(
    app: AppHandle,
    task_id: String,
    url: String,
    _dest: PathBuf,
    _headers: HashMap<String, String>,
    control: Arc<TaskControl>,
    server_list: Vec<String>,
) {
    let parsed = match parse_ed2k(&url) {
        Ok(Ed2kLink::File(f)) => f,
        Ok(Ed2kLink::Server(_)) => {
            update_task_progress(
                &app,
                &task_id,
                0,
                0,
                TaskStatus::Error,
                Some("server 链接不能作为下载任务".into()),
                None,
            );
            return;
        }
        Err(e) => {
            update_task_progress(&app, &task_id, 0, 0, TaskStatus::Error, Some(e), None);
            return;
        }
    };

    if control.is_cancelled() {
        update_task_progress(
            &app,
            &task_id,
            0,
            parsed.filesize,
            TaskStatus::Error,
            Some("已取消".into()),
            None,
        );
        return;
    }

    if server_list.is_empty() && parsed.sources.is_empty() {
        update_task_progress(
            &app,
            &task_id,
            0,
            parsed.filesize,
            TaskStatus::Error,
            Some(
                "无 ED2K 服务器列表且链接未含 sources；请配置 server list 后再试".into(),
            ),
            None,
        );
        return;
    }

    // 有服务器/源时仍为脚手架：明确提示协议内核未启用
    update_task_progress(
        &app,
        &task_id,
        0,
        parsed.filesize,
        TaskStatus::Error,
        Some(format!(
            "ED2K 元数据已就绪（hash={} size={} servers={} sources={}），协议传输内核尚未启用",
            parsed.filehash,
            parsed.filesize,
            server_list.len(),
            parsed.sources.len()
        )),
        None,
    );
}
