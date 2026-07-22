//! 影视播放：外置 mpv IPC 尽力查询 + libmpv2 增强核（feature `video-libmpv`）
//! @see docs/VIDEO_PLAYBACK_KERNEL.md / VIDEO_LIBMPV_LICENSE.md

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoLibmpvStatus {
    pub available: bool,
    pub feature_enabled: bool,
    pub detail: String,
}

/// 尽力通过 IPC 读取 time-pos。未实现完整 JSON IPC 客户端时返回 None（不报错）。
#[tauri::command]
pub async fn video_mpv_ipc_get_time_pos(ipc_path: String) -> Result<Option<f64>, String> {
    if ipc_path.trim().is_empty() {
        return Ok(None);
    }
    // 完整 named-pipe / unix-socket JSON IPC 在后续迭代补齐；E1 保证命令存在且安全降级
    let _ = ipc_path;
    Ok(None)
}

#[tauri::command]
pub async fn video_libmpv_status() -> Result<VideoLibmpvStatus, String> {
    #[cfg(all(
        feature = "video-libmpv",
        not(any(target_os = "android", target_os = "ios"))
    ))]
    {
        Ok(libmpv_session::probe_status())
    }
    #[cfg(all(
        feature = "video-libmpv",
        any(target_os = "android", target_os = "ios")
    ))]
    {
        Ok(VideoLibmpvStatus {
            available: false,
            feature_enabled: true,
            detail: "video-libmpv is desktop-only; use Android Activity path".into(),
        })
    }
    #[cfg(not(feature = "video-libmpv"))]
    {
        Ok(VideoLibmpvStatus {
            available: false,
            feature_enabled: false,
            detail: "Build with --features video-libmpv to enable embedded libmpv (see VIDEO_LIBMPV_LICENSE.md)".into(),
        })
    }
}

/// 打开桌面增强播放窗（libmpv2 自建 VO 窗 / loadfile）。
#[tauri::command]
pub async fn video_libmpv_open_window(
    url: String,
    title: Option<String>,
    start_sec: Option<f64>,
    subtitle: Option<String>,
    glsl_shaders: Option<String>,
) -> Result<(), String> {
    if url.trim().is_empty() {
        return Err("无播放地址".into());
    }
    #[cfg(all(
        feature = "video-libmpv",
        not(any(target_os = "android", target_os = "ios"))
    ))]
    {
        let url = url.clone();
        tauri::async_runtime::spawn_blocking(move || {
            libmpv_session::open_playback(
                url,
                title,
                start_sec,
                subtitle,
                glsl_shaders,
            )
        })
        .await
        .map_err(|e| format!("libmpv task join: {e}"))?
    }
    #[cfg(all(
        feature = "video-libmpv",
        any(target_os = "android", target_os = "ios")
    ))]
    {
        let _ = (title, start_sec, subtitle, glsl_shaders, url);
        Err("桌面 libmpv 窗在移动端不可用，请用 video_android_open_player".into())
    }
    #[cfg(not(feature = "video-libmpv"))]
    {
        let _ = (title, start_sec, subtitle, glsl_shaders, url);
        Err("libmpv 未编译进本构建（需 feature video-libmpv）".into())
    }
}

#[tauri::command]
pub async fn video_libmpv_pause(paused: bool) -> Result<(), String> {
    #[cfg(all(
        feature = "video-libmpv",
        not(any(target_os = "android", target_os = "ios"))
    ))]
    {
        tauri::async_runtime::spawn_blocking(move || libmpv_session::set_pause(paused))
            .await
            .map_err(|e| format!("libmpv task join: {e}"))?
    }
    #[cfg(not(all(
        feature = "video-libmpv",
        not(any(target_os = "android", target_os = "ios"))
    )))]
    {
        let _ = paused;
        Err("libmpv 未启用或非桌面构建".into())
    }
}

#[tauri::command]
pub async fn video_libmpv_seek(sec: f64) -> Result<(), String> {
    #[cfg(all(
        feature = "video-libmpv",
        not(any(target_os = "android", target_os = "ios"))
    ))]
    {
        tauri::async_runtime::spawn_blocking(move || libmpv_session::seek_absolute(sec))
            .await
            .map_err(|e| format!("libmpv task join: {e}"))?
    }
    #[cfg(not(all(
        feature = "video-libmpv",
        not(any(target_os = "android", target_os = "ios"))
    )))]
    {
        let _ = sec;
        Err("libmpv 未启用或非桌面构建".into())
    }
}

#[tauri::command]
pub async fn video_libmpv_get_time_pos() -> Result<f64, String> {
    #[cfg(all(
        feature = "video-libmpv",
        not(any(target_os = "android", target_os = "ios"))
    ))]
    {
        tauri::async_runtime::spawn_blocking(libmpv_session::get_time_pos)
            .await
            .map_err(|e| format!("libmpv task join: {e}"))?
    }
    #[cfg(not(all(
        feature = "video-libmpv",
        not(any(target_os = "android", target_os = "ios"))
    )))]
    {
        Err("libmpv 未启用或非桌面构建".into())
    }
}

#[tauri::command]
pub async fn video_libmpv_close() -> Result<(), String> {
    #[cfg(all(
        feature = "video-libmpv",
        not(any(target_os = "android", target_os = "ios"))
    ))]
    {
        tauri::async_runtime::spawn_blocking(libmpv_session::close)
            .await
            .map_err(|e| format!("libmpv task join: {e}"))?
    }
    #[cfg(not(all(
        feature = "video-libmpv",
        not(any(target_os = "android", target_os = "ios"))
    )))]
    {
        Ok(())
    }
}

/// Android：请求以指定引擎打开全屏播放页（libmpv | media3）
#[tauri::command]
pub async fn video_android_open_player(
    engine: String,
    url: String,
    title: Option<String>,
) -> Result<(), String> {
    if url.trim().is_empty() {
        return Err("无播放地址".into());
    }
    let eng = engine.to_lowercase();
    if eng != "libmpv" && eng != "media3" {
        return Err(format!("unsupported android engine: {engine}"));
    }
    #[cfg(target_os = "android")]
    {
        let _ = title;
        Err(format!(
            "Android {eng} Activity pending plugin wire-up for url length {}",
            url.len()
        ))
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = title;
        Err("video_android_open_player 仅 Android 可用".into())
    }
}

#[cfg(all(
    feature = "video-libmpv",
    not(any(target_os = "android", target_os = "ios"))
))]
mod libmpv_session {
    use super::VideoLibmpvStatus;
    use libmpv2::Mpv;
    use std::sync::Mutex;

    static SESSION: Mutex<Option<Mpv>> = Mutex::new(None);

    fn lock_session() -> Result<std::sync::MutexGuard<'static, Option<Mpv>>, String> {
        SESSION
            .lock()
            .map_err(|_| "libmpv session lock poisoned".into())
    }

    pub fn probe_status() -> VideoLibmpvStatus {
        match Mpv::with_initializer(|init| {
            // 探测不弹窗
            let _ = init.set_option("video", "no");
            let _ = init.set_option("audio", "no");
            Ok(())
        }) {
            Ok(_mpv) => VideoLibmpvStatus {
                available: true,
                feature_enabled: true,
                detail: "libmpv2 linked; runtime probe OK (install libmpv 2.x DLL on PATH or bundle under resources/)".into(),
            },
            Err(e) => VideoLibmpvStatus {
                available: false,
                feature_enabled: true,
                detail: format!(
                    "video-libmpv compiled but libmpv init failed: {e}. Ensure libmpv-2.dll / libmpv.so is discoverable."
                ),
            },
        }
    }

    pub fn open_playback(
        url: String,
        title: Option<String>,
        start_sec: Option<f64>,
        subtitle: Option<String>,
        glsl_shaders: Option<String>,
    ) -> Result<(), String> {
        let mut guard = lock_session()?;
        // 关闭旧会话
        *guard = None;

        let mpv = Mpv::with_initializer(|init| {
            // 独立 VO 窗（非嵌入主壳）；idle 保持进程
            init.set_option("force-window", "immediate")?;
            init.set_option("keep-open", "yes")?;
            init.set_option("osc", "yes")?;
            Ok(())
        })
        .map_err(|e| {
            format!(
                "创建 libmpv 失败（缺 DLL/ABI？）: {e}. 开发机请安装 mpv/libmpv 2.x 或将 DLL 放到 PATH / resources/"
            )
        })?;

        if let Some(ref t) = title {
            let t = t.trim();
            if !t.is_empty() {
                let _ = mpv.set_property("force-media-title", t);
            }
        }

        if let Some(ref glsl) = glsl_shaders {
            let glsl = glsl.trim();
            if !glsl.is_empty() {
                let _ = mpv.set_property("glsl-shaders", glsl);
            }
        }

        let path = normalize_media_url(&url);
        mpv.command("loadfile", &[&path, "replace"])
            .map_err(|e| format!("loadfile 失败: {e}"))?;

        if let Some(ref sub) = subtitle {
            let sub = sub.trim();
            if !sub.is_empty() {
                let _ = mpv.command("sub-add", &[sub]);
            }
        }

        if let Some(sec) = start_sec {
            if sec.is_finite() && sec > 0.0 {
                let s = format!("{sec}");
                let _ = mpv.command("seek", &[&s, "absolute"]);
            }
        }

        *guard = Some(mpv);
        Ok(())
    }

    fn normalize_media_url(url: &str) -> String {
        let u = url.trim();
        // file:///C:/... → C:/... 更利于 Windows mpv
        if let Some(rest) = u.strip_prefix("file:///") {
            let decoded = percent_decode(rest);
            if cfg!(windows) {
                return decoded.replace('/', "\\");
            }
            return format!("/{decoded}");
        }
        if let Some(rest) = u.strip_prefix("file://") {
            return percent_decode(rest);
        }
        u.to_string()
    }

    fn percent_decode(s: &str) -> String {
        let bytes = s.as_bytes();
        let mut out = Vec::with_capacity(bytes.len());
        let mut i = 0;
        while i < bytes.len() {
            if bytes[i] == b'%' && i + 2 < bytes.len() {
                if let (Some(a), Some(b)) = (from_hex(bytes[i + 1]), from_hex(bytes[i + 2])) {
                    out.push((a << 4) | b);
                    i += 3;
                    continue;
                }
            }
            out.push(bytes[i]);
            i += 1;
        }
        String::from_utf8_lossy(&out).into_owned()
    }

    fn from_hex(c: u8) -> Option<u8> {
        match c {
            b'0'..=b'9' => Some(c - b'0'),
            b'a'..=b'f' => Some(c - b'a' + 10),
            b'A'..=b'F' => Some(c - b'A' + 10),
            _ => None,
        }
    }

    pub fn set_pause(paused: bool) -> Result<(), String> {
        let guard = lock_session()?;
        let mpv = guard.as_ref().ok_or_else(|| "无活动 libmpv 会话".to_string())?;
        mpv.set_property("pause", paused)
            .map_err(|e| format!("pause: {e}"))
    }

    pub fn seek_absolute(sec: f64) -> Result<(), String> {
        if !sec.is_finite() {
            return Err("seek 秒数无效".into());
        }
        let guard = lock_session()?;
        let mpv = guard.as_ref().ok_or_else(|| "无活动 libmpv 会话".to_string())?;
        let s = format!("{sec}");
        mpv.command("seek", &[&s, "absolute"])
            .map_err(|e| format!("seek: {e}"))
    }

    pub fn get_time_pos() -> Result<f64, String> {
        let guard = lock_session()?;
        let mpv = guard.as_ref().ok_or_else(|| "无活动 libmpv 会话".to_string())?;
        mpv.get_property::<f64>("time-pos")
            .map_err(|e| format!("time-pos: {e}"))
    }

    pub fn close() -> Result<(), String> {
        let mut guard = lock_session()?;
        *guard = None;
        Ok(())
    }
}
