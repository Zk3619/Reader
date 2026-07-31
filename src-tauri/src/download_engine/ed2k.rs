//! ED2K：解析 + 内置传输内核。
//! - 链接内 `sources` 若含 http(s) → 走 HTTP 引擎
//! - 否则对 server list 做 TCP 找源
//! - peer：OP_HELLO → FileRequest → StartUpload → OP_REQUESTPARTS / OP_SENDINGPART 分片下载

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use tauri::AppHandle;
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};
use tokio::net::TcpStream;

use super::http;
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

    let body = raw[7..].trim_start_matches('/');
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
            if filehash.len() != 32 && filehash.len() != 40 {
                return Err(format!("无效 filehash 长度: {}", filehash.len()));
            }
            let mut sources = Vec::new();
            let mut root_hash = None;
            for extra in parts.iter().skip(4) {
                let e = *extra;
                if e.len() == 32 && e.chars().all(|c| c.is_ascii_hexdigit()) {
                    root_hash = Some(e.to_ascii_uppercase());
                } else if e.contains("sources") || e.contains(',') || e.contains(':') {
                    for s in e.split(|c| c == ',' || c == ';') {
                        let t = s.trim();
                        if !t.is_empty() && t != "sources" {
                            sources.push(t.to_string());
                        }
                    }
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
                return Err("ed2k server 链接字段不足".into());
            }
            let host = parts[1].to_string();
            let port: u16 = parts[2]
                .parse()
                .map_err(|_| format!("无效端口: {}", parts[2]))?;
            Ok(Ed2kLink::Server(Ed2kServerLink { host, port, raw }))
        }
        _ => Err(format!("未知 ed2k 类型: {kind}")),
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
                "fileHash": f.filehash,
                "sources": f.sources,
                "rootHash": f.root_hash,
                "kind": "file",
            }),
        }),
        Ed2kLink::Server(s) => Ok(ResolveResult {
            protocol: "ed2k".into(),
            url: s.raw.clone(),
            name: Some(format!("server:{}:{}", s.host, s.port)),
            size: None,
            hash: None,
            files: vec![],
            resumable: false,
            meta: serde_json::json!({
                "kind": "server",
                "host": s.host,
                "port": s.port,
            }),
        }),
    }
}

pub async fn start_ed2k_task(
    app: AppHandle,
    task_id: String,
    url: String,
    dest: PathBuf,
    headers: HashMap<String, String>,
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

    // 1) 链接内 HTTP(S) sources → 直接走 HTTP 引擎
    for src in &parsed.sources {
        let s = src.trim();
        if s.starts_with("http://") || s.starts_with("https://") {
            let out = if dest.is_dir() || dest.extension().is_none() {
                dest.join(super::sanitize_filename(&parsed.filename))
            } else {
                dest.clone()
            };
            http::run_http_download_with_opts(
                app,
                task_id,
                s.to_string(),
                out,
                8,
                headers,
                control,
                super::HttpClientOpts::default(),
            )
            .await;
            return;
        }
    }

    if server_list.is_empty() && parsed.sources.is_empty() {
        update_task_progress(
            &app,
            &task_id,
            0,
            parsed.filesize,
            TaskStatus::Error,
            Some("无 ED2K 服务器列表且链接未含 sources；请配置 server list 后再试".into()),
            None,
        );
        return;
    }

    // 2) 向 server 询源
    let hash_bytes = match hex_decode_hash(&parsed.filehash) {
        Ok(b) => b,
        Err(e) => {
            update_task_progress(&app, &task_id, 0, parsed.filesize, TaskStatus::Error, Some(e), None);
            return;
        }
    };

    let mut peers: Vec<(String, u16)> = Vec::new();
    for src in &parsed.sources {
        if let Some((h, p)) = parse_host_port(src) {
            peers.push((h, p));
        }
    }

    update_task_progress(
        &app,
        &task_id,
        0,
        parsed.filesize,
        TaskStatus::Running,
        None,
        Some(dest.to_string_lossy().into_owned()),
    );

    for srv in &server_list {
        if control.is_cancelled() {
            break;
        }
        if let Some((host, port)) = parse_server_entry(srv) {
            match query_sources_from_server(&host, port, &hash_bytes, parsed.filesize).await {
                Ok(found) => peers.extend(found),
                Err(e) => {
                    log::warn!("ed2k server {host}:{port} 找源失败: {e}");
                }
            }
        }
    }

    peers.sort();
    peers.dedup();

    if peers.is_empty() {
        update_task_progress(
            &app,
            &task_id,
            0,
            parsed.filesize,
            TaskStatus::Error,
            Some(format!(
                "ED2K 未找到可用源（hash={} servers={}）。内置内核已尝试 server 询源",
                parsed.filehash,
                server_list.len()
            )),
            None,
        );
        return;
    }

    // 3) 尝试从第一个 peer 拉取（最小 OP_REQUESTPARTS 子集）
    let out = if dest.is_dir() || dest.extension().is_none() {
        dest.join(super::sanitize_filename(&parsed.filename))
    } else {
        dest
    };

    match download_from_peers(&app, &task_id, &peers, &hash_bytes, parsed.filesize, &out, &control)
        .await
    {
        Ok(()) => {}
        Err(e) => {
            update_task_progress(
                &app,
                &task_id,
                0,
                parsed.filesize,
                TaskStatus::Error,
                Some(format!(
                    "ED2K peer 传输失败（找到 {} 源）: {e}",
                    peers.len()
                )),
                None,
            );
        }
    }
}

fn hex_decode_hash(s: &str) -> Result<[u8; 16], String> {
    let clean: String = s.chars().filter(|c| c.is_ascii_hexdigit()).collect();
    if clean.len() < 32 {
        return Err("filehash 过短".into());
    }
    let mut out = [0u8; 16];
    for i in 0..16 {
        out[i] = u8::from_str_radix(&clean[i * 2..i * 2 + 2], 16)
            .map_err(|e| format!("hash 解析失败: {e}"))?;
    }
    Ok(out)
}

fn parse_host_port(s: &str) -> Option<(String, u16)> {
    let s = s.trim().trim_start_matches("ed2k://");
    if let Some((h, p)) = s.rsplit_once(':') {
        let port: u16 = p.parse().ok()?;
        if !h.is_empty() {
            return Some((h.to_string(), port));
        }
    }
    None
}

fn parse_server_entry(s: &str) -> Option<(String, u16)> {
    let t = s.trim();
    if t.to_ascii_lowercase().starts_with("ed2k://") {
        if let Ok(Ed2kLink::Server(srv)) = parse_ed2k(t) {
            return Some((srv.host, srv.port));
        }
    }
    parse_host_port(t)
}

const PROTO_EDONKEY: u8 = 0xe3;
const OP_LOGINREQUEST: u8 = 0x01;
const OP_GETSOURCES: u8 = 0x19;
const OP_FOUNDSOURCES: u8 = 0x42;
const OP_SERVERMESSAGE: u8 = 0x38;
const OP_IDCHANGE: u8 = 0x40;
const OP_REJECT: u8 = 0x05;

async fn write_packet(stream: &mut TcpStream, opcode: u8, payload: &[u8]) -> Result<(), String> {
    let size = (payload.len() + 1) as u32;
    stream
        .write_all(&[PROTO_EDONKEY])
        .await
        .map_err(|e| e.to_string())?;
    stream
        .write_all(&size.to_le_bytes())
        .await
        .map_err(|e| e.to_string())?;
    stream.write_all(&[opcode]).await.map_err(|e| e.to_string())?;
    stream.write_all(payload).await.map_err(|e| e.to_string())?;
    Ok(())
}

async fn read_packet(stream: &mut TcpStream) -> Result<(u8, Vec<u8>), String> {
    let mut hdr = [0u8; 5];
    stream.read_exact(&mut hdr).await.map_err(|e| e.to_string())?;
    if hdr[0] != PROTO_EDONKEY {
        return Err(format!("非 eDonkey 协议: {:#x}", hdr[0]));
    }
    let size = u32::from_le_bytes([hdr[1], hdr[2], hdr[3], hdr[4]]) as usize;
    if size == 0 || size > 2 * 1024 * 1024 {
        return Err(format!("异常包长: {size}"));
    }
    let mut body = vec![0u8; size];
    stream.read_exact(&mut body).await.map_err(|e| e.to_string())?;
    let opcode = body[0];
    Ok((opcode, body[1..].to_vec()))
}

async fn query_sources_from_server(
    host: &str,
    port: u16,
    hash: &[u8; 16],
    filesize: u64,
) -> Result<Vec<(String, u16)>, String> {
    let addr = format!("{host}:{port}");
    let mut stream = tokio::time::timeout(
        std::time::Duration::from_secs(8),
        TcpStream::connect(&addr),
    )
    .await
    .map_err(|_| "连接服务器超时".to_string())?
    .map_err(|e| format!("连接失败: {e}"))?;

    // 最小 login：hash(16)+id(4)+port(2)+tag count — 很多服务器接受空/短登录后仍回 IDCHANGE
    let mut login = Vec::new();
    login.extend_from_slice(hash); // user hash placeholder
    login.extend_from_slice(&0u32.to_le_bytes()); // client id
    login.extend_from_slice(&4662u16.to_le_bytes()); // tcp port
    login.extend_from_slice(&0u32.to_le_bytes()); // tag count
    let _ = write_packet(&mut stream, OP_LOGINREQUEST, &login).await;

    // 读若干响应
    for _ in 0..6 {
        let Ok(Ok((op, _payload))) =
            tokio::time::timeout(std::time::Duration::from_secs(3), read_packet(&mut stream)).await
        else {
            break;
        };
        if op == OP_IDCHANGE || op == OP_SERVERMESSAGE || op == OP_REJECT {
            break;
        }
    }

    let mut req = Vec::new();
    req.extend_from_slice(hash);
    req.extend_from_slice(&filesize.to_le_bytes()[..4]); // 低 4 字节兼容
    write_packet(&mut stream, OP_GETSOURCES, &req).await?;

    let mut peers = Vec::new();
    for _ in 0..8 {
        let Ok(Ok((op, payload))) =
            tokio::time::timeout(std::time::Duration::from_secs(4), read_packet(&mut stream)).await
        else {
            break;
        };
        if op == OP_FOUNDSOURCES {
            // hash(16) + count(1) + entries(6 each: ip4 + port)
            if payload.len() < 17 {
                continue;
            }
            let count = payload[16] as usize;
            let mut off = 17;
            for _ in 0..count {
                if off + 6 > payload.len() {
                    break;
                }
                let ip = format!(
                    "{}.{}.{}.{}",
                    payload[off],
                    payload[off + 1],
                    payload[off + 2],
                    payload[off + 3]
                );
                let port = u16::from_le_bytes([payload[off + 4], payload[off + 5]]);
                if port > 0 {
                    peers.push((ip, port));
                }
                off += 6;
            }
            break;
        }
    }
    Ok(peers)
}

// Client↔Client opcodes (eDonkey 0xE3)
const OP_HELLO: u8 = 0x01;
const OP_HELLOANSWER: u8 = 0x4c;
const OP_SENDINGPART: u8 = 0x46;
const OP_REQUESTPARTS: u8 = 0x47;
const OP_FILEREQANSNOFIL: u8 = 0x48;
const OP_FILESTATUS: u8 = 0x50;
const OP_STARTUPLOADREQ: u8 = 0x54;
const OP_ACCEPTUPLOADREQ: u8 = 0x55;
const OP_SETREQFILEID: u8 = 0x4e;
const OP_FILEREQUEST: u8 = 0x58;
const OP_FILEREQANSWER: u8 = 0x59;
const OP_QUEUERANKING: u8 = 0x5c;
/// eMule extended (0xC5)
const PROTO_EMULE: u8 = 0xc5;
const OP_COMPRESSEDPART: u8 = 0x40;
const OP_SENDINGPART_I64: u8 = 0xa5;
const OP_REQUESTPARTS_I64: u8 = 0xa4;

const CHUNK_SIZE: u64 = 180 * 1024;

async fn download_from_peers(
    app: &AppHandle,
    task_id: &str,
    peers: &[(String, u16)],
    hash: &[u8; 16],
    filesize: u64,
    dest: &PathBuf,
    control: &Arc<TaskControl>,
) -> Result<(), String> {
    let mut last_err = String::from("无可用 peer");
    for (host, port) in peers.iter().take(12) {
        if control.is_cancelled() {
            return Err("已取消".into());
        }
        update_task_progress(
            app,
            task_id,
            0,
            filesize,
            TaskStatus::Running,
            Some(format!("ED2K peer {host}:{port}")),
            Some(dest.to_string_lossy().into_owned()),
        );
        match download_from_one_peer(app, task_id, host, *port, hash, filesize, dest, control).await
        {
            Ok(()) => return Ok(()),
            Err(e) => {
                log::warn!("ed2k peer {host}:{port} 失败: {e}");
                last_err = format!("{host}:{port}: {e}");
            }
        }
    }
    Err(format!(
        "ED2K 分片下载失败（尝试 {} 个 peer）: {last_err}",
        peers.len().min(12)
    ))
}

async fn download_from_one_peer(
    app: &AppHandle,
    task_id: &str,
    host: &str,
    port: u16,
    hash: &[u8; 16],
    filesize: u64,
    dest: &PathBuf,
    control: &Arc<TaskControl>,
) -> Result<(), String> {
    let mut stream = tokio::time::timeout(
        std::time::Duration::from_secs(8),
        TcpStream::connect((host, port)),
    )
    .await
    .map_err(|_| "连接超时".to_string())?
    .map_err(|e| format!("连接失败: {e}"))?;

    // 1) Hello ↔ HelloAnswer
    write_packet(&mut stream, OP_HELLO, &build_hello_payload()).await?;
    let mut got_hello_answer = false;
    for _ in 0..8 {
        let Ok(Ok((op, payload))) =
            tokio::time::timeout(std::time::Duration::from_secs(5), read_packet_any(&mut stream))
                .await
        else {
            break;
        };
        if op == OP_HELLO {
            // 对称握手：回 HelloAnswer
            let _ = write_packet(&mut stream, OP_HELLOANSWER, &build_hello_answer_payload()).await;
        } else if op == OP_HELLOANSWER {
            got_hello_answer = true;
            let _ = payload;
            break;
        }
    }
    if !got_hello_answer {
        return Err("未收到 HelloAnswer".into());
    }

    // 2) FileRequest → FileReqAnswer
    write_packet(&mut stream, OP_FILEREQUEST, hash).await?;
    {
        let (op, _) = tokio::time::timeout(
            std::time::Duration::from_secs(8),
            read_packet_any(&mut stream),
        )
        .await
        .map_err(|_| "FileRequest 超时".to_string())?
        .map_err(|e| e)?;
        if op == OP_FILEREQANSNOFIL {
            return Err("peer 无此文件".into());
        }
        if op != OP_FILEREQANSWER && op != OP_FILESTATUS {
            // 部分客户端先回 status / 继续
            log::debug!("ed2k FileRequest 响应 opcode={op:#x}");
        }
    }

    // 3) SetReqFileID → FileStatus
    write_packet(&mut stream, OP_SETREQFILEID, hash).await?;
    let _ = tokio::time::timeout(std::time::Duration::from_secs(6), async {
        loop {
            let (op, _) = read_packet_any(&mut stream).await?;
            if op == OP_FILESTATUS || op == OP_FILEREQANSWER {
                return Ok::<(), String>(());
            }
            if op == OP_FILEREQANSNOFIL {
                return Err("peer 无此文件 (status)".into());
            }
        }
    })
    .await
    .map_err(|_| "FileStatus 超时".to_string())??;

    // 4) StartUploadReq → AcceptUploadReq
    write_packet(&mut stream, OP_STARTUPLOADREQ, hash).await?;
    {
        let (op, payload) = tokio::time::timeout(
            std::time::Duration::from_secs(10),
            read_packet_any(&mut stream),
        )
        .await
        .map_err(|_| "StartUpload 超时".to_string())?
        .map_err(|e| e)?;
        if op == OP_QUEUERANKING || (op == 0x60 && !payload.is_empty()) {
            return Err("peer 队列中，稍后再试".into());
        }
        if op != OP_ACCEPTUPLOADREQ {
            // 有的客户端直接开始发 part；仍继续请求
            log::debug!("ed2k AcceptUpload 非标准 opcode={op:#x}");
        }
    }

    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("创建目录失败: {e}"))?;
    }
    let mut file = tokio::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(dest)
        .await
        .map_err(|e| format!("打开目标文件失败: {e}"))?;
    // 预分配（尽力）
    let _ = file.set_len(filesize).await;

    let use64 = filesize > u32::MAX as u64;
    let mut offset: u64 = 0;
    while offset < filesize {
        if control.is_cancelled() {
            return Err("已取消".into());
        }
        let end = (offset + CHUNK_SIZE).min(filesize);
        if use64 {
            write_emule_packet(
                &mut stream,
                OP_REQUESTPARTS_I64,
                &build_request_parts64(hash, offset, end),
            )
            .await?;
        } else {
            write_packet(
                &mut stream,
                OP_REQUESTPARTS,
                &build_request_parts32(hash, offset as u32, end as u32),
            )
            .await?;
        }

        let mut got = false;
        for _ in 0..12 {
            let (proto, op, payload) = tokio::time::timeout(
                std::time::Duration::from_secs(20),
                read_packet_full(&mut stream),
            )
            .await
            .map_err(|_| "等待 SENDINGPART 超时".to_string())?
            .map_err(|e| e)?;

            if op == OP_QUEUERANKING {
                return Err("下载中被加入队列".into());
            }

            let part = if proto == PROTO_EDONKEY && op == OP_SENDINGPART {
                parse_sending_part32(&payload)?
            } else if proto == PROTO_EMULE && (op == OP_SENDINGPART_I64 || op == OP_COMPRESSEDPART) {
                // 压缩分片暂不解码：若是 I64 非压缩则可用
                if op == OP_SENDINGPART_I64 {
                    parse_sending_part64(&payload)?
                } else {
                    return Err("peer 返回压缩分片（暂未解压），请换源".into());
                }
            } else {
                continue;
            };

            let (begin, end_pos, data) = part;
            if begin > filesize || end_pos > filesize || end_pos < begin {
                return Err(format!("非法分片范围 {begin}-{end_pos}"));
            }
            file.seek(std::io::SeekFrom::Start(begin))
                .await
                .map_err(|e| e.to_string())?;
            file.write_all(&data).await.map_err(|e| e.to_string())?;
            offset = offset.max(end_pos);
            got = true;
            update_task_progress(
                app,
                task_id,
                offset,
                filesize,
                TaskStatus::Running,
                None,
                Some(dest.to_string_lossy().into_owned()),
            );
            break;
        }
        if !got {
            return Err(format!("分片 {offset} 未收到数据"));
        }
    }

    file.flush().await.map_err(|e| e.to_string())?;
    update_task_progress(
        app,
        task_id,
        filesize,
        filesize,
        TaskStatus::Done,
        None,
        Some(dest.to_string_lossy().into_owned()),
    );
    Ok(())
}

fn build_hello_payload() -> Vec<u8> {
    // hash_len(1) + hash(16) + client_id(4) + port(2) + tag_count(4) + tags + server_ip(4) + server_port(2)
    let mut user_hash = [0u8; 16];
    for (i, b) in user_hash.iter_mut().enumerate() {
        *b = (0xA0 + i as u8) ^ 0x5C;
    }
    user_hash[5] = 14;
    user_hash[14] = 111;
    let mut out = Vec::with_capacity(64);
    out.push(16u8);
    out.extend_from_slice(&user_hash);
    out.extend_from_slice(&0u32.to_le_bytes());
    out.extend_from_slice(&4662u16.to_le_bytes());
    // tags: nickname + version
    let nick = b"Reader";
    let mut tags = Vec::new();
    // string tag name=0x01
    tags.push(0x02u8);
    tags.extend_from_slice(&1u16.to_le_bytes());
    tags.push(0x01);
    tags.extend_from_slice(&(nick.len() as u16).to_le_bytes());
    tags.extend_from_slice(nick);
    // int tag name=0x11 version=60
    tags.push(0x03u8);
    tags.extend_from_slice(&1u16.to_le_bytes());
    tags.push(0x11);
    tags.extend_from_slice(&60u32.to_le_bytes());
    out.extend_from_slice(&2u32.to_le_bytes());
    out.extend_from_slice(&tags);
    out.extend_from_slice(&0u32.to_le_bytes()); // server ip
    out.extend_from_slice(&0u16.to_le_bytes()); // server port
    out
}

fn build_hello_answer_payload() -> Vec<u8> {
    // HelloAnswer = Hello without leading hash_len
    let hello = build_hello_payload();
    hello[1..].to_vec()
}

fn build_request_parts32(hash: &[u8; 16], begin: u32, end: u32) -> Vec<u8> {
    let mut out = Vec::with_capacity(16 + 24);
    out.extend_from_slice(hash);
    // 3 begins
    out.extend_from_slice(&begin.to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes());
    // 3 ends
    out.extend_from_slice(&end.to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes());
    out
}

fn build_request_parts64(hash: &[u8; 16], begin: u64, end: u64) -> Vec<u8> {
    let mut out = Vec::with_capacity(16 + 48);
    out.extend_from_slice(hash);
    out.extend_from_slice(&begin.to_le_bytes());
    out.extend_from_slice(&0u64.to_le_bytes());
    out.extend_from_slice(&0u64.to_le_bytes());
    out.extend_from_slice(&end.to_le_bytes());
    out.extend_from_slice(&0u64.to_le_bytes());
    out.extend_from_slice(&0u64.to_le_bytes());
    out
}

fn parse_sending_part32(payload: &[u8]) -> Result<(u64, u64, Vec<u8>), String> {
    if payload.len() < 24 {
        return Err("SENDINGPART 过短".into());
    }
    let begin = u32::from_le_bytes(payload[16..20].try_into().unwrap()) as u64;
    let end = u32::from_le_bytes(payload[20..24].try_into().unwrap()) as u64;
    if end < begin {
        return Err("SENDINGPART 范围非法".into());
    }
    let need = (end - begin) as usize;
    if payload.len() < 24 + need {
        return Err(format!(
            "SENDINGPART 数据不足: have={} need={}",
            payload.len() - 24,
            need
        ));
    }
    Ok((begin, end, payload[24..24 + need].to_vec()))
}

fn parse_sending_part64(payload: &[u8]) -> Result<(u64, u64, Vec<u8>), String> {
    if payload.len() < 32 {
        return Err("SENDINGPART64 过短".into());
    }
    let begin = u64::from_le_bytes(payload[16..24].try_into().unwrap());
    let end = u64::from_le_bytes(payload[24..32].try_into().unwrap());
    if end < begin {
        return Err("SENDINGPART64 范围非法".into());
    }
    let need = (end - begin) as usize;
    if payload.len() < 32 + need {
        return Err("SENDINGPART64 数据不足".into());
    }
    Ok((begin, end, payload[32..32 + need].to_vec()))
}

async fn write_emule_packet(stream: &mut TcpStream, opcode: u8, payload: &[u8]) -> Result<(), String> {
    let size = (payload.len() + 1) as u32;
    stream
        .write_all(&[PROTO_EMULE])
        .await
        .map_err(|e| e.to_string())?;
    stream
        .write_all(&size.to_le_bytes())
        .await
        .map_err(|e| e.to_string())?;
    stream.write_all(&[opcode]).await.map_err(|e| e.to_string())?;
    stream.write_all(payload).await.map_err(|e| e.to_string())?;
    Ok(())
}

async fn read_packet_any(stream: &mut TcpStream) -> Result<(u8, Vec<u8>), String> {
    let (_proto, op, payload) = read_packet_full(stream).await?;
    Ok((op, payload))
}

async fn read_packet_full(stream: &mut TcpStream) -> Result<(u8, u8, Vec<u8>), String> {
    let mut hdr = [0u8; 5];
    stream.read_exact(&mut hdr).await.map_err(|e| e.to_string())?;
    let proto = hdr[0];
    if proto != PROTO_EDONKEY && proto != PROTO_EMULE {
        return Err(format!("非 eDonkey/eMule 协议: {proto:#x}"));
    }
    let size = u32::from_le_bytes([hdr[1], hdr[2], hdr[3], hdr[4]]) as usize;
    // SENDINGPART 可较大：放宽至 4MiB
    if size == 0 || size > 4 * 1024 * 1024 {
        return Err(format!("异常包长: {size}"));
    }
    let mut body = vec![0u8; size];
    stream.read_exact(&mut body).await.map_err(|e| e.to_string())?;
    let opcode = body[0];
    Ok((proto, opcode, body[1..].to_vec()))
}
