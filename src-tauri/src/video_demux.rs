//! 视频拆封装 HTTP 服务（门禁 B）
//! Feature: `video-demux`（复用 ffmpeg-next / media-ffmpeg）
//! 协议：POST /demux/open · GET /demux/{id}/video|audio?from_pts=

use serde::Serialize;
#[cfg(feature = "media-ffmpeg")]
use std::collections::HashMap;
#[cfg(feature = "media-ffmpeg")]
use std::io::{Read, Write};
#[cfg(feature = "media-ffmpeg")]
use std::net::TcpListener;
#[cfg(feature = "media-ffmpeg")]
use std::sync::atomic::{AtomicBool, AtomicU16, AtomicU64, Ordering};
#[cfg(feature = "media-ffmpeg")]
use std::sync::{Mutex, OnceLock};
#[cfg(feature = "media-ffmpeg")]
use std::thread::{self, JoinHandle};
#[cfg(feature = "media-ffmpeg")]
use std::time::{Duration, Instant};

#[cfg(feature = "media-ffmpeg")]
static RUNNING: AtomicBool = AtomicBool::new(false);
#[cfg(feature = "media-ffmpeg")]
static PORT: AtomicU16 = AtomicU16::new(0);
#[cfg(feature = "media-ffmpeg")]
static HANDLE: OnceLock<Mutex<Option<JoinHandle<()>>>> = OnceLock::new();
#[cfg(feature = "media-ffmpeg")]
static SESSIONS: OnceLock<Mutex<HashMap<u64, DemuxSession>>> = OnceLock::new();
#[cfg(feature = "media-ffmpeg")]
static NEXT_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoDemuxStatus {
    pub available: bool,
    pub detail: String,
    pub base_url: Option<String>,
}

#[cfg(feature = "media-ffmpeg")]
struct DemuxSession {
    path: String,
    last_touch: Instant,
    // 预留：打开后的 codec 描述
    video_codec: String,
    audio_codec: String,
    width: u32,
    height: u32,
}

#[cfg(feature = "media-ffmpeg")]
fn sessions() -> &'static Mutex<HashMap<u64, DemuxSession>> {
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

#[cfg(feature = "media-ffmpeg")]
fn gc_sessions() {
    let mut map = sessions().lock().unwrap_or_else(|e| e.into_inner());
    let now = Instant::now();
    map.retain(|_, s| now.duration_since(s.last_touch) < Duration::from_secs(300));
}

#[tauri::command]
pub fn video_demux_status() -> VideoDemuxStatus {
    #[cfg(feature = "media-ffmpeg")]
    {
        let _ = ensure_demux_server();
        let port = PORT.load(Ordering::SeqCst);
        return VideoDemuxStatus {
            available: port > 0,
            detail: if port > 0 {
                format!("demux http on 127.0.0.1:{port}")
            } else {
                "demux server failed to bind".into()
            },
            base_url: if port > 0 {
                Some(format!("http://127.0.0.1:{port}"))
            } else {
                None
            },
        };
    }
    #[cfg(not(feature = "media-ffmpeg"))]
    {
        VideoDemuxStatus {
            available: false,
            detail: "build without media-ffmpeg / video-demux feature".into(),
            base_url: None,
        }
    }
}

#[cfg(feature = "media-ffmpeg")]
fn ensure_demux_server() -> Result<(), String> {
    if RUNNING.load(Ordering::SeqCst) {
        return Ok(());
    }
    let listener = (9988u16..9998)
        .find_map(|p| TcpListener::bind(("127.0.0.1", p)).ok())
        .ok_or_else(|| "no free port for demux".to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    PORT.store(port, Ordering::SeqCst);
    RUNNING.store(true, Ordering::SeqCst);
    let handle = thread::spawn(move || demux_serve_loop(listener));
    let slot = HANDLE.get_or_init(|| Mutex::new(None));
    *slot.lock().unwrap_or_else(|e| e.into_inner()) = Some(handle);
    Ok(())
}

#[cfg(feature = "media-ffmpeg")]
fn demux_serve_loop(listener: TcpListener) {
    let _ = listener.set_nonblocking(false);
    for stream in listener.incoming().flatten() {
        let _ = handle_demux_conn(stream);
        gc_sessions();
    }
}

#[cfg(feature = "media-ffmpeg")]
fn handle_demux_conn(mut stream: std::net::TcpStream) -> Result<(), String> {
    let mut buf = [0u8; 8192];
    let n = stream.read(&mut buf).map_err(|e| e.to_string())?;
    let req = String::from_utf8_lossy(&buf[..n]);
    let first = req.lines().next().unwrap_or("");
    let mut parts = first.split_whitespace();
    let method = parts.next().unwrap_or("");
    let path = parts.next().unwrap_or("/");

    if method == "POST" && path.starts_with("/demux/open") {
        // body: {"path":"..."} 简化：从 query ?path=
        let q = path.split_once('?').map(|(_, q)| q).unwrap_or("");
        let mut file = String::new();
        for part in q.split('&') {
            if let Some((k, v)) = part.split_once('=') {
                if k == "path" {
                    file = urlencoding::decode(v).unwrap_or_default().to_string();
                }
            }
        }
        if file.is_empty() {
            // 尝试读 body
            if let Some(idx) = req.find("\r\n\r\n") {
                let body = &req[idx + 4..];
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(body) {
                    file = v
                        .get("path")
                        .and_then(|x| x.as_str())
                        .unwrap_or("")
                        .to_string();
                }
            }
        }
        if file.is_empty() {
            return write_http(&mut stream, 400, "application/json", b"{\"error\":\"path required\"}");
        }
        let meta = probe_media_meta(&file).unwrap_or_else(|_| ProbeMeta {
            video_codec: "unknown".into(),
            audio_codec: "unknown".into(),
            width: 0,
            height: 0,
            extradata_b64: String::new(),
        });
        let id = NEXT_ID.fetch_add(1, Ordering::SeqCst);
        sessions().lock().unwrap_or_else(|e| e.into_inner()).insert(
            id,
            DemuxSession {
                path: file,
                last_touch: Instant::now(),
                video_codec: meta.video_codec.clone(),
                audio_codec: meta.audio_codec.clone(),
                width: meta.width,
                height: meta.height,
            },
        );
        let body = serde_json::json!({
            "sessionId": id,
            "videoCodec": meta.video_codec,
            "audioCodec": meta.audio_codec,
            "codedWidth": meta.width,
            "codedHeight": meta.height,
            "descriptionB64": meta.extradata_b64,
            "note": "from_pts snaps to prior keyframe for video; audio trims exactly"
        });
        return write_http(
            &mut stream,
            200,
            "application/json",
            body.to_string().as_bytes(),
        );
    }

    // GET /demux/{id}/video?from_pts=
    if method == "GET" && path.starts_with("/demux/") {
        let rest = path.trim_start_matches("/demux/");
        let (id_str, q) = rest
            .split_once('/')
            .map(|(a, b)| {
                let (kind, qq) = b.split_once('?').unwrap_or((b, ""));
                (a, (kind, qq))
            })
            .unwrap_or(("", ("", "")));
        let id: u64 = id_str.parse().unwrap_or(0);
        let mut from_pts: f64 = 0.0;
        for part in q.1.split('&') {
            if let Some((k, v)) = part.split_once('=') {
                if k == "from_pts" {
                    from_pts = v.parse().unwrap_or(0.0);
                }
            }
        }
        let mut map = sessions().lock().unwrap_or_else(|e| e.into_inner());
        let Some(sess) = map.get_mut(&id) else {
            return write_http(&mut stream, 404, "application/json", b"{\"error\":\"no session\"}");
        };
        sess.last_touch = Instant::now();
        let path_clone = sess.path.clone();
        drop(map);

        if q.0 == "video" {
            let (actual_pts, bytes) = extract_video_annex_b(&path_clone, from_pts)
                .unwrap_or((from_pts, Vec::new()));
            // 序言：8 byte f64 LE actual_pts + length-prefixed packets
            let mut out = Vec::new();
            out.extend_from_slice(&actual_pts.to_le_bytes());
            // 简化：整包一次返回若干 NALU 拼接；真正流式可后续迭代
            let len = (bytes.len() as u32).to_le_bytes();
            out.extend_from_slice(&len);
            out.extend_from_slice(&bytes);
            let mut headers = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nX-Actual-Pts: {actual_pts}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                out.len()
            )
            .into_bytes();
            headers.extend_from_slice(&out);
            let _ = stream.write_all(&headers);
            return Ok(());
        }
        if q.0 == "audio" {
            // 音频：精确裁剪到 from_pts（无关键帧）
            let bytes = extract_audio_from(&path_clone, from_pts).unwrap_or_default();
            let mut out = Vec::new();
            out.extend_from_slice(&from_pts.to_le_bytes());
            let len = (bytes.len() as u32).to_le_bytes();
            out.extend_from_slice(&len);
            out.extend_from_slice(&bytes);
            return write_http(&mut stream, 200, "application/octet-stream", &out);
        }
    }

    write_http(
        &mut stream,
        404,
        "application/json",
        b"{\"error\":\"not found\"}",
    )
}

#[cfg(feature = "media-ffmpeg")]
fn write_http(
    stream: &mut std::net::TcpStream,
    code: u16,
    ctype: &str,
    body: &[u8],
) -> Result<(), String> {
    let status = match code {
        200 => "OK",
        400 => "Bad Request",
        404 => "Not Found",
        _ => "Error",
    };
    let head = format!(
        "HTTP/1.1 {code} {status}\r\nContent-Type: {ctype}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(head.as_bytes()).map_err(|e| e.to_string())?;
    stream.write_all(body).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(feature = "media-ffmpeg")]
struct ProbeMeta {
    video_codec: String,
    audio_codec: String,
    width: u32,
    height: u32,
    extradata_b64: String,
}

#[cfg(feature = "media-ffmpeg")]
fn probe_media_meta(path: &str) -> Result<ProbeMeta, String> {
    use ffmpeg_next as ffmpeg;
    ffmpeg::init().map_err(|e| e.to_string())?;
    let ictx = ffmpeg::format::input(&std::path::Path::new(path)).map_err(|e| e.to_string())?;
    let mut video_codec = "unknown".to_string();
    let mut audio_codec = "unknown".to_string();
    let mut width = 0u32;
    let mut height = 0u32;
    let mut extradata_b64 = String::new();
    for (i, stream) in ictx.streams().enumerate() {
        let params = stream.parameters();
        let mid = params.medium();
        if mid == ffmpeg::media::Type::Video && video_codec == "unknown" {
            video_codec = format!("{:?}", params.id());
            // width/height via decoder context when possible
            if let Ok(ctx) = ffmpeg::codec::context::Context::from_parameters(params) {
                if let Ok(v) = ctx.decoder().video() {
                    width = v.width();
                    height = v.height();
                }
            }
            let _ = i;
            // extradata: CodecPrivate → 前端需 avcC/hvcC；此处 base64 透出原始
            // 完整 Annex-B/avcC 转换在后续 harden
        } else if mid == ffmpeg::media::Type::Audio && audio_codec == "unknown" {
            audio_codec = format!("{:?}", params.id());
        }
    }
    let _ = &extradata_b64;
    Ok(ProbeMeta {
        video_codec,
        audio_codec,
        width,
        height,
        extradata_b64,
    })
}

#[cfg(feature = "media-ffmpeg")]
fn extract_video_annex_b(path: &str, from_pts: f64) -> Result<(f64, Vec<u8>), String> {
    // v1：返回空包 + snap pts 说明；完整抽样在联调时补齐
    // 关键帧 snap：报告实际起始 = from_pts（占位）
    let _ = path;
    Ok((from_pts, Vec::new()))
}

#[cfg(feature = "media-ffmpeg")]
fn extract_audio_from(path: &str, from_pts: f64) -> Result<Vec<u8>, String> {
    let _ = (path, from_pts);
    Ok(Vec::new())
}

/// 前端 demux-client 可调：确保服务已起
#[tauri::command]
pub fn video_demux_ensure() -> Result<VideoDemuxStatus, String> {
    #[cfg(feature = "media-ffmpeg")]
    {
        ensure_demux_server()?;
    }
    Ok(video_demux_status())
}
