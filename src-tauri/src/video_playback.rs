//! 影视播放：外置 mpv IPC 尽力查询 + libmpv2 增强核（feature `video-libmpv`）
//! @see docs/VIDEO_PLAYBACK_KERNEL.md / VIDEO_LIBMPV_LICENSE.md

use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, Runtime};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoLibmpvStatus {
    pub available: bool,
    pub feature_enabled: bool,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoTrackInfo {
    pub id: String,
    pub label: String,
}

/// 将本地媒体路径加入 asset 协议作用域，供 WebView `convertFileSrc` / Artplayer 播放。
/// 用户自选目录（如 D:\Downloads）往往不在 tauri.conf 静态 scope 内。
#[tauri::command]
pub async fn video_allow_local_media_asset<R: Runtime>(
    app: AppHandle<R>,
    path: String,
) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("空路径".into());
    }
    let p = PathBuf::from(trimmed);
    if !p.exists() {
        return Err(format!("文件不存在: {trimmed}"));
    }

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        use tauri_plugin_fs::FsExt;

        // FS 插件：便于后续 read / stat
        if let Some(parent) = p.parent().filter(|x| !x.as_os_str().is_empty()) {
            let _ = app.fs_scope().allow_directory(parent, true);
        }

        let scope = app.asset_protocol_scope();
        if p.is_file() {
            scope
                .allow_file(&p)
                .map_err(|e| format!("asset 放行文件失败: {e}"))?;
            if let Some(parent) = p.parent().filter(|x| !x.as_os_str().is_empty()) {
                let _ = scope.allow_directory(parent, true);
            }
        } else {
            scope
                .allow_directory(&p, true)
                .map_err(|e| format!("asset 放行目录失败: {e}"))?;
        }
        // 盘符根：Windows 上用户常从 D:\ 等播片
        if let Some(root) = path_drive_root(&p) {
            let _ = scope.allow_directory(&root, true);
            let _ = app.fs_scope().allow_directory(&root, true);
        }
        Ok(())
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (app, p);
        Ok(())
    }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn path_drive_root(p: &Path) -> Option<PathBuf> {
    // Windows: C:\foo → C:\
    let mut comps = p.components();
    match comps.next()? {
        std::path::Component::Prefix(prefix) => {
            let mut root = PathBuf::new();
            root.push(prefix.as_os_str());
            if let Some(std::path::Component::RootDir) = comps.next() {
                root.push(std::path::Component::RootDir.as_os_str());
            }
            Some(root)
        }
        _ => None,
    }
}

/// 尽力通过 IPC 读取 time-pos。未实现完整 JSON IPC 客户端时返回 None（不报错）。
#[tauri::command]
pub async fn video_mpv_ipc_get_time_pos(ipc_path: String) -> Result<Option<f64>, String> {
    if ipc_path.trim().is_empty() {
        return Ok(None);
    }
    let _ = ipc_path;
    Ok(None)
}

#[tauri::command]
pub async fn video_libmpv_status<R: Runtime>(
    app: AppHandle<R>,
) -> Result<VideoLibmpvStatus, String> {
    #[cfg(all(
        feature = "video-libmpv",
        not(any(target_os = "android", target_os = "ios"))
    ))]
    {
        libmpv_session::ensure_dll_search_path(&app);
        Ok(libmpv_session::probe_status())
    }
    #[cfg(all(
        feature = "video-libmpv",
        any(target_os = "android", target_os = "ios")
    ))]
    {
        let _ = app;
        Ok(VideoLibmpvStatus {
            available: false,
            feature_enabled: true,
            detail: "video-libmpv is desktop-only; use Android Activity path".into(),
        })
    }
    #[cfg(not(feature = "video-libmpv"))]
    {
        let _ = app;
        Ok(VideoLibmpvStatus {
            available: false,
            feature_enabled: false,
            detail: "Build with --features video-libmpv to enable embedded libmpv (see VIDEO_LIBMPV_LICENSE.md)".into(),
        })
    }
}

/// 打开桌面增强播放窗（libmpv2 自建 VO 窗 / loadfile）。
#[tauri::command]
pub async fn video_libmpv_open_window<R: Runtime>(
    app: AppHandle<R>,
    url: String,
    title: Option<String>,
    start_sec: Option<f64>,
    subtitle: Option<String>,
    glsl_shaders: Option<String>,
    hwdec: Option<String>,
    gpu_next: Option<bool>,
    audio_track: Option<String>,
) -> Result<(), String> {
    if url.trim().is_empty() {
        return Err("无播放地址".into());
    }
    #[cfg(all(
        feature = "video-libmpv",
        not(any(target_os = "android", target_os = "ios"))
    ))]
    {
        libmpv_session::ensure_dll_search_path(&app);
        let url = url.clone();
        tauri::async_runtime::spawn_blocking(move || {
            libmpv_session::open_playback(
                url,
                title,
                start_sec,
                subtitle,
                glsl_shaders,
                hwdec,
                gpu_next.unwrap_or(false),
                audio_track,
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
        let _ = (
            app,
            title,
            start_sec,
            subtitle,
            glsl_shaders,
            hwdec,
            gpu_next,
            audio_track,
            url,
        );
        Err("桌面 libmpv 窗在移动端不可用，请用 video_android_open_player".into())
    }
    #[cfg(not(feature = "video-libmpv"))]
    {
        let _ = (
            app,
            title,
            start_sec,
            subtitle,
            glsl_shaders,
            hwdec,
            gpu_next,
            audio_track,
            url,
        );
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
pub async fn video_libmpv_get_duration() -> Result<f64, String> {
    #[cfg(all(
        feature = "video-libmpv",
        not(any(target_os = "android", target_os = "ios"))
    ))]
    {
        tauri::async_runtime::spawn_blocking(libmpv_session::get_duration)
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
pub async fn video_libmpv_list_tracks(kind: String) -> Result<Vec<VideoTrackInfo>, String> {
    #[cfg(all(
        feature = "video-libmpv",
        not(any(target_os = "android", target_os = "ios"))
    ))]
    {
        let kind = kind.clone();
        tauri::async_runtime::spawn_blocking(move || libmpv_session::list_tracks(&kind))
            .await
            .map_err(|e| format!("libmpv task join: {e}"))?
    }
    #[cfg(not(all(
        feature = "video-libmpv",
        not(any(target_os = "android", target_os = "ios"))
    )))]
    {
        let _ = kind;
        Err("libmpv 未启用或非桌面构建".into())
    }
}

#[tauri::command]
pub async fn video_libmpv_set_track(kind: String, id: String) -> Result<(), String> {
    #[cfg(all(
        feature = "video-libmpv",
        not(any(target_os = "android", target_os = "ios"))
    ))]
    {
        tauri::async_runtime::spawn_blocking(move || libmpv_session::set_track(&kind, &id))
            .await
            .map_err(|e| format!("libmpv task join: {e}"))?
    }
    #[cfg(not(all(
        feature = "video-libmpv",
        not(any(target_os = "android", target_os = "ios"))
    )))]
    {
        let _ = (kind, id);
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
    use super::{VideoLibmpvStatus, VideoTrackInfo};
    use libmpv2::events::{mpv_event_id, Event};
    use libmpv2::Mpv;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::Mutex;
    use std::thread::{self, JoinHandle};
    use tauri::{AppHandle, Manager, Runtime};

    static SESSION: Mutex<Option<Mpv>> = Mutex::new(None);
    static DLL_PATH_READY: Mutex<bool> = Mutex::new(false);
    /// 会话世代：递增后旧事件线程应退出，避免 wait_event 卡住关窗。
    static SESSION_GEN: AtomicU64 = AtomicU64::new(0);
    static EVENT_THREAD: Mutex<Option<JoinHandle<()>>> = Mutex::new(None);

    fn lock_session() -> Result<std::sync::MutexGuard<'static, Option<Mpv>>, String> {
        SESSION
            .lock()
            .map_err(|_| "libmpv session lock poisoned".into())
    }

    /// 结束当前会话：quit → 丢弃主句柄 → 等待事件线程退出。
    fn stop_session() {
        let _ = SESSION_GEN.fetch_add(1, Ordering::SeqCst);
        // 必须在锁外 drop：terminate 会唤醒事件线程，事件线程也可能锁 SESSION
        let mpv = SESSION.lock().ok().and_then(|mut g| g.take());
        if let Some(mpv) = mpv {
            let _ = mpv.command("quit", &[]);
            drop(mpv);
        }
        if let Ok(mut slot) = EVENT_THREAD.lock() {
            if let Some(handle) = slot.take() {
                let _ = handle.join();
            }
        }
    }

    /// 在主句柄上串行泵送事件（持 SESSION 锁）。
    /// 不用 `create_client(Some(name))`：libmpv2 对该 API 存在 CString 悬垂指针 bug，会返回 null 并 panic。
    fn spawn_event_pump(gen: u64) {
        let handle = thread::Builder::new()
            .name("libmpv-events".into())
            .spawn(move || {
                loop {
                    if SESSION_GEN.load(Ordering::SeqCst) != gen {
                        break;
                    }
                    let mut guard = match SESSION.lock() {
                        Ok(g) => g,
                        Err(_) => break,
                    };
                    let Some(mpv) = guard.as_ref() else {
                        break;
                    };
                    // 短超时：关窗依赖 drain；锁释放后命令线程可介入
                    match mpv.wait_event(0.12) {
                        Some(Ok(Event::Shutdown)) => {
                            *guard = None;
                            drop(guard);
                            if SESSION_GEN.load(Ordering::SeqCst) == gen {
                                let _ = SESSION_GEN.fetch_add(1, Ordering::SeqCst);
                            }
                            break;
                        }
                        Some(_) => {
                            drop(guard);
                        }
                        None => {
                            drop(guard);
                            thread::sleep(std::time::Duration::from_millis(8));
                        }
                    }
                }
            });
        if let Ok(mut slot) = EVENT_THREAD.lock() {
            *slot = handle.ok();
        }
    }

    /// 将 resources/libmpv 与 exe 目录加入 PATH，便于加载 libmpv-2.dll
    pub fn ensure_dll_search_path<R: Runtime>(app: &AppHandle<R>) {
        let mut ready = match DLL_PATH_READY.lock() {
            Ok(g) => g,
            Err(_) => return,
        };
        if *ready {
            return;
        }

        let mut dirs: Vec<PathBuf> = Vec::new();
        if let Ok(res) = app.path().resource_dir() {
            dirs.push(res.join("libmpv"));
            dirs.push(res.clone());
        }
        if let Ok(exe) = std::env::current_exe() {
            if let Some(parent) = exe.parent() {
                dirs.push(parent.to_path_buf());
                dirs.push(parent.join("libmpv"));
            }
        }
        // 开发态：src-tauri/resources/libmpv
        if let Ok(cwd) = std::env::current_dir() {
            dirs.push(cwd.join("resources").join("libmpv"));
            dirs.push(cwd.join("src-tauri").join("resources").join("libmpv"));
        }

        let existing: Vec<PathBuf> = dirs.into_iter().filter(|p| p.is_dir()).collect();
        if !existing.is_empty() {
            let joined = existing
                .iter()
                .map(|p| p.to_string_lossy().into_owned())
                .collect::<Vec<_>>()
                .join(if cfg!(windows) { ";" } else { ":" });
            let old = std::env::var("PATH").unwrap_or_default();
            let new_path = if old.is_empty() {
                joined
            } else if cfg!(windows) {
                format!("{joined};{old}")
            } else {
                format!("{joined}:{old}")
            };
            // 启动前扩展 PATH，便于 libmpv-2.dll 解析
            unsafe {
                std::env::set_var("PATH", new_path);
            }
        }

        *ready = true;
    }

    pub fn probe_status() -> VideoLibmpvStatus {
        match Mpv::with_initializer(|init| {
            let _ = init.set_option("video", "no");
            let _ = init.set_option("audio", "no");
            Ok(())
        }) {
            Ok(_mpv) => VideoLibmpvStatus {
                available: true,
                feature_enabled: true,
                detail: "libmpv2 linked; runtime probe OK (DLL on PATH or resources/libmpv)".into(),
            },
            Err(e) => VideoLibmpvStatus {
                available: false,
                feature_enabled: true,
                detail: format!(
                    "video-libmpv compiled but libmpv init failed: {e}. Place libmpv-2.dll under resources/libmpv or PATH."
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
        hwdec: Option<String>,
        gpu_next: bool,
        audio_track: Option<String>,
    ) -> Result<(), String> {
        // 先干净关掉上一窗，否则旧 VO / 事件线程会残留
        stop_session();

        let mpv = Mpv::with_initializer(|init| {
            init.set_option("force-window", "immediate")?;
            init.set_option("keep-open", "yes")?;
            // 勿设 idle=yes：关窗时需触发 quit；keep-open 已覆盖播完驻留
            init.set_option("osc", "yes")?;
            init.set_option("input-default-bindings", "yes")?;
            init.set_option("input-vo-keyboard", "yes")?;
            if gpu_next {
                let _ = init.set_option("vo", "gpu-next");
            }
            if let Some(ref hw) = hwdec {
                let hw = hw.trim();
                if !hw.is_empty() {
                    let _ = init.set_option("hwdec", hw);
                }
            }
            Ok(())
        })
        .map_err(|e| {
            format!(
                "创建 libmpv 失败（缺 DLL/ABI？）: {e}. 将 libmpv-2.dll 放到 resources/libmpv 或 PATH（见 resources/libmpv/README.md）"
            )
        })?;

        if let Some(ref t) = title {
            let t = t.trim();
            if !t.is_empty() {
                let _ = mpv.set_property("force-media-title", t);
            }
        }

        // gpu-next 与 Anime4K 互斥：开 gpu-next 时忽略 shaders
        if !gpu_next {
            if let Some(ref glsl) = glsl_shaders {
                let glsl = glsl.trim();
                if !glsl.is_empty() {
                    let _ = mpv.set_property("glsl-shaders", glsl);
                }
            }
        }

        let path = normalize_media_url(&url);
        if path.is_empty() {
            return Err("无有效播放地址".into());
        }
        // 本地绝对路径：提前校验，避免 force-window 空闲屏（loadfile 异步失败时仍返回 Ok）
        if looks_like_local_path(&path) {
            let p = PathBuf::from(&path);
            if !p.is_file() {
                return Err(format!("本地文件不存在或不可读: {path}"));
            }
        }

        mpv.command("loadfile", &[&path, "replace"])
            .map_err(|e| format!("loadfile 失败 ({path}): {e}"))?;

        if let Some(ref sub) = subtitle {
            let sub = sub.trim();
            if !sub.is_empty() {
                let _ = mpv.command("sub-add", &[sub]);
            }
        }

        if let Some(ref aid) = audio_track {
            let aid = aid.trim();
            if !aid.is_empty() {
                let _ = mpv.set_property("aid", aid);
            }
        }

        if let Some(sec) = start_sec {
            if sec.is_finite() && sec > 0.0 {
                let s = format!("{sec}");
                let _ = mpv.command("seek", &[&s, "absolute"]);
            }
        }

        let _ = mpv.enable_event(mpv_event_id::Shutdown);
        let gen = SESSION_GEN.load(Ordering::SeqCst);
        {
            let mut guard = lock_session()?;
            *guard = Some(mpv);
        }
        spawn_event_pump(gen);

        Ok(())
    }

    fn looks_like_local_path(path: &str) -> bool {
        if path.starts_with("http://")
            || path.starts_with("https://")
            || path.starts_with("rtmp://")
            || path.starts_with("rtsp://")
            || path.starts_with("ytdl://")
            || path.starts_with("edl://")
            || path.starts_with("bd://")
            || path.starts_with("dvd://")
        {
            return false;
        }
        // Windows 盘符 / UNC / Unix 绝对路径
        let bytes = path.as_bytes();
        if bytes.len() >= 3
            && bytes[0].is_ascii_alphabetic()
            && bytes[1] == b':'
            && (bytes[2] == b'\\' || bytes[2] == b'/')
        {
            return true;
        }
        path.starts_with("\\\\") || path.starts_with('/')
    }

    fn normalize_media_url(url: &str) -> String {
        let mut u = url.trim().to_string();
        // StorageRef：path:C:\... / uri:https://...（前端本地库常用）
        for prefix in [
            "path:",
            "uri:",
            "opfs:",
            "handle:file:",
            "handle:dir:",
            "saf-tree:",
            "virtual:",
        ] {
            if let Some(rest) = u.strip_prefix(prefix) {
                u = rest.trim().to_string();
                break;
            }
        }

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
        u
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
        let mpv = guard
            .as_ref()
            .ok_or_else(|| "无活动 libmpv 会话".to_string())?;
        mpv.set_property("pause", paused)
            .map_err(|e| format!("pause: {e}"))
    }

    pub fn seek_absolute(sec: f64) -> Result<(), String> {
        if !sec.is_finite() {
            return Err("seek 秒数无效".into());
        }
        let guard = lock_session()?;
        let mpv = guard
            .as_ref()
            .ok_or_else(|| "无活动 libmpv 会话".to_string())?;
        let s = format!("{sec}");
        mpv.command("seek", &[&s, "absolute"])
            .map_err(|e| format!("seek: {e}"))
    }

    pub fn get_time_pos() -> Result<f64, String> {
        let guard = lock_session()?;
        let mpv = guard
            .as_ref()
            .ok_or_else(|| "无活动 libmpv 会话".to_string())?;
        mpv.get_property::<f64>("time-pos")
            .map_err(|e| format!("time-pos: {e}"))
    }

    pub fn get_duration() -> Result<f64, String> {
        let guard = lock_session()?;
        let mpv = guard
            .as_ref()
            .ok_or_else(|| "无活动 libmpv 会话".to_string())?;
        mpv.get_property::<f64>("duration")
            .map_err(|e| format!("duration: {e}"))
    }

    pub fn list_tracks(kind: &str) -> Result<Vec<VideoTrackInfo>, String> {
        let want = match kind.trim().to_ascii_lowercase().as_str() {
            "audio" | "a" => "audio",
            "sub" | "subtitle" | "s" => "sub",
            other => return Err(format!("unsupported track kind: {other}")),
        };
        let guard = lock_session()?;
        let mpv = guard
            .as_ref()
            .ok_or_else(|| "无活动 libmpv 会话".to_string())?;

        let count: i64 = mpv
            .get_property("track-list/count")
            .map_err(|e| format!("track-list/count: {e}"))?;
        let mut out = Vec::new();
        for i in 0..count {
            let ty: String = mpv
                .get_property(&format!("track-list/{i}/type"))
                .unwrap_or_default();
            if ty != want {
                continue;
            }
            let id: i64 = mpv
                .get_property(&format!("track-list/{i}/id"))
                .unwrap_or(i);
            let title: String = mpv
                .get_property(&format!("track-list/{i}/title"))
                .unwrap_or_default();
            let lang: String = mpv
                .get_property(&format!("track-list/{i}/lang"))
                .unwrap_or_default();
            let label = [title.trim(), lang.trim()]
                .into_iter()
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>()
                .join(" · ");
            let label = if label.is_empty() {
                format!("{want} #{id}")
            } else {
                format!("{label} (#{id})")
            };
            out.push(VideoTrackInfo {
                id: id.to_string(),
                label,
            });
        }
        Ok(out)
    }

    pub fn set_track(kind: &str, id: &str) -> Result<(), String> {
        let prop = match kind.trim().to_ascii_lowercase().as_str() {
            "audio" | "a" => "aid",
            "sub" | "subtitle" | "s" => "sid",
            other => return Err(format!("unsupported track kind: {other}")),
        };
        let guard = lock_session()?;
        let mpv = guard
            .as_ref()
            .ok_or_else(|| "无活动 libmpv 会话".to_string())?;
        let id = id.trim();
        if id.is_empty() || id.eq_ignore_ascii_case("no") {
            if prop == "sid" {
                mpv.set_property("sid", "no")
                    .map_err(|e| format!("sid=no: {e}"))?;
            } else {
                return Err("audio track cannot be 'no'".into());
            }
            return Ok(());
        }
        mpv.set_property(prop, id)
            .map_err(|e| format!("{prop}={id}: {e}"))
    }

    pub fn close() -> Result<(), String> {
        stop_session();
        Ok(())
    }
}
