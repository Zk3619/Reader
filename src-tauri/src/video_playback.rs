//! 影视播放：外置 mpv IPC 尽力查询 + libmpv2 增强核（feature `video-libmpv`）
//! @see docs/VIDEO_PLAYBACK_KERNEL.md / VIDEO_LIBMPV_LICENSE.md

use serde::Serialize;
use std::path::PathBuf;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
use std::path::Path;
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoChapterInfo {
    pub index: i64,
    pub title: String,
    pub time: f64,
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
        // 目录本身也要放行（用户自选任意盘符路径常不在静态 scope 内）
        if p.is_dir() {
            let _ = app.fs_scope().allow_directory(&p, true);
        } else if let Some(parent) = p.parent().filter(|x| !x.as_os_str().is_empty()) {
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

/// 启动用户自选外置播放器（完整 exe 路径 + 参数）。不走 shell PATH，也不依赖注册表。
#[tauri::command]
pub async fn video_spawn_external_player(exe: String, args: Vec<String>) -> Result<(), String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (exe, args);
        return Err("自定义外置播放器仅桌面可用".into());
    }
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let exe = exe.trim();
        if exe.is_empty() {
            return Err("播放器路径为空".into());
        }
        let path = PathBuf::from(exe);
        if !path.is_file() {
            return Err(format!("播放器不存在或不是文件: {exe}"));
        }
        std::process::Command::new(&path)
            .args(&args)
            .spawn()
            .map_err(|e| format!("启动播放器失败: {e}"))?;
        Ok(())
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

const ANIME4K_PROBE_SHADER: &str = "Anime4K_Clamp_Highlights.glsl";

/// 解析捆绑 Anime4K shaders 根目录（多候选：resourceDir、resources/shaders、开发 cwd）。
#[tauri::command]
pub async fn video_resolve_anime4k_shaders_dir<R: Runtime>(
    app: AppHandle<R>,
) -> Result<String, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(res) = app.path().resource_dir() {
        candidates.push(res.join("shaders"));
        candidates.push(res.join("resources").join("shaders"));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidates.push(parent.join("shaders"));
            candidates.push(parent.join("resources").join("shaders"));
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("resources").join("shaders"));
        candidates.push(cwd.join("src-tauri").join("resources").join("shaders"));
    }
    for dir in candidates {
        if dir.join(ANIME4K_PROBE_SHADER).is_file() {
            return Ok(dir.to_string_lossy().into_owned());
        }
    }
    Err(format!(
        "未找到 Anime4K shaders（缺 {ANIME4K_PROBE_SHADER}）。请确认 src-tauri/resources/shaders 已打包。"
    ))
}

fn rife_resource_roots<R: Runtime>(app: &AppHandle<R>) -> Vec<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(res) = app.path().resource_dir() {
        candidates.push(res.join("rife"));
        candidates.push(res.join("resources").join("rife"));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidates.push(parent.join("rife"));
            candidates.push(parent.join("resources").join("rife"));
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("resources").join("rife"));
        candidates.push(cwd.join("src-tauri").join("resources").join("rife"));
    }
    candidates
}

fn dir_has_model_files(dir: &PathBuf) -> bool {
    let Ok(rd) = std::fs::read_dir(dir) else {
        return false;
    };
    for e in rd.flatten() {
        let p = e.path();
        if p.is_file() {
            let ext = p
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if matches!(
                ext.as_str(),
                "onnx" | "bin" | "param" | "engine" | "pt" | "pth"
            ) {
                return true;
            }
        } else if p.is_dir() {
            return true;
        }
    }
    false
}

/// 解析 RIFE 资源根（含 scripts/rife.vpy）
#[tauri::command]
pub async fn video_resolve_rife_dir<R: Runtime>(app: AppHandle<R>) -> Result<String, String> {
    for c in rife_resource_roots(&app) {
        let script = c.join("scripts").join("rife.vpy");
        if script.is_file() {
            return Ok(c.to_string_lossy().into_owned());
        }
    }
    Err("未找到 resources/rife/scripts/rife.vpy".into())
}

/// 探测 RIFE 运行时（脚本 + 模型目录）
#[tauri::command]
pub async fn video_rife_status<R: Runtime>(
    app: AppHandle<R>,
) -> Result<serde_json::Value, String> {
    let roots = rife_resource_roots(&app);
    let mut root: Option<PathBuf> = None;
    let mut script = PathBuf::new();
    for c in &roots {
        let s = c.join("scripts").join("rife.vpy");
        if s.is_file() {
            root = Some(c.clone());
            script = s;
            break;
        }
    }
    let Some(root) = root else {
        return Ok(serde_json::json!({
            "available": false,
            "backend": null,
            "detail": "缺少 resources/rife/scripts/rife.vpy",
            "scriptPath": "",
            "models": [],
            "hasTrt": false,
            "hasDml": false,
            "hasNcnn": false,
        }));
    };

    let ncnn_dir = root.join("models").join("rife_ncnn");
    let trt_dir = root.join("models").join("rife_trt");
    let dml_dir = root.join("models").join("rife_dml");
    let has_ncnn = dir_has_model_files(&ncnn_dir);
    let has_trt = dir_has_model_files(&trt_dir);
    // DirectML（vs-mlrt ORT_DML）仅 Windows；模型一般为 ONNX
    let has_dml_models = dir_has_model_files(&dml_dir);
    let has_dml = cfg!(target_os = "windows") && has_dml_models;
    let mut models: Vec<String> = Vec::new();
    if has_ncnn {
        models.push("ncnn".into());
    }
    if has_trt {
        models.push("trt".into());
    }
    if has_dml {
        models.push("dml".into());
    } else if has_dml_models {
        models.push("dml(non-windows)".into());
    }
    let available = has_ncnn || has_trt || has_dml;
    let backend = if has_trt {
        Some("trt")
    } else if has_dml {
        Some("dml")
    } else if has_ncnn {
        Some("ncnn")
    } else {
        None
    };
    let detail = if available {
        format!(
            "script ok; ncnn={has_ncnn} trt={has_trt} dml={has_dml} (dmlModels={has_dml_models})"
        )
    } else if has_dml_models && !cfg!(target_os = "windows") {
        "脚本在，且有 rife_dml 模型，但 DirectML 仅 Windows 可用".to_string()
    } else {
        "脚本在，但 models/rife_ncnn、rife_trt、rife_dml 皆空（见 resources/rife/README.md）"
            .to_string()
    };
    Ok(serde_json::json!({
        "available": available,
        "backend": backend,
        "detail": detail,
        "scriptPath": script.to_string_lossy(),
        "models": models,
        "hasTrt": has_trt,
        "hasDml": has_dml,
        "hasNcnn": has_ncnn,
    }))
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
    http_headers: Option<Vec<String>>,
    sub_font: Option<String>,
    sub_font_size: Option<f64>,
    sub_scale: Option<f64>,
    tone_mapping: Option<String>,
    target_colorspace_hint: Option<bool>,
    volume: Option<f64>,
    muted: Option<bool>,
    listen_only: Option<bool>,
    af: Option<String>,
    video_filter: Option<String>,
    lightweight_interp: Option<bool>,
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
                http_headers,
                sub_font,
                sub_font_size,
                sub_scale,
                tone_mapping,
                target_colorspace_hint,
                volume,
                muted,
                listen_only,
                af,
                video_filter,
                lightweight_interp.unwrap_or(false),
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
            http_headers,
            sub_font,
            sub_font_size,
            sub_scale,
            tone_mapping,
            target_colorspace_hint,
            volume,
            muted,
            listen_only,
            af,
            video_filter,
            lightweight_interp,
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
            http_headers,
            sub_font,
            sub_font_size,
            sub_scale,
            tone_mapping,
            target_colorspace_hint,
            volume,
            muted,
            listen_only,
            af,
            video_filter,
            lightweight_interp,
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

/// E2.4：活动会话 chapter-list；失败返回空数组
#[tauri::command]
pub async fn video_libmpv_list_chapters() -> Result<Vec<VideoChapterInfo>, String> {
    #[cfg(all(
        feature = "video-libmpv",
        not(any(target_os = "android", target_os = "ios"))
    ))]
    {
        tauri::async_runtime::spawn_blocking(libmpv_session::list_chapters)
            .await
            .map_err(|e| format!("libmpv task join: {e}"))?
    }
    #[cfg(not(all(
        feature = "video-libmpv",
        not(any(target_os = "android", target_os = "ios"))
    )))]
    {
        Ok(vec![])
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

/// 活动会话热切换 Anime4K（空 / null = 清空 shaders）
#[tauri::command]
pub async fn video_libmpv_set_glsl_shaders(glsl_shaders: Option<String>) -> Result<(), String> {
    #[cfg(all(
        feature = "video-libmpv",
        not(any(target_os = "android", target_os = "ios"))
    ))]
    {
        tauri::async_runtime::spawn_blocking(move || {
            libmpv_session::set_glsl_shaders_live(glsl_shaders.as_deref())
        })
        .await
        .map_err(|e| format!("libmpv task join: {e}"))?
    }
    #[cfg(not(all(
        feature = "video-libmpv",
        not(any(target_os = "android", target_os = "ios"))
    )))]
    {
        let _ = glsl_shaders;
        Err("libmpv 未启用或非桌面构建".into())
    }
}

/// 活动会话热切换视频滤镜（RIFE vf；空 = 清空）
#[tauri::command]
pub async fn video_libmpv_set_video_filter(
    video_filter: Option<String>,
    lightweight_interp: Option<bool>,
) -> Result<(), String> {
    #[cfg(all(
        feature = "video-libmpv",
        not(any(target_os = "android", target_os = "ios"))
    ))]
    {
        tauri::async_runtime::spawn_blocking(move || {
            libmpv_session::set_video_filter_live(
                video_filter.as_deref(),
                lightweight_interp.unwrap_or(false),
            )
        })
        .await
        .map_err(|e| format!("libmpv task join: {e}"))?
    }
    #[cfg(not(all(
        feature = "video-libmpv",
        not(any(target_os = "android", target_os = "ios"))
    )))]
    {
        let _ = (video_filter, lightweight_interp);
        Err("libmpv 未启用或非桌面构建".into())
    }
}

/// 活动会话字幕样式（null = 不改该项）
#[tauri::command]
pub async fn video_libmpv_set_sub_style(
    font: Option<String>,
    font_size: Option<f64>,
    scale: Option<f64>,
) -> Result<(), String> {
    #[cfg(all(
        feature = "video-libmpv",
        not(any(target_os = "android", target_os = "ios"))
    ))]
    {
        tauri::async_runtime::spawn_blocking(move || {
            libmpv_session::set_sub_style_live(font.as_deref(), font_size, scale)
        })
        .await
        .map_err(|e| format!("libmpv task join: {e}"))?
    }
    #[cfg(not(all(
        feature = "video-libmpv",
        not(any(target_os = "android", target_os = "ios"))
    )))]
    {
        let _ = (font, font_size, scale);
        Err("libmpv 未启用或非桌面构建".into())
    }
}

#[tauri::command]
pub async fn video_libmpv_set_audio(
    volume: Option<f64>,
    muted: Option<bool>,
    listen_only: Option<bool>,
) -> Result<(), String> {
    #[cfg(all(
        feature = "video-libmpv",
        not(any(target_os = "android", target_os = "ios"))
    ))]
    {
        tauri::async_runtime::spawn_blocking(move || {
            libmpv_session::set_audio_live(volume, muted, listen_only)
        })
        .await
        .map_err(|e| format!("libmpv task join: {e}"))?
    }
    #[cfg(not(all(
        feature = "video-libmpv",
        not(any(target_os = "android", target_os = "ios"))
    )))]
    {
        let _ = (volume, muted, listen_only);
        Err("libmpv 未启用或非桌面构建".into())
    }
}

/// E2.5：热切换 af（None / 空 = 清空均衡器）
#[tauri::command]
pub async fn video_libmpv_set_af(af: Option<String>) -> Result<(), String> {
    #[cfg(all(
        feature = "video-libmpv",
        not(any(target_os = "android", target_os = "ios"))
    ))]
    {
        tauri::async_runtime::spawn_blocking(move || {
            libmpv_session::set_af_live(af.as_deref())
        })
        .await
        .map_err(|e| format!("libmpv task join: {e}"))?
    }
    #[cfg(not(all(
        feature = "video-libmpv",
        not(any(target_os = "android", target_os = "ios"))
    )))]
    {
        let _ = af;
        Err("libmpv 未启用或非桌面构建".into())
    }
}

#[tauri::command]
pub async fn video_libmpv_sub_add(path: String) -> Result<(), String> {
    #[cfg(all(
        feature = "video-libmpv",
        not(any(target_os = "android", target_os = "ios"))
    ))]
    {
        tauri::async_runtime::spawn_blocking(move || libmpv_session::sub_add_file(&path))
            .await
            .map_err(|e| format!("libmpv task join: {e}"))?
    }
    #[cfg(not(all(
        feature = "video-libmpv",
        not(any(target_os = "android", target_os = "ios"))
    )))]
    {
        let _ = path;
        Err("libmpv 未启用或非桌面构建".into())
    }
}

/// 本地文件抽帧预览（JPEG base64，无 data: 前缀）。优先 PATH 上的 mpv。
#[tauri::command]
pub async fn video_extract_thumbnail(path: String, sec: f64) -> Result<String, String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (path, sec);
        return Err("缩略图抽帧仅桌面可用".into());
    }
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        tauri::async_runtime::spawn_blocking(move || extract_thumbnail_jpeg_b64(path, sec))
            .await
            .map_err(|e| format!("thumbnail task join: {e}"))?
    }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn extract_thumbnail_jpeg_b64(path: String, sec: f64) -> Result<String, String> {
    use std::fs;
    use std::process::Command;

    let path = path.trim();
    if path.is_empty() {
        return Err("空路径".into());
    }
    let is_url = path.starts_with("http://") || path.starts_with("https://");
    if !is_url {
        let p = PathBuf::from(path);
        if !p.is_file() {
            return Err(format!("文件不存在: {path}"));
        }
    }
    let sec = if sec.is_finite() && sec >= 0.0 { sec } else { 0.0 };
    let tmp = tempfile::tempdir().map_err(|e| format!("临时目录失败: {e}"))?;
    let out_dir = tmp.path();
    // 本地文件与 http(s)（含本机 tv_proxy）均可由 mpv 抽帧，避开 WebView canvas CORS 污染
    let status = Command::new("mpv")
        .args([
            "--really-quiet",
            "--no-audio",
            "--hr-seek=yes",
            &format!("--start={sec}"),
            "--frames=1",
            "--vo=image",
            "--vo-image-format=jpg",
            &format!("--vo-image-outdir={}", out_dir.display()),
            "--",
            path,
        ])
        .status()
        .map_err(|e| {
            format!("启动 mpv 抽帧失败（请安装 mpv 或使用前端 canvas 预览）: {e}")
        })?;
    if !status.success() {
        return Err(format!("mpv 抽帧退出码: {:?}", status.code()));
    }
    let mut jpeg: Option<PathBuf> = None;
    if let Ok(rd) = fs::read_dir(out_dir) {
        for ent in rd.flatten() {
            let p = ent.path();
            if p
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.eq_ignore_ascii_case("jpg") || e.eq_ignore_ascii_case("jpeg"))
                .unwrap_or(false)
            {
                jpeg = Some(p);
                break;
            }
        }
    }
    let jpeg = jpeg.ok_or_else(|| "mpv 未写出 JPEG".to_string())?;
    let bytes = fs::read(&jpeg).map_err(|e| format!("读取缩略图失败: {e}"))?;
    use base64::Engine as _;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

/// 手动调试用：打开可见嗅探窗（导航命中媒体扩展名时 emit `video-sniff-hit`）
#[tauri::command]
pub async fn video_sniff_open_window<R: Runtime>(
    app: AppHandle<R>,
    url: String,
) -> Result<(), String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (app, url);
        return Err("独立嗅探窗仅桌面可用".into());
    }
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        use tauri::Emitter;
        use tauri::{WebviewUrl, WebviewWindowBuilder};

        let url = url.trim().to_string();
        if !url.starts_with("http://") && !url.starts_with("https://") {
            return Err("请输入 http(s) URL".into());
        }
        let label = "video-sniff";
        if let Some(w) = app.get_webview_window(label) {
            let js = format!(
                "window.location.href = {}",
                serde_json::to_string(&url).unwrap_or_else(|_| "\"about:blank\"".into())
            );
            let _ = w.eval(&js);
            let _ = w.set_focus();
            return Ok(());
        }
        let app_nav = app.clone();
        let builder = WebviewWindowBuilder::new(
            &app,
            label,
            WebviewUrl::External(url.parse().map_err(|e| format!("无效 URL: {e}"))?),
        )
        .title("影视嗅探")
        .inner_size(1100.0, 720.0)
        .on_navigation(move |nav| {
            let u = nav.as_str();
            if looks_like_media_url(u) {
                let _ = app_nav.emit(
                    "video-sniff-hit",
                    serde_json::json!({ "url": u, "source": "navigation" }),
                );
            }
            true
        });
        builder.build().map_err(|e| format!("创建嗅探窗失败: {e}"))?;
        Ok(())
    }
}

/// 番剧抽流：隐藏子 WebView（对齐 Kazumi HeadlessWebview），不弹可见窗。
/// 命中媒体地址后返回 URL；超时返回错误。
#[tauri::command]
pub async fn video_sniff_resolve_headless<R: Runtime>(
    app: AppHandle<R>,
    url: String,
    timeout_ms: Option<u64>,
) -> Result<String, String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (app, url, timeout_ms);
        return Err("无头嗅探仅桌面可用".into());
    }
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        video_sniff_headless::resolve(app, url, timeout_ms.unwrap_or(45_000)).await
    }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn looks_like_media_url(url: &str) -> bool {
    let u = url.to_ascii_lowercase();
    // 过滤广告 / 预加载页，避免误命中
    if u.contains("googleads")
        || u.contains("googlesyndication")
        || u.contains("doubleclick")
        || u.contains("prestrain")
        || u.contains("adtrafficquality")
    {
        return false;
    }
    u.contains(".m3u8")
        || u.contains(".mpd")
        || u.contains(".mp4")
        || u.contains(".flv")
        || u.contains(".mkv")
        || u.contains("mime=video")
        || u.contains("application/vnd.apple.mpegurl")
        || u.contains("application/x-mpegurl")
        || u.contains("type=m3u8")
        || u.contains("format=m3u8")
        || u.contains("/m3u8")
}

/// 注入脚本通过导航到该前缀上报命中（不依赖远端页 IPC 权限）。
#[cfg(not(any(target_os = "android", target_os = "ios")))]
const VIDEO_SNIFF_HIT_PREFIX: &str = "https://reader.invalid/__video_sniff_hit__?u=";

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod video_sniff_headless {
    use std::sync::{Mutex, OnceLock};
    use std::time::Duration;

    use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewUrl};
    use tokio::sync::oneshot;

    use super::{looks_like_media_url, VIDEO_SNIFF_HIT_PREFIX};

    pub const LABEL: &str = "reader-video-sniff";

    struct Pending {
        tx: oneshot::Sender<Result<String, String>>,
    }

    #[derive(Default)]
    struct Session {
        pending: Option<Pending>,
        /// 便于超时时给出可诊断信息（页面到底有没有加载 / 跳了哪些地址）
        nav_log: Vec<String>,
        /// 原生拦截到的资源 URL（未必是媒体），用于超时诊断
        resource_log: Vec<String>,
    }

    fn session() -> &'static Mutex<Session> {
        static SLOT: OnceLock<Mutex<Session>> = OnceLock::new();
        SLOT.get_or_init(|| Mutex::new(Session::default()))
    }

    fn take_pending() -> Option<Pending> {
        session().lock().ok()?.pending.take()
    }

    fn push_nav(url: &str) {
        if let Ok(mut s) = session().lock() {
            if s.pending.is_none() {
                return;
            }
            if s.nav_log.len() >= 24 {
                s.nav_log.remove(0);
            }
            s.nav_log.push(url.chars().take(200).collect());
        }
    }

    fn push_resource(url: &str) {
        if let Ok(mut s) = session().lock() {
            if s.pending.is_none() {
                return;
            }
            // 只记疑似媒体 / 播放器相关，避免日志爆炸
            let lower = url.to_ascii_lowercase();
            if !(looks_like_media_url(url)
                || lower.contains("player")
                || lower.contains("m3u8")
                || lower.contains("video")
                || lower.contains("/play"))
            {
                return;
            }
            if s.resource_log.iter().any(|x| x == url) {
                return;
            }
            if s.resource_log.len() >= 32 {
                s.resource_log.remove(0);
            }
            s.resource_log.push(url.chars().take(240).collect());
        }
    }

    fn nav_log_snapshot() -> Vec<String> {
        session()
            .lock()
            .map(|s| s.nav_log.clone())
            .unwrap_or_default()
    }

    fn resource_log_snapshot() -> Vec<String> {
        session()
            .lock()
            .map(|s| s.resource_log.clone())
            .unwrap_or_default()
    }

    fn on_network_uri(uri: &str) {
        push_resource(uri);
        if looks_like_media_url(uri) {
            complete_media_uri(uri);
        }
    }

    fn complete_media_uri(uri: &str) {
        if let Some(p) = take_pending() {
            let _ = p.tx.send(Ok(uri.to_string()));
        }
    }

    fn parse_sniff_hit_url(nav: &str) -> Option<String> {
        if let Some(rest) = nav.strip_prefix(VIDEO_SNIFF_HIT_PREFIX) {
            let decoded = urlencoding_decode(rest);
            if !decoded.is_empty() {
                return Some(decoded);
            }
        }
        // 兼容 query 形式编码差异
        if nav.contains("/__video_sniff_hit__") {
            if let Ok(parsed) = url::Url::parse(nav) {
                if let Some(u) = parsed
                    .query_pairs()
                    .find(|(k, _)| k == "u")
                    .map(|(_, v)| v.into_owned())
                {
                    if !u.is_empty() {
                        return Some(u);
                    }
                }
            }
        }
        None
    }

    fn urlencoding_decode(s: &str) -> String {
        urlencoding::decode(s)
            .map(|c| c.into_owned())
            .unwrap_or_else(|_| s.to_string())
    }

    fn sniff_init_script() -> String {
        let prefix = VIDEO_SNIFF_HIT_PREFIX;
        format!(
            r#"(function(){{
  if (window.__readerVideoSniffInstalled) return;
  window.__readerVideoSniffInstalled = true;
  var reported = false;
  function interesting(u){{
    u = String(u||'');
    if (!u || u.indexOf('blob:')===0) return false;
    if (/googleads|googlesyndication|doubleclick|adtrafficquality|prestrain/i.test(u)) return false;
    return /m3u8|\.mpd(\?|$)|\.mp4(\?|$)|\.flv(\?|$)|\.mkv(\?|$)|mime=video|mpegurl|video\/mp2t|dash\+xml/i.test(u);
  }}
  var isTop = false;
  try {{ isTop = window.top === window; }} catch(e) {{ isTop = false; }}
  function emitTop(u){{
    try {{ location.replace({prefix_json} + encodeURIComponent(u)); }} catch(e){{}}
  }}
  // 子帧（播放器多在跨域 iframe 内）：冒泡到顶层，由顶层导航上报
  window.addEventListener('message', function(ev){{
    try {{
      var d = ev && ev.data;
      if (!d || d.__readerSniffHit !== 1) return;
      var u = String(d.url || '');
      if (!u) return;
      if (isTop) {{ if (!reported) {{ reported = true; emitTop(u); }} return; }}
      try {{ parent.postMessage(d, '*'); }} catch(e){{}}
    }} catch(e){{}}
  }});
  function report(u, src){{
    try {{
      u = String(u||'').trim();
      if (!u || reported || !interesting(u)) return;
      if (u.indexOf('//')===0) u = location.protocol + u;
      if (u.indexOf('http')!==0) {{
        try {{ u = new URL(u, location.href).href; }} catch(e) {{ return; }}
      }}
      reported = true;
      try {{ console.log('[reader-sniff]', src||'', u); }} catch(e){{}}
      if (isTop) {{
        emitTop(u);
        return;
      }}
      var msg = {{ __readerSniffHit: 1, url: u, source: src||'' }};
      try {{ parent.postMessage(msg, '*'); }} catch(e){{}}
      try {{ if (window.top) window.top.postMessage(msg, '*'); }} catch(e){{}}
    }} catch(e){{}}
  }}
  function scanDom(){{
    try {{
      document.querySelectorAll('video,source').forEach(function(el){{
        var s = el.currentSrc || el.src || el.getAttribute('src');
        if (s) report(s, 'dom');
      }});
      document.querySelectorAll('iframe').forEach(function(f){{
        var s = f.getAttribute('src');
        if (s && interesting(s)) report(s, 'iframe');
      }});
    }} catch(e){{}}
  }}
  try {{
    var mo = new MutationObserver(scanDom);
    mo.observe(document.documentElement, {{childList:true,subtree:true,attributes:true,attributeFilter:['src']}});
  }} catch(e){{}}
  scanDom();
  try {{
    var oOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(m,u){{
      try {{ if (typeof u==='string' && interesting(u)) report(u,'xhr'); }} catch(e){{}}
      this.addEventListener('load', function(){{
        try {{
          var t = this.responseText;
          if (typeof t==='string' && t.trim().indexOf('#EXTM3U')===0) {{
            report(u, 'xhr-m3u8');
          }}
        }} catch(e){{}}
      }});
      return oOpen.apply(this, arguments);
    }};
  }} catch(e){{}}
  try {{
    if (window.fetch) {{
      var ofetch = window.fetch;
      window.fetch = function(){{
        try {{
          var a = arguments[0];
          var u = typeof a==='string' ? a : (a && a.url);
          if (u && interesting(u)) report(u,'fetch');
        }} catch(e){{}}
        var p = ofetch.apply(this, arguments);
        try {{
          p.then(function(res){{
            try {{
              var ru = res && res.url;
              if (ru && interesting(ru)) report(ru,'fetch-url');
              var ct = (res && res.headers && res.headers.get && res.headers.get('content-type')) || '';
              if (/mpegurl|mp2t|dash\+xml|video\//i.test(ct) && ru) report(ru,'fetch-ct');
            }} catch(e){{}}
          }});
        }} catch(e){{}}
        return p;
      }};
    }}
  }} catch(e){{}}
  try {{
    var _r_text = Response.prototype.text;
    Response.prototype.text = function(){{
      var self = this;
      return _r_text.call(this).then(function(text){{
        try {{
          if (typeof text==='string' && text.trim().indexOf('#EXTM3U')===0) {{
            report(self.url, 'resp-m3u8');
          }}
        }} catch(e){{}}
        return text;
      }});
    }};
  }} catch(e){{}}
  try {{
    var po = new PerformanceObserver(function(list){{
      list.getEntries().forEach(function(e){{
        if (e && e.name && interesting(e.name)) report(e.name,'perf');
      }});
    }});
    po.observe({{entryTypes:['resource']}});
  }} catch(e){{}}
  setInterval(scanDom, 1000);
  // 部分站点要点播才拉 m3u8：周期尝试播放按钮 / video.play
  setInterval(function(){{
    try {{
      document.querySelectorAll('video').forEach(function(v){{
        try {{ v.muted = true; var p = v.play && v.play(); if (p && p.catch) p.catch(function(){{}}); }} catch(e){{}}
      }});
      var btn = document.querySelector('.dplayer-play-icon, .vjs-big-play-button, .ytp-large-play-button, .jw-icon-display, [class*="play-btn"], [class*="playBtn"], .play');
      if (btn && btn.click) btn.click();
    }} catch(e){{}}
  }}, 2500);
}})();"#,
            prefix_json = serde_json::to_string(prefix).unwrap_or_else(|_| format!("\"{prefix}\""))
        )
    }

    /// Windows WebView2 原生请求监听：对齐 Kazumi HeadlessWebview 的网络层嗅探。
    /// 关键：旧版 AddWebResourceRequestedFilter 默认看不到 iframe 内请求，
    /// 必须用 ICoreWebView2_22 的 FilterWithRequestSourceKinds(ALL)；
    /// 同时挂 WebResourceResponseReceived（不依赖 filter，覆盖所有帧响应）。
    #[cfg(windows)]
    fn native_sniffer_installed_flag() -> &'static std::sync::atomic::AtomicBool {
        use std::sync::atomic::AtomicBool;
        static INSTALLED: AtomicBool = AtomicBool::new(false);
        &INSTALLED
    }

    #[cfg(windows)]
    fn reset_native_sniffer_installed() {
        use std::sync::atomic::Ordering;
        native_sniffer_installed_flag().store(false, Ordering::SeqCst);
    }

    #[cfg(not(windows))]
    fn reset_native_sniffer_installed() {}

    #[cfg(windows)]
    fn install_native_request_sniffer<R: Runtime>(
        window: &tauri::WebviewWindow<R>,
    ) -> Result<(), String> {
        use std::sync::atomic::Ordering;
        use std::sync::{Arc, Mutex};
        use webview2_com::Microsoft::Web::WebView2::Win32::{
            ICoreWebView2_2, ICoreWebView2_22, COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL,
            COREWEBVIEW2_WEB_RESOURCE_REQUEST_SOURCE_KINDS_ALL,
        };
        use webview2_com::{
            take_pwstr, AddScriptToExecuteOnDocumentCreatedCompletedHandler,
            WebResourceRequestedEventHandler, WebResourceResponseReceivedEventHandler,
        };
        use windows::core::{Interface, HSTRING, PWSTR};

        if native_sniffer_installed_flag().load(Ordering::SeqCst) {
            return Ok(());
        }

        let error = Arc::new(Mutex::new(None::<String>));
        let captured = error.clone();
        window
            .with_webview(move |platform| {
                let result = (|| -> Result<(), String> {
                    let core = unsafe {
                        platform
                            .controller()
                            .CoreWebView2()
                            .map_err(|e| e.to_string())?
                    };
                    unsafe {
                        // WebView2 document-created 脚本会进入随后创建的跨域子 frame；
                        // Tauri 的 initialization_script 在这里不能保证覆盖 player iframe。
                        let core_for_script = core.clone();
                        let script = sniff_init_script();
                        AddScriptToExecuteOnDocumentCreatedCompletedHandler::wait_for_async_operation(
                            Box::new(move |handler| {
                                core_for_script
                                    .AddScriptToExecuteOnDocumentCreated(
                                        &HSTRING::from(script),
                                        &handler,
                                    )
                                    .map_err(webview2_com::Error::WindowsError)
                            }),
                            Box::new(|error_code, _id| error_code),
                        )
                        .map_err(|e| e.to_string())?;

                        // 1) 请求过滤器：强制包含 iframe / worker 来源
                        let filter = HSTRING::from("*");
                        if let Ok(v22) = core.cast::<ICoreWebView2_22>() {
                            v22.AddWebResourceRequestedFilterWithRequestSourceKinds(
                                &filter,
                                COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL,
                                COREWEBVIEW2_WEB_RESOURCE_REQUEST_SOURCE_KINDS_ALL,
                            )
                            .map_err(|e| e.to_string())?;
                        } else {
                            core.AddWebResourceRequestedFilter(
                                &filter,
                                COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL,
                            )
                            .map_err(|e| e.to_string())?;
                        }

                        let mut token_req = 0_i64;
                        core.add_WebResourceRequested(
                            &WebResourceRequestedEventHandler::create(Box::new(move |_, args| {
                                let Some(args) = args else {
                                    return Ok(());
                                };
                                let request = args.Request()?;
                                let mut raw = PWSTR::null();
                                request.Uri(&mut raw)?;
                                let uri = take_pwstr(raw);
                                on_network_uri(&uri);
                                Ok(())
                            })),
                            &mut token_req,
                        )
                        .map_err(|e| e.to_string())?;

                        // 2) 响应事件：不依赖 filter，覆盖所有 frame 的完成请求
                        if let Ok(v2) = core.cast::<ICoreWebView2_2>() {
                            let mut token_res = 0_i64;
                            v2.add_WebResourceResponseReceived(
                                &WebResourceResponseReceivedEventHandler::create(Box::new(
                                    move |_, args| {
                                        let Some(args) = args else {
                                            return Ok(());
                                        };
                                        let request = args.Request()?;
                                        let mut raw = PWSTR::null();
                                        request.Uri(&mut raw)?;
                                        let uri = take_pwstr(raw);
                                        on_network_uri(&uri);
                                        // URL 可能是无扩展名 API；按响应 MIME 识别真正的视频请求。
                                        if let Ok(response) = args.Response() {
                                            let mut status = 0_i32;
                                            let _ = response.StatusCode(&mut status);
                                            if let Ok(headers) = response.Headers() {
                                                let mut raw_ct = PWSTR::null();
                                                if headers
                                                    .GetHeader(
                                                        &HSTRING::from("Content-Type"),
                                                        &mut raw_ct,
                                                    )
                                                    .is_ok()
                                                {
                                                    let content_type =
                                                        take_pwstr(raw_ct).to_ascii_lowercase();
                                                    if uri.contains("player")
                                                        || uri.contains("admin/api")
                                                        || looks_like_media_url(&uri)
                                                    {
                                                        push_resource(&format!(
                                                            "{uri} [HTTP {status}; {content_type}]"
                                                        ));
                                                    }
                                                    if content_type.contains("mpegurl")
                                                        || content_type.contains("video/")
                                                        || content_type.contains("mp2t")
                                                        || content_type.contains("dash+xml")
                                                        || content_type.contains("octet-stream")
                                                    {
                                                        push_resource(&format!(
                                                            "{uri} [Content-Type: {content_type}]"
                                                        ));
                                                        complete_media_uri(&uri);
                                                    }
                                                }
                                            }
                                        }
                                        Ok(())
                                    },
                                )),
                                &mut token_res,
                            )
                            .map_err(|e| e.to_string())?;
                        }
                    }
                    Ok(())
                })();
                if let Err(e) = result {
                    *captured.lock().unwrap() = Some(e);
                }
            })
            .map_err(|e| e.to_string())?;
        if let Some(e) = error.lock().unwrap().take() {
            return Err(format!("安装 WebView2 请求嗅探失败: {e}"));
        }
        native_sniffer_installed_flag().store(true, Ordering::SeqCst);
        Ok(())
    }

    #[cfg(not(windows))]
    fn install_native_request_sniffer<R: Runtime>(
        _window: &tauri::WebviewWindow<R>,
    ) -> Result<(), String> {
        Ok(())
    }

    /// MacCMS / gugu3：若 player.js 未写出 iframe，主动根据 player_aaaa 补挂播放器 iframe
    /// （player.gugu3.com 禁止直连，必须作为子帧并带上站点 Referer）。
    fn maccms_iframe_fallback_script() -> &'static str {
        r#"(function(){
  try {
    if (!window.player_aaaa) return;
    var a = window.player_aaaa;
    var url = String(a.url || '');
    if (!url) return;
    if (document.querySelector('iframe[src*="player."], #playleft iframe[src], .MacPlayer iframe[src*="http"]')) return;
    var host = (location.hostname || '').replace(/^www\./,'');
    var from = String(a.from || '');
    var next = String(a.link_next || '');
    var candidates = [];
    if (from === 'yunjie' || from === 'vwnet' || from.indexOf('gugu') >= 0 || host.indexOf('gugu') >= 0) {
      candidates.push('https://player.' + host + '/?url=' + encodeURIComponent(url) + (next ? '&next=' + encodeURIComponent(next) : ''));
      candidates.push('https://player.gugu3.com/?url=' + encodeURIComponent(url));
    }
    try {
      var list = (window.MacPlayerConfig && MacPlayerConfig.player_list) || {};
      var cfg = list[from];
      if (cfg && cfg.parse) candidates.unshift(String(cfg.parse) + encodeURIComponent(url));
    } catch(e){}
    if (!candidates.length) {
      candidates.push('https://player.' + host + '/?url=' + encodeURIComponent(url));
    }
    var src = candidates[0];
    var box = document.querySelector('#playleft') || document.querySelector('.player-left') || document.body;
    var f = document.createElement('iframe');
    f.setAttribute('allowfullscreen','true');
    f.setAttribute('allow','autoplay; fullscreen; encrypted-media');
    f.style.cssText = 'width:100%;height:100%;min-height:360px;border:0;background:#000;';
    f.src = src;
    box.appendChild(f);
    try { console.log('[reader-sniff] injected player iframe', src); } catch(e){}
  } catch(e){}
})();"#
    }

    /// 对齐 Kazumi HeadlessWebview：独立不可见 WebviewWindow（不挂到主窗口合成层）。
    fn ensure_sniff_window<R: Runtime>(
        app: &AppHandle<R>,
    ) -> Result<tauri::WebviewWindow<R>, String> {
        use tauri::WebviewWindowBuilder;

        // 清理旧版「主窗口子 WebView」实现，避免左上角叠层残留
        if let Some(old_child) = app.get_webview(LABEL) {
            let _ = old_child.close();
            reset_native_sniffer_installed();
        }

        if let Some(w) = app.get_webview_window(LABEL) {
            let _ = w.hide();
            let _ = install_native_request_sniffer(&w);
            return Ok(w);
        }

        let blank: url::Url = "about:blank"
            .parse()
            .map_err(|e: url::ParseError| e.to_string())?;
        let app_nav = app.clone();
        let mut builder = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::External(blank))
            .title("")
            .inner_size(360.0, 640.0)
            .visible(false)
            .skip_taskbar(true)
            .focused(false)
            .decorations(false)
            .resizable(false)
            .always_on_top(false)
            .initialization_script(&sniff_init_script())
            .on_navigation(move |nav| {
                let u = nav.as_str();
                if let Some(hit) = parse_sniff_hit_url(u) {
                    let _ = app_nav.emit(
                        "video-sniff-hit",
                        serde_json::json!({ "url": hit.clone(), "source": "script" }),
                    );
                    on_network_uri(&hit);
                    return false;
                }
                push_nav(u);
                if looks_like_media_url(u) {
                    let _ = app_nav.emit(
                        "video-sniff-hit",
                        serde_json::json!({ "url": u, "source": "navigation" }),
                    );
                    on_network_uri(u);
                    return false;
                }
                true
            });

        #[cfg(windows)]
        {
            builder = builder.shadow(false);
        }

        if let Ok(config_path) = crate::portable_paths::config_file_path() {
            if let Ok(root) = crate::portable_paths::effective_webview_data_root(&config_path) {
                if let Ok(data_dir) =
                    crate::portable_paths::webview_data_directory(&root, LABEL)
                {
                    builder = builder.data_directory(data_dir);
                }
            }
        }

        let win = builder
            .build()
            .map_err(|e| format!("创建无头嗅探窗失败: {e}"))?;
        let _ = win.hide();
        install_native_request_sniffer(&win)?;
        Ok(win)
    }

    fn close_visible_sniff_window<R: Runtime>(app: &AppHandle<R>) {
        // 调试用可见窗
        if let Some(w) = app.get_webview_window("video-sniff") {
            let _ = w.close();
        }
    }

    fn destroy_headless_sniff_window<R: Runtime>(app: &AppHandle<R>) {
        if let Some(w) = app.get_webview_window(LABEL) {
            let _ = w.close();
            reset_native_sniffer_installed();
        }
        if let Some(w) = app.get_webview(LABEL) {
            let _ = w.close();
            reset_native_sniffer_installed();
        }
    }

    pub async fn resolve<R: Runtime>(
        app: AppHandle<R>,
        url: String,
        timeout_ms: u64,
    ) -> Result<String, String> {
        let url = url.trim().to_string();
        if !url.starts_with("http://") && !url.starts_with("https://") {
            return Err("请输入 http(s) URL".into());
        }
        // 避免与可见调试窗抢焦点 / 用户关掉又重开
        close_visible_sniff_window(&app);

        // 取消上一次未完成的抽流
        if let Some(prev) = take_pending() {
            let _ = prev.tx.send(Err("已取消（新的抽流已开始）".into()));
        }

        let (tx, rx) = oneshot::channel();
        {
            let mut s = session().lock().map_err(|_| "嗅探状态锁失败".to_string())?;
            s.pending = Some(Pending { tx });
            s.nav_log.clear();
            s.resource_log.clear();
        }

        // 每次抽流重建隐藏窗，确保原生拦截器挂上且无脏状态 / 无主窗口叠层
        destroy_headless_sniff_window(&app);
        tokio::time::sleep(Duration::from_millis(50)).await;

        let win = ensure_sniff_window(&app)?;
        let _ = win.hide();
        let nav = format!(
            "window.location.replace({});",
            serde_json::to_string(&url).map_err(|e| e.to_string())?
        );
        win.eval(&nav).map_err(|e| format!("导航失败: {e}"))?;

        let timeout = timeout_ms.max(3_000);
        // 站点常在 iframe / 二跳后才建播放器：周期补注入嗅探脚本 + MacCMS iframe 兜底
        let reinject = {
            let win = win.clone();
            tauri::async_runtime::spawn(async move {
                let sniff = sniff_init_script();
                let maccms = maccms_iframe_fallback_script().to_string();
                for i in 0..(timeout / 1_000).max(1) {
                    tokio::time::sleep(Duration::from_millis(1_000)).await;
                    let _ = win.hide();
                    if win.eval(&sniff).is_err() {
                        break;
                    }
                    // 2s 起尝试补 iframe，给 player.js 一点时间
                    if i >= 1 {
                        let _ = win.eval(&maccms);
                    }
                }
            })
        };

        let result = tokio::time::timeout(Duration::from_millis(timeout), rx).await;
        reinject.abort();

        // 收尾：清空 pending、回空白页，释放站点脚本与媒体连接
        let _ = take_pending();
        let navs = nav_log_snapshot();
        let resources = resource_log_snapshot();
        let _ = win.eval("try{window.location.replace('about:blank');}catch(e){}");
        let _ = win.hide();

        match result {
            Ok(Ok(Ok(u))) => Ok(u),
            Ok(Ok(Err(e))) => Err(e),
            Ok(Err(_)) => Err("抽流通道已关闭".into()),
            Err(_) => {
                let nav_tail: Vec<String> = navs.iter().rev().take(3).cloned().collect();
                let res_tail: Vec<String> = resources.iter().rev().take(5).cloned().collect();
                let mut parts = vec![format!("抽流超时（{timeout}ms）")];
                if !nav_tail.is_empty() {
                    parts.push(format!("最近导航: {}", nav_tail.join(" | ")));
                } else {
                    parts.push("页面未发生导航".into());
                }
                if !res_tail.is_empty() {
                    parts.push(format!("拦截资源: {}", res_tail.join(" | ")));
                } else {
                    parts.push("未拦截到任何媒体/播放器资源（iframe 可能未加载）".into());
                }
                Err(parts.join("；"))
            }
        }
    }
}

/// Android：请求以指定引擎打开全屏播放页（libmpv | media3）
#[tauri::command]
pub async fn video_android_open_player<R: Runtime>(
    app: AppHandle<R>,
    engine: String,
    url: String,
    title: Option<String>,
    anime4k_mode: Option<String>,
    anime4k_quality: Option<String>,
    anime4k_deblur: Option<bool>,
    sub_font: Option<String>,
    sub_font_size: Option<f64>,
    sub_scale: Option<f64>,
    sub_pos: Option<f64>,
    sub_delay: Option<f64>,
    sub_color: Option<String>,
    hwdec: Option<String>,
    video_output: Option<String>,
    mpv_profile: Option<String>,
    volume: Option<f64>,
    volume_max: Option<f64>,
    muted: Option<bool>,
    listen_only: Option<bool>,
    start_sec: Option<f64>,
    http_headers: Option<String>,
    preferred_subtitle_path: Option<String>,
    opening_skip_sec: Option<f64>,
    ending_skip_sec: Option<f64>,
    skip_mode: Option<String>,
    hdr_tone_mapping: Option<String>,
    hdr_target_colorspace_hint: Option<bool>,
    audio_eq_preset: Option<String>,
    danmaku_path: Option<String>,
    danmaku_mode: Option<String>,
    danmaku_ass_path: Option<String>,
    frame_interp_enabled: Option<bool>,
    frame_interp_factor: Option<i32>,
    frame_interp_lightweight_fallback: Option<bool>,
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
        crate::platform::android::video_player::open_player(
            &app,
            crate::platform::android::video_player::AndroidOpenPlayerParams {
                engine: &eng,
                url: url.trim(),
                title: title.as_deref(),
                anime4k_mode: anime4k_mode.as_deref().unwrap_or("off"),
                anime4k_quality: anime4k_quality.as_deref().unwrap_or("balanced"),
                anime4k_deblur: anime4k_deblur.unwrap_or(false),
                sub_font: sub_font.as_deref().unwrap_or(""),
                sub_font_size: sub_font_size.unwrap_or(0.0),
                sub_scale: sub_scale.unwrap_or(1.0),
                sub_pos: sub_pos.unwrap_or(100.0),
                sub_delay: sub_delay.unwrap_or(0.0),
                sub_color: sub_color.as_deref().unwrap_or(""),
                hwdec: hwdec.as_deref().unwrap_or("mediacodec,mediacodec-copy,no"),
                video_output: video_output.as_deref().unwrap_or("gpu"),
                mpv_profile: mpv_profile.as_deref().unwrap_or("default"),
                volume: volume.unwrap_or(100.0),
                volume_max: volume_max.unwrap_or(300.0),
                muted: muted.unwrap_or(false),
                listen_only: listen_only.unwrap_or(false),
                start_sec: start_sec.unwrap_or(0.0),
                http_headers: http_headers.as_deref().unwrap_or(""),
                preferred_subtitle_path: preferred_subtitle_path.as_deref().unwrap_or(""),
                opening_skip_sec: opening_skip_sec.unwrap_or(0.0),
                ending_skip_sec: ending_skip_sec.unwrap_or(0.0),
                skip_mode: skip_mode.as_deref().unwrap_or("fixed"),
                hdr_tone_mapping: hdr_tone_mapping.as_deref().unwrap_or("mobius"),
                hdr_target_colorspace_hint: hdr_target_colorspace_hint.unwrap_or(true),
                audio_eq_preset: audio_eq_preset.as_deref().unwrap_or("off"),
                danmaku_path: danmaku_path.as_deref().unwrap_or(""),
                danmaku_mode: danmaku_mode.as_deref().unwrap_or("overlay"),
                danmaku_ass_path: danmaku_ass_path.as_deref().unwrap_or(""),
                frame_interp_enabled: frame_interp_enabled.unwrap_or(false),
                frame_interp_factor: frame_interp_factor.unwrap_or(2).clamp(2, 4),
                frame_interp_lightweight_fallback: frame_interp_lightweight_fallback
                    .unwrap_or(false),
            },
        )
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (
            app,
            title,
            anime4k_mode,
            anime4k_quality,
            anime4k_deblur,
            sub_font,
            sub_font_size,
            sub_scale,
            sub_pos,
            sub_delay,
            sub_color,
            hwdec,
            video_output,
            mpv_profile,
            volume,
            volume_max,
            muted,
            listen_only,
            start_sec,
            http_headers,
            preferred_subtitle_path,
            opening_skip_sec,
            ending_skip_sec,
            skip_mode,
            hdr_tone_mapping,
            hdr_target_colorspace_hint,
            audio_eq_preset,
            danmaku_path,
            danmaku_mode,
            danmaku_ass_path,
            frame_interp_enabled,
            frame_interp_factor,
            frame_interp_lightweight_fallback,
        );
        Err("video_android_open_player 仅 Android 可用".into())
    }
}

/// Android：探测 mpvlib 是否编进 APK（E2.B，不谎称可播）
#[tauri::command]
pub async fn video_android_libmpv_status<R: Runtime>(
    app: AppHandle<R>,
) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "android")]
    {
        let st = crate::platform::android::video_player::probe_libmpv(&app)?;
        Ok(serde_json::json!({
            "available": st.available,
            "detail": st.detail,
        }))
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(serde_json::json!({
            "available": false,
            "detail": "非 Android",
        }))
    }
}

/// Android：MediaStore 视频扫描（片库）
#[tauri::command]
pub async fn video_android_scan_media_store<R: Runtime>(
    app: AppHandle<R>,
) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "android")]
    {
        crate::platform::android::video_player::scan_media_store(&app)
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(serde_json::json!({ "items": [], "count": 0, "detail": "非 Android" }))
    }
}

#[cfg(all(
    feature = "video-libmpv",
    not(any(target_os = "android", target_os = "ios"))
))]
mod libmpv_session {
    use super::{VideoChapterInfo, VideoLibmpvStatus, VideoTrackInfo};
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

    fn with_mpv<F, T>(f: F) -> Result<T, String>
    where
        F: FnOnce(&Mpv) -> Result<T, String>,
    {
        let guard = lock_session()?;
        let mpv = guard
            .as_ref()
            .ok_or_else(|| "无活动 libmpv 会话".to_string())?;
        f(mpv)
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
            dirs.push(res.join("resources").join("libmpv"));
            dirs.push(res.clone());
        }
        if let Ok(exe) = std::env::current_exe() {
            if let Some(parent) = exe.parent() {
                dirs.push(parent.to_path_buf());
                dirs.push(parent.join("libmpv"));
                dirs.push(parent.join("resources").join("libmpv"));
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
        http_headers: Option<Vec<String>>,
        sub_font: Option<String>,
        sub_font_size: Option<f64>,
        sub_scale: Option<f64>,
        tone_mapping: Option<String>,
        target_colorspace_hint: Option<bool>,
        volume: Option<f64>,
        muted: Option<bool>,
    listen_only: Option<bool>,
    af: Option<String>,
    video_filter: Option<String>,
    lightweight_interp: bool,
) -> Result<(), String> {
        // 先干净关掉上一窗，否则旧 VO / 事件线程会残留
        stop_session();

        let want_vf = video_filter
            .as_ref()
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false);
        // RIFE/vf 与 gpu-next / 部分 shader 路径互斥：有 vf 时强制 gpu
        let gpu_next = gpu_next && !want_vf;

        let mpv = Mpv::with_initializer(|init| {
            init.set_option("force-window", "immediate")?;
            init.set_option("keep-open", "yes")?;
            // 勿设 idle=yes：关窗时需触发 quit；keep-open 已覆盖播完驻留
            init.set_option("osc", "yes")?;
            init.set_option("input-default-bindings", "yes")?;
            init.set_option("input-vo-keyboard", "yes")?;

            // 新版 libmpv 默认常为 gpu-next；Anime4K 的 glsl-shaders 依赖经典 vo=gpu。
            // 有超分链时强制 gpu；否则尊重用户 gpu-next，未勾选也显式 gpu，避免静默落到 gpu-next。
            let want_shaders = !gpu_next
                && glsl_shaders
                    .as_ref()
                    .map(|s| !s.trim().is_empty())
                    .unwrap_or(false);
            if gpu_next && !want_shaders {
                let _ = init.set_option("vo", "gpu-next");
            } else {
                let _ = init.set_option("vo", "gpu");
            }

            if let Some(ref hw) = hwdec {
                let hw = hw.trim();
                if !hw.is_empty() {
                    let _ = init.set_option("hwdec", hw);
                }
            }
            // Anime4K：尽量在初始化阶段就挂上（部分构建在 loadfile 后设置会被冲掉）
            if want_shaders {
                if let Some(ref glsl) = glsl_shaders {
                    let glsl = glsl.trim();
                    if !glsl.is_empty() {
                        let _ = init.set_option("glsl-shaders", glsl);
                    }
                }
            }

            if want_vf {
                if let Some(ref vf) = video_filter {
                    let vf = vf.trim();
                    if !vf.is_empty() {
                        let _ = init.set_option("vf", vf);
                    }
                }
            }

            if lightweight_interp {
                let _ = init.set_option("interpolation", "yes");
                let _ = init.set_option("video-sync", "display-resample");
            }

            apply_sub_style_init(&init, sub_font.as_deref(), sub_font_size, sub_scale);
            apply_hdr_init(&init, tone_mapping.as_deref(), target_colorspace_hint);
            if listen_only == Some(true) {
                let _ = init.set_option("vid", "no");
            }
            if let Some(v) = volume.filter(|x| x.is_finite()) {
                let _ = init.set_option("volume", v.clamp(0.0, 100.0));
            }
            if muted == Some(true) {
                let _ = init.set_option("mute", "yes");
            }
            if let Some(ref afv) = af {
                let afv = afv.trim();
                if !afv.is_empty() {
                    let _ = init.set_option("af", afv);
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

        if let Some(ref headers) = http_headers {
            let fields: Vec<&str> = headers
                .iter()
                .map(|h| h.trim())
                .filter(|h| !h.is_empty())
                .collect();
            if !fields.is_empty() {
                let joined = fields.join(",");
                mpv.set_property("http-header-fields", joined.as_str())
                    .map_err(|e| format!("设置 http-header-fields 失败: {e}"))?;
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

        // loadfile 后再强制应用一次，并读回校验（OSD 无 Shader 列表时多半是这里失败）
        if !gpu_next {
            if let Some(ref glsl) = glsl_shaders {
                let glsl = glsl.trim();
                if !glsl.is_empty() {
                    verify_glsl_shader_files(glsl)?;
                    apply_glsl_shaders(&mpv, glsl)?;
                }
            }
        }

        apply_sub_style_props(&mpv, sub_font.as_deref(), sub_font_size, sub_scale);
        apply_hdr_props(&mpv, tone_mapping.as_deref(), target_colorspace_hint);
        apply_audio_props(&mpv, volume, muted, listen_only);
        if let Some(ref afv) = af {
            let afv = afv.trim();
            if !afv.is_empty() {
                let _ = mpv.set_property("af", afv);
            }
        }

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

    fn apply_sub_style_init(
        init: &libmpv2::MpvInitializer,
        font: Option<&str>,
        font_size: Option<f64>,
        scale: Option<f64>,
    ) {
        if let Some(f) = font.map(str::trim).filter(|s| !s.is_empty()) {
            let _ = init.set_option("sub-font", f);
        }
        if let Some(sz) = font_size.filter(|v| v.is_finite() && *v > 0.0) {
            let _ = init.set_option("sub-font-size", sz);
        }
        if let Some(sc) = scale.filter(|v| v.is_finite() && *v > 0.0) {
            let _ = init.set_option("sub-scale", sc);
        }
    }

    fn apply_sub_style_props(
        mpv: &Mpv,
        font: Option<&str>,
        font_size: Option<f64>,
        scale: Option<f64>,
    ) {
        if let Some(f) = font.map(str::trim).filter(|s| !s.is_empty()) {
            let _ = mpv.set_property("sub-font", f);
        }
        if let Some(sz) = font_size.filter(|v| v.is_finite() && *v > 0.0) {
            let _ = mpv.set_property("sub-font-size", sz);
        }
        if let Some(sc) = scale.filter(|v| v.is_finite() && *v > 0.0) {
            let _ = mpv.set_property("sub-scale", sc);
        }
    }

    fn apply_hdr_init(
        init: &libmpv2::MpvInitializer,
        tone_mapping: Option<&str>,
        target_colorspace_hint: Option<bool>,
    ) {
        if let Some(tm) = tone_mapping.map(str::trim).filter(|s| !s.is_empty() && *s != "auto") {
            let _ = init.set_option("tone-mapping", tm);
        }
        if target_colorspace_hint == Some(true) {
            let _ = init.set_option("target-colorspace-hint", "yes");
        } else if target_colorspace_hint == Some(false) {
            let _ = init.set_option("target-colorspace-hint", "no");
        }
    }

    fn apply_hdr_props(
        mpv: &Mpv,
        tone_mapping: Option<&str>,
        target_colorspace_hint: Option<bool>,
    ) {
        if let Some(tm) = tone_mapping.map(str::trim).filter(|s| !s.is_empty() && *s != "auto") {
            let _ = mpv.set_property("tone-mapping", tm);
        }
        if target_colorspace_hint == Some(true) {
            let _ = mpv.set_property("target-colorspace-hint", "yes");
        } else if target_colorspace_hint == Some(false) {
            let _ = mpv.set_property("target-colorspace-hint", "no");
        }
    }

    fn apply_audio_props(
        mpv: &Mpv,
        volume: Option<f64>,
        muted: Option<bool>,
        listen_only: Option<bool>,
    ) {
        if let Some(v) = volume.filter(|x| x.is_finite()) {
            let _ = mpv.set_property("volume", v.clamp(0.0, 100.0));
        }
        if let Some(m) = muted {
            let _ = mpv.set_property("mute", if m { "yes" } else { "no" });
        }
        if listen_only == Some(true) {
            let _ = mpv.set_property("vid", "no");
        } else if listen_only == Some(false) {
            let _ = mpv.set_property("vid", "auto");
        }
    }

    pub fn set_glsl_shaders_live(glsl: Option<&str>) -> Result<(), String> {
        with_mpv(|mpv| {
            let glsl = glsl.map(str::trim).unwrap_or("");
            if glsl.is_empty() {
                let _ = mpv.set_property("glsl-shaders", "");
                let _ = mpv.command("change-list", &["glsl-shaders", "clr", ""]);
                return Ok(());
            }
            verify_glsl_shader_files(glsl)?;
            apply_glsl_shaders(mpv, glsl)
        })
    }

    pub fn set_video_filter_live(
        vf: Option<&str>,
        lightweight_interp: bool,
    ) -> Result<(), String> {
        with_mpv(|mpv| {
            let vf = vf.map(str::trim).unwrap_or("");
            if vf.is_empty() {
                let _ = mpv.set_property("vf", "");
            } else {
                mpv.set_property("vf", vf)
                    .map_err(|e| format!("set vf failed: {e}"))?;
                let _ = mpv.set_property("vo", "gpu");
            }
            if lightweight_interp {
                let _ = mpv.set_property("interpolation", "yes");
                let _ = mpv.set_property("video-sync", "display-resample");
            } else if vf.is_empty() {
                let _ = mpv.set_property("interpolation", "no");
            }
            Ok(())
        })
    }

    pub fn set_sub_style_live(
        font: Option<&str>,
        font_size: Option<f64>,
        scale: Option<f64>,
    ) -> Result<(), String> {
        with_mpv(|mpv| {
            apply_sub_style_props(mpv, font, font_size, scale);
            Ok(())
        })
    }

    pub fn set_audio_live(
        volume: Option<f64>,
        muted: Option<bool>,
        listen_only: Option<bool>,
    ) -> Result<(), String> {
        with_mpv(|mpv| {
            apply_audio_props(mpv, volume, muted, listen_only);
            Ok(())
        })
    }

    pub fn set_af_live(af: Option<&str>) -> Result<(), String> {
        with_mpv(|mpv| {
            let val = af.map(str::trim).filter(|s| !s.is_empty()).unwrap_or("");
            mpv.set_property("af", val)
                .map_err(|e| format!("设置 af 失败: {e}"))
        })
    }

    pub fn sub_add_file(path: &str) -> Result<(), String> {
        let path = path.trim();
        if path.is_empty() {
            return Err("字幕路径为空".into());
        }
        with_mpv(|mpv| {
            mpv.command("sub-add", &[path])
                .map_err(|e| format!("sub-add 失败: {e}"))
        })
    }

    /// Windows 用 `;` 分隔；类 Unix 用 `:`。含盘符的路径不得按 `:` 切开。
    fn verify_glsl_shader_files(glsl: &str) -> Result<(), String> {
        let sep = if cfg!(windows) || glsl.contains(';') {
            ';'
        } else {
            ':'
        };
        for part in glsl.split(sep) {
            let p = part.trim();
            if p.is_empty() {
                continue;
            }
            // 相对文件名：无法可靠校验，交给 mpv（应尽量传绝对路径）
            if !p.contains('/') && !p.contains('\\') && !p.contains(':') {
                continue;
            }
            if !PathBuf::from(p).is_file() {
                return Err(format!(
                    "Anime4K shader 文件不存在: {p}（请检查设置中的 shaders 目录或重新打包 resources/shaders）"
                ));
            }
        }
        Ok(())
    }

    fn apply_glsl_shaders(mpv: &Mpv, glsl: &str) -> Result<(), String> {
        // 1) 属性写入
        mpv.set_property("glsl-shaders", glsl).map_err(|e| {
            format!("设置 glsl-shaders 失败（Anime4K 未生效）: {e}")
        })?;
        // 2) change-list 再强制 set（部分 libmpv 构建对 property 字符串列表解析不稳）
        let _ = mpv.command("change-list", &["glsl-shaders", "set", glsl]);

        // 3) 读回校验：空则视为未挂上
        let applied: String = mpv
            .get_property("glsl-shaders")
            .map_err(|e| format!("读取 glsl-shaders 失败: {e}"))?;
        if applied.trim().is_empty() {
            return Err(
                "Anime4K glsl-shaders 设置后仍为空：请确认 VO=GPU，且 Shaders 路径可读"
                    .into(),
            );
        }
        // 至少应包含一个 Anime4K 文件名片段
        if !applied.to_ascii_lowercase().contains("anime4k") {
            return Err(format!(
                "glsl-shaders 已设置但未识别到 Anime4K 链: {applied}"
            ));
        }
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

    /// chapter-list；读失败返回空列表（不崩增强窗）
    pub fn list_chapters() -> Result<Vec<VideoChapterInfo>, String> {
        let guard = match lock_session() {
            Ok(g) => g,
            Err(_) => return Ok(vec![]),
        };
        let mpv = match guard.as_ref() {
            Some(m) => m,
            None => return Ok(vec![]),
        };
        let count: i64 = match mpv.get_property("chapter-list/count") {
            Ok(c) => c,
            Err(_) => return Ok(vec![]),
        };
        let mut out = Vec::new();
        for i in 0..count {
            let title: String = mpv
                .get_property(&format!("chapter-list/{i}/title"))
                .unwrap_or_default();
            let time: f64 = mpv
                .get_property(&format!("chapter-list/{i}/time"))
                .unwrap_or(0.0);
            let title = {
                let t = title.trim();
                if t.is_empty() {
                    format!("Chapter {}", i + 1)
                } else {
                    t.to_string()
                }
            };
            out.push(VideoChapterInfo {
                index: i,
                title,
                time,
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
