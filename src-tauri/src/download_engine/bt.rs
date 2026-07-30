//! BitTorrent / Magnet 脚手架：info-hash 提取、.torrent 拉取与简易 bencode 解析、
//! url-list webseed 可走 HTTP Range；完整 peer 协议入队等待后续内核接入。

use std::collections::HashMap;
use std::path::PathBuf;

use sha1::{Digest, Sha1};
use tauri::AppHandle;

use super::http;
use super::{
    build_http_client, update_task_progress, ResolveFile, ResolveResult, TaskControl, TaskStatus,
};

#[derive(Debug, Clone)]
pub struct MagnetMeta {
    pub info_hash: String,
    pub name: Option<String>,
    pub trackers: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct TorrentMeta {
    pub info_hash: String,
    pub name: String,
    pub total_size: u64,
    pub files: Vec<ResolveFile>,
    pub webseeds: Vec<String>,
    pub trackers: Vec<String>,
}

pub fn parse_magnet(uri: &str) -> Result<MagnetMeta, String> {
    let uri = uri.trim();
    if !uri.to_ascii_lowercase().starts_with("magnet:") {
        return Err("不是 magnet 链接".into());
    }
    let parsed = url::Url::parse(uri).map_err(|e| format!("magnet 解析失败: {e}"))?;
    let mut info_hash = None;
    let mut name = None;
    let mut trackers = Vec::new();

    for (k, v) in parsed.query_pairs() {
        match k.as_ref() {
            "xt" => {
                let val = v.to_string();
                if let Some(hash) = extract_btih(&val) {
                    info_hash = Some(hash);
                }
            }
            "dn" => name = Some(v.to_string()),
            "tr" => trackers.push(v.to_string()),
            _ => {}
        }
    }

    let info_hash = info_hash.ok_or_else(|| "magnet 缺少 xt=urn:btih:".to_string())?;
    Ok(MagnetMeta {
        info_hash,
        name,
        trackers,
    })
}

fn extract_btih(xt: &str) -> Option<String> {
    let lower = xt.to_ascii_lowercase();
    let hash = if let Some(rest) = lower.strip_prefix("urn:btih:") {
        rest
    } else if let Some(rest) = lower.strip_prefix("urn:btmh:") {
        // v2 multihash：取末尾 40/64 hex 尽力提取
        rest.rsplit(':').next().unwrap_or(rest)
    } else {
        return None;
    };
    let cleaned: String = hash
        .chars()
        .filter(|c| c.is_ascii_hexdigit())
        .collect::<String>()
        .to_ascii_lowercase();
    if cleaned.len() == 40 || cleaned.len() == 64 {
        Some(cleaned)
    } else if hash.len() == 32 {
        // base32 infohash
        Some(hash.to_ascii_uppercase())
    } else {
        None
    }
}

pub async fn resolve_bt(
    url: &str,
    headers: &HashMap<String, String>,
) -> Result<ResolveResult, String> {
    let trimmed = url.trim();
    if trimmed.to_ascii_lowercase().starts_with("magnet:") {
        let m = parse_magnet(trimmed)?;
        return Ok(ResolveResult {
            protocol: "bt".into(),
            url: trimmed.to_string(),
            name: m.name.clone(),
            size: None,
            hash: Some(m.info_hash.clone()),
            files: m
                .name
                .as_ref()
                .map(|n| {
                    vec![ResolveFile {
                        name: n.clone(),
                        size: 0,
                        path: Some(n.clone()),
                        selected: Some(true),
                    }]
                })
                .unwrap_or_default(),
            resumable: true,
            meta: serde_json::json!({
                "infoHash": m.info_hash,
                "trackers": m.trackers,
                "kind": "magnet",
                "peerProtocol": "queued",
                "note": "完整 BT peer 协议由内部队列承载；当前已完成 info-hash 解析",
            }),
        });
    }

    // http(s) .torrent 或本地路径
    let bytes = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        fetch_torrent_bytes(trimmed, headers).await?
    } else {
        let path = trimmed.strip_prefix("file://").unwrap_or(trimmed);
        std::fs::read(path).map_err(|e| format!("读取 torrent 失败: {e}"))?
    };

    let meta = parse_torrent_bytes(&bytes)?;
    Ok(ResolveResult {
        protocol: "bt".into(),
        url: trimmed.to_string(),
        name: Some(meta.name.clone()),
        size: Some(meta.total_size),
        hash: Some(meta.info_hash.clone()),
        files: meta.files.clone(),
        resumable: true,
        meta: serde_json::json!({
            "infoHash": meta.info_hash,
            "trackers": meta.trackers,
            "webseeds": meta.webseeds,
            "kind": "torrent",
            "peerProtocol": "queued",
            "note": if meta.webseeds.is_empty() {
                "无 webseed；完整 peer 下载入队等待引擎接入"
            } else {
                "检测到 url-list webseed，create 时可走 HTTP Range"
            },
        }),
    })
}

async fn fetch_torrent_bytes(
    url: &str,
    headers: &HashMap<String, String>,
) -> Result<Vec<u8>, String> {
    let client = build_http_client(headers, 60_000)?;
    let mut req = client.get(url);
    for (k, v) in headers {
        req = req.header(k, v);
    }
    let resp = req.send().await.map_err(|e| format!("拉取 torrent 失败: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("拉取 torrent 状态异常: {}", resp.status()));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("读取 torrent 失败: {e}"))?;
    Ok(bytes.to_vec())
}

/// 极简 bencode 解析：定位 `4:info` 字典字节范围算 SHA1，并提取 name/length/files/url-list/announce。
pub fn parse_torrent_bytes(data: &[u8]) -> Result<TorrentMeta, String> {
    let info_slice = find_info_dict(data).ok_or_else(|| "torrent 缺少 info 字典".to_string())?;
    let mut hasher = Sha1::new();
    hasher.update(info_slice);
    let info_hash = hex_encode(&hasher.finalize());

    let root = BValue::parse(data).map_err(|e| format!("bencode 解析失败: {e}"))?;
    let dict = root
        .as_dict()
        .ok_or_else(|| "torrent 根不是字典".to_string())?;

    let mut trackers = Vec::new();
    if let Some(BValue::Bytes(a)) = dict.get("announce") {
        if let Ok(s) = std::str::from_utf8(a) {
            trackers.push(s.to_string());
        }
    }
    if let Some(BValue::List(list)) = dict.get("announce-list") {
        for item in list {
            match item {
                BValue::List(inner) => {
                    for t in inner {
                        if let BValue::Bytes(b) = t {
                            if let Ok(s) = std::str::from_utf8(b) {
                                trackers.push(s.to_string());
                            }
                        }
                    }
                }
                BValue::Bytes(b) => {
                    if let Ok(s) = std::str::from_utf8(b) {
                        trackers.push(s.to_string());
                    }
                }
                _ => {}
            }
        }
    }

    let mut webseeds = Vec::new();
    if let Some(BValue::Bytes(u)) = dict.get("url-list") {
        if let Ok(s) = std::str::from_utf8(u) {
            if !s.is_empty() {
                webseeds.push(s.to_string());
            }
        }
    } else if let Some(BValue::List(list)) = dict.get("url-list") {
        for item in list {
            if let BValue::Bytes(b) = item {
                if let Ok(s) = std::str::from_utf8(b) {
                    if !s.is_empty() {
                        webseeds.push(s.to_string());
                    }
                }
            }
        }
    }

    let info = dict
        .get("info")
        .and_then(|v| v.as_dict())
        .ok_or_else(|| "缺少 info".to_string())?;

    let name = info
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown.torrent")
        .to_string();

    let mut files = Vec::new();
    let total_size;
    if let Some(BValue::List(file_list)) = info.get("files") {
        let mut sum = 0u64;
        for f in file_list {
            let fd = f.as_dict().ok_or_else(|| "files 项无效".to_string())?;
            let len = fd
                .get("length")
                .and_then(|v| v.as_int())
                .unwrap_or(0)
                .max(0) as u64;
            sum += len;
            let path = fd
                .get("path")
                .and_then(|v| v.as_list())
                .map(|parts| {
                    parts
                        .iter()
                        .filter_map(|p| p.as_str())
                        .collect::<Vec<_>>()
                        .join("/")
                })
                .unwrap_or_else(|| name.clone());
            files.push(ResolveFile {
                name: path.rsplit('/').next().unwrap_or(&path).to_string(),
                size: len,
                path: Some(path),
                selected: Some(true),
            });
        }
        total_size = sum;
    } else {
        total_size = info
            .get("length")
            .and_then(|v| v.as_int())
            .unwrap_or(0)
            .max(0) as u64;
        files.push(ResolveFile {
            name: name.clone(),
            size: total_size,
            path: Some(name.clone()),
            selected: Some(true),
        });
    }

    Ok(TorrentMeta {
        info_hash,
        name,
        total_size,
        files,
        webseeds,
        trackers,
    })
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// 扫描原始字节，找到 info 字典的完整 bencode 切片（含首尾）。
fn find_info_dict(data: &[u8]) -> Option<&[u8]> {
    let key = b"4:info";
    let mut i = 0;
    while i + key.len() < data.len() {
        if &data[i..i + key.len()] == key {
            let start = i + key.len();
            let end = skip_bencode(data, start)?;
            return Some(&data[start..end]);
        }
        i += 1;
    }
    None
}

fn skip_bencode(data: &[u8], mut i: usize) -> Option<usize> {
    if i >= data.len() {
        return None;
    }
    match data[i] {
        b'i' => {
            i += 1;
            while i < data.len() && data[i] != b'e' {
                i += 1;
            }
            if i < data.len() {
                Some(i + 1)
            } else {
                None
            }
        }
        b'l' | b'd' => {
            i += 1;
            while i < data.len() && data[i] != b'e' {
                i = skip_bencode(data, i)?;
            }
            if i < data.len() {
                Some(i + 1)
            } else {
                None
            }
        }
        b'0'..=b'9' => {
            let start = i;
            while i < data.len() && data[i] != b':' {
                i += 1;
            }
            if i >= data.len() {
                return None;
            }
            let len: usize = std::str::from_utf8(&data[start..i]).ok()?.parse().ok()?;
            i += 1;
            let end = i + len;
            if end <= data.len() {
                Some(end)
            } else {
                None
            }
        }
        _ => None,
    }
}

#[derive(Debug)]
enum BValue {
    Bytes(Vec<u8>),
    Int(i64),
    List(Vec<BValue>),
    Dict(HashMap<String, BValue>),
}

impl BValue {
    fn parse(data: &[u8]) -> Result<Self, String> {
        let (v, _) = Self::parse_at(data, 0)?;
        Ok(v)
    }

    fn parse_at(data: &[u8], i: usize) -> Result<(Self, usize), String> {
        if i >= data.len() {
            return Err("意外 EOF".into());
        }
        match data[i] {
            b'i' => {
                let mut j = i + 1;
                while j < data.len() && data[j] != b'e' {
                    j += 1;
                }
                if j >= data.len() {
                    return Err("整数未闭合".into());
                }
                let n: i64 = std::str::from_utf8(&data[i + 1..j])
                    .map_err(|e| e.to_string())?
                    .parse()
                    .map_err(|e: std::num::ParseIntError| e.to_string())?;
                Ok((BValue::Int(n), j + 1))
            }
            b'l' => {
                let mut j = i + 1;
                let mut list = Vec::new();
                while j < data.len() && data[j] != b'e' {
                    let (v, nj) = Self::parse_at(data, j)?;
                    list.push(v);
                    j = nj;
                }
                if j >= data.len() {
                    return Err("列表未闭合".into());
                }
                Ok((BValue::List(list), j + 1))
            }
            b'd' => {
                let mut j = i + 1;
                let mut dict = HashMap::new();
                while j < data.len() && data[j] != b'e' {
                    let (k, nj) = Self::parse_at(data, j)?;
                    let key = match k {
                        BValue::Bytes(b) => String::from_utf8_lossy(&b).into_owned(),
                        _ => return Err("字典键必须是字符串".into()),
                    };
                    let (v, nj2) = Self::parse_at(data, nj)?;
                    dict.insert(key, v);
                    j = nj2;
                }
                if j >= data.len() {
                    return Err("字典未闭合".into());
                }
                Ok((BValue::Dict(dict), j + 1))
            }
            b'0'..=b'9' => {
                let mut j = i;
                while j < data.len() && data[j] != b':' {
                    j += 1;
                }
                if j >= data.len() {
                    return Err("字节串长度未闭合".into());
                }
                let len: usize = std::str::from_utf8(&data[i..j])
                    .map_err(|e| e.to_string())?
                    .parse()
                    .map_err(|e: std::num::ParseIntError| e.to_string())?;
                let start = j + 1;
                let end = start + len;
                if end > data.len() {
                    return Err("字节串越界".into());
                }
                Ok((BValue::Bytes(data[start..end].to_vec()), end))
            }
            c => Err(format!("未知 bencode 标记: {}", c as char)),
        }
    }

    fn as_dict(&self) -> Option<&HashMap<String, BValue>> {
        match self {
            BValue::Dict(d) => Some(d),
            _ => None,
        }
    }

    fn as_list(&self) -> Option<&[BValue]> {
        match self {
            BValue::List(l) => Some(l),
            _ => None,
        }
    }

    fn as_str(&self) -> Option<&str> {
        match self {
            BValue::Bytes(b) => std::str::from_utf8(b).ok(),
            _ => None,
        }
    }

    fn as_int(&self) -> Option<i64> {
        match self {
            BValue::Int(n) => Some(*n),
            _ => None,
        }
    }
}

/// 创建 BT 任务：有 webseed 则走 HTTP；否则标记 waiting 并说明 peer 协议入队。
pub async fn start_bt_task(
    app: AppHandle,
    task_id: String,
    url: String,
    dest: PathBuf,
    connections: u32,
    headers: HashMap<String, String>,
    control: std::sync::Arc<TaskControl>,
) {
    let lower = url.to_ascii_lowercase();
    if lower.starts_with("magnet:") {
        match parse_magnet(&url) {
            Ok(m) => {
                update_task_progress(
                    &app,
                    &task_id,
                    0,
                    0,
                    TaskStatus::Waiting,
                    Some(format!(
                        "magnet info-hash={} 已入队；完整 peer 协议尚未激活",
                        m.info_hash
                    )),
                    None,
                );
                let _ = (dest, connections, headers, control);
            }
            Err(e) => {
                update_task_progress(&app, &task_id, 0, 0, TaskStatus::Error, Some(e), None);
            }
        }
        return;
    }

    // torrent 文件/URL
    let bytes = if url.starts_with("http://") || url.starts_with("https://") {
        match fetch_torrent_bytes(&url, &headers).await {
            Ok(b) => b,
            Err(e) => {
                update_task_progress(&app, &task_id, 0, 0, TaskStatus::Error, Some(e), None);
                return;
            }
        }
    } else {
        let path = url.strip_prefix("file://").unwrap_or(&url);
        match std::fs::read(path) {
            Ok(b) => b,
            Err(e) => {
                update_task_progress(
                    &app,
                    &task_id,
                    0,
                    0,
                    TaskStatus::Error,
                    Some(format!("读取 torrent 失败: {e}")),
                    None,
                );
                return;
            }
        }
    };

    let meta = match parse_torrent_bytes(&bytes) {
        Ok(m) => m,
        Err(e) => {
            update_task_progress(&app, &task_id, 0, 0, TaskStatus::Error, Some(e), None);
            return;
        }
    };

    if let Some(seed) = meta.webseeds.first() {
        // webseed：HTTP Range 下载第一个文件语义（单文件 torrent 最佳）
        let seed_url = if seed.ends_with('/') {
            format!("{}{}", seed, meta.name)
        } else {
            seed.clone()
        };
        http::run_http_download(
            app,
            task_id,
            seed_url,
            dest,
            connections.max(1),
            headers,
            control,
        )
        .await;
    } else {
        update_task_progress(
            &app,
            &task_id,
            0,
            meta.total_size,
            TaskStatus::Waiting,
            Some(format!(
                "torrent {} 已解析（{} bytes）；无 webseed，peer 协议入队等待引擎接入",
                meta.info_hash, meta.total_size
            )),
            None,
        );
        let _ = control;
    }
}
