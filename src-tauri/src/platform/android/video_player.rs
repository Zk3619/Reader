use serde::{Deserialize, Serialize};
use tauri::plugin::PluginHandle;
use tauri::{AppHandle, Manager, Runtime};

pub struct VideoPlayerAndroid<R: Runtime>(PluginHandle<R>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenPlayerArgs {
    engine: String,
    url: String,
    title: String,
    anime4k_mode: String,
    anime4k_quality: String,
    anime4k_deblur: bool,
    sub_font: String,
    sub_font_size: f64,
    sub_scale: f64,
    sub_pos: f64,
    sub_delay: f64,
    sub_color: String,
    hwdec: String,
    video_output: String,
    mpv_profile: String,
    volume: f64,
    volume_max: f64,
    muted: bool,
    listen_only: bool,
    start_sec: f64,
    http_headers: String,
    preferred_subtitle_path: String,
    opening_skip_sec: f64,
    ending_skip_sec: f64,
    skip_mode: String,
    hdr_tone_mapping: String,
    hdr_target_colorspace_hint: bool,
    audio_eq_preset: String,
    danmaku_path: String,
    danmaku_mode: String,
    danmaku_ass_path: String,
    frame_interp_enabled: bool,
    frame_interp_factor: i32,
    frame_interp_lightweight_fallback: bool,
}

#[derive(Deserialize)]
struct OpenPlayerResponse {
    #[serde(default, rename = "ok")]
    _ok: bool,
}

impl<R: Runtime> VideoPlayerAndroid<R> {
    fn open_player(&self, args: OpenPlayerArgs) -> Result<(), String> {
        let _: OpenPlayerResponse = self
            .0
            .run_mobile_plugin("openPlayer", args)
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    fn probe_libmpv(&self) -> Result<LibmpvProbeResponse, String> {
        self.0
            .run_mobile_plugin("probeLibmpv", ())
            .map_err(|e| e.to_string())
    }

    fn scan_media_store(&self) -> Result<serde_json::Value, String> {
        self.0
            .run_mobile_plugin("scanMediaStore", ())
            .map_err(|e| e.to_string())
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LibmpvProbeResponse {
    #[serde(default)]
    available: bool,
    #[serde(default)]
    detail: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AndroidLibmpvStatus {
    pub available: bool,
    pub detail: String,
}

pub struct AndroidOpenPlayerParams<'a> {
    pub engine: &'a str,
    pub url: &'a str,
    pub title: Option<&'a str>,
    pub anime4k_mode: &'a str,
    pub anime4k_quality: &'a str,
    pub anime4k_deblur: bool,
    pub sub_font: &'a str,
    pub sub_font_size: f64,
    pub sub_scale: f64,
    pub sub_pos: f64,
    pub sub_delay: f64,
    pub sub_color: &'a str,
    pub hwdec: &'a str,
    pub video_output: &'a str,
    pub mpv_profile: &'a str,
    pub volume: f64,
    pub volume_max: f64,
    pub muted: bool,
    pub listen_only: bool,
    pub start_sec: f64,
    pub http_headers: &'a str,
    pub preferred_subtitle_path: &'a str,
    pub opening_skip_sec: f64,
    pub ending_skip_sec: f64,
    pub skip_mode: &'a str,
    pub hdr_tone_mapping: &'a str,
    pub hdr_target_colorspace_hint: bool,
    pub audio_eq_preset: &'a str,
    pub danmaku_path: &'a str,
    pub danmaku_mode: &'a str,
    pub danmaku_ass_path: &'a str,
    pub frame_interp_enabled: bool,
    pub frame_interp_factor: i32,
    pub frame_interp_lightweight_fallback: bool,
}

pub fn init_plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("video-player")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            {
                let handle =
                    api.register_android_plugin("com.zkingz.reader.video", "VideoPlayerPlugin")?;
                app.manage(VideoPlayerAndroid(handle));
            }
            #[cfg(not(target_os = "android"))]
            {
                let _ = (app, api);
            }
            Ok(())
        })
        .build()
}

pub fn open_player<R: Runtime>(
    app: &AppHandle<R>,
    p: AndroidOpenPlayerParams<'_>,
) -> Result<(), String> {
    let plugin = app
        .try_state::<VideoPlayerAndroid<R>>()
        .ok_or_else(|| "video-player plugin not loaded".to_string())?;
    plugin.open_player(OpenPlayerArgs {
        engine: p.engine.to_string(),
        url: p.url.to_string(),
        title: p.title.unwrap_or("").to_string(),
        anime4k_mode: p.anime4k_mode.to_string(),
        anime4k_quality: p.anime4k_quality.to_string(),
        anime4k_deblur: p.anime4k_deblur,
        sub_font: p.sub_font.to_string(),
        sub_font_size: p.sub_font_size,
        sub_scale: p.sub_scale,
        sub_pos: p.sub_pos,
        sub_delay: p.sub_delay,
        sub_color: p.sub_color.to_string(),
        hwdec: p.hwdec.to_string(),
        video_output: p.video_output.to_string(),
        mpv_profile: p.mpv_profile.to_string(),
        volume: p.volume,
        volume_max: p.volume_max,
        muted: p.muted,
        listen_only: p.listen_only,
        start_sec: p.start_sec,
        http_headers: p.http_headers.to_string(),
        preferred_subtitle_path: p.preferred_subtitle_path.to_string(),
        opening_skip_sec: p.opening_skip_sec,
        ending_skip_sec: p.ending_skip_sec,
        skip_mode: p.skip_mode.to_string(),
        hdr_tone_mapping: p.hdr_tone_mapping.to_string(),
        hdr_target_colorspace_hint: p.hdr_target_colorspace_hint,
        audio_eq_preset: p.audio_eq_preset.to_string(),
        danmaku_path: p.danmaku_path.to_string(),
        danmaku_mode: p.danmaku_mode.to_string(),
        danmaku_ass_path: p.danmaku_ass_path.to_string(),
        frame_interp_enabled: p.frame_interp_enabled,
        frame_interp_factor: p.frame_interp_factor,
        frame_interp_lightweight_fallback: p.frame_interp_lightweight_fallback,
    })
}

pub fn probe_libmpv<R: Runtime>(app: &AppHandle<R>) -> Result<AndroidLibmpvStatus, String> {
    let plugin = app
        .try_state::<VideoPlayerAndroid<R>>()
        .ok_or_else(|| "video-player plugin not loaded".to_string())?;
    let r = plugin.probe_libmpv()?;
    Ok(AndroidLibmpvStatus {
        available: r.available,
        detail: r.detail,
    })
}

pub fn scan_media_store<R: Runtime>(app: &AppHandle<R>) -> Result<serde_json::Value, String> {
    let plugin = app
        .try_state::<VideoPlayerAndroid<R>>()
        .ok_or_else(|| "video-player plugin not loaded".to_string())?;
    plugin.scan_media_store()
}
