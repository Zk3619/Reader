use serde::{Deserialize, Serialize};
use tauri::plugin::PluginHandle;
use tauri::{Manager, Runtime};

pub struct MusicMediaAndroid<R: Runtime>(PluginHandle<R>);

#[derive(Serialize)]
struct SyncMediaArgs {
    playing: bool,
    title: String,
    artist: String,
    #[serde(rename = "coverUrl")]
    cover_url: String,
    #[serde(rename = "positionSec")]
    position_sec: f64,
    #[serde(rename = "durationSec")]
    duration_sec: f64,
}

#[derive(Deserialize)]
struct PluginUnitResponse {}

#[derive(Deserialize)]
struct AllowedResponse {
    #[serde(default)]
    allowed: bool,
}

#[derive(Deserialize)]
struct ShownResponse {
    #[serde(default)]
    shown: bool,
}

#[derive(Deserialize)]
struct NetworkTypeResponse {
    #[serde(rename = "type", default)]
    kind: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopLyricShowArgs {
    pub locked: bool,
    pub text_size_sp: f32,
    pub color: String,
    pub alpha: f32,
    pub align: String,
    pub x: i32,
    pub y: i32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopLyricTextArgs {
    pub line: String,
    pub meta: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopLyricStyleArgs {
    pub text_size_sp: f32,
    pub color: String,
    pub alpha: f32,
    pub align: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopLyricLockArgs {
    pub locked: bool,
}

impl<R: Runtime> MusicMediaAndroid<R> {
    fn run_void(&self, command: &str, payload: impl Serialize) -> Result<(), String> {
        self.0
            .run_mobile_plugin::<PluginUnitResponse>(command, payload)
            .map(|_| ())
            .map_err(|e| e.to_string())
    }

    fn run_allowed(&self, command: &str) -> Result<bool, String> {
        self.0
            .run_mobile_plugin::<AllowedResponse>(command, ())
            .map(|r| r.allowed)
            .map_err(|e| e.to_string())
    }

    fn run_shown(&self, command: &str) -> Result<bool, String> {
        self.0
            .run_mobile_plugin::<ShownResponse>(command, ())
            .map(|r| r.shown)
            .map_err(|e| e.to_string())
    }

    fn run_network_type(&self, command: &str) -> Result<String, String> {
        self.0
            .run_mobile_plugin::<NetworkTypeResponse>(command, ())
            .map(|r| r.kind)
            .map_err(|e| e.to_string())
    }
}

pub fn init_plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("music-media")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            {
                let handle = api.register_android_plugin("com.zkingz.reader", "MusicMediaPlugin")?;
                app.manage(MusicMediaAndroid(handle));
            }
            Ok(())
        })
        .build()
}

pub fn with_music_media<R: Runtime, T, F>(app: &tauri::AppHandle<R>, f: F) -> Result<T, String>
where
    F: FnOnce(&MusicMediaAndroid<R>) -> Result<T, String>,
{
    app.try_state::<MusicMediaAndroid<R>>()
        .map(|h| f(&h))
        .ok_or_else(|| "music-media plugin not loaded".to_string())?
}

pub fn sync_music_notification<R: Runtime>(
    app: &tauri::AppHandle<R>,
    playing: bool,
    title: &str,
    artist: &str,
    cover_url: &str,
    position_sec: f64,
    duration_sec: f64,
) -> Result<(), String> {
    with_music_media(app, |plugin| {
        plugin.run_void(
            "syncMusicNotification",
            SyncMediaArgs {
                playing,
                title: title.to_string(),
                artist: artist.to_string(),
                cover_url: cover_url.to_string(),
                position_sec,
                duration_sec,
            },
        )
    })
}

pub fn request_overlay_permission<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    with_music_media(app, |plugin| plugin.run_void("requestOverlayPermission", ()))
}

pub fn request_ignore_battery_optimizations<R: Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<(), String> {
    with_music_media(app, |plugin| {
        plugin.run_void("requestIgnoreBatteryOptimizations", ())
    })
}

pub fn check_overlay_permission<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<bool, String> {
    with_music_media(app, |plugin| plugin.run_allowed("checkOverlayPermission"))
}

pub fn show_desktop_lyric<R: Runtime>(
    app: &tauri::AppHandle<R>,
    args: DesktopLyricShowArgs,
) -> Result<(), String> {
    with_music_media(app, |plugin| {
        plugin
            .0
            .run_mobile_plugin::<ShownResponse>("showDesktopLyric", args)
            .map(|_| ())
            .map_err(|e| e.to_string())
    })
}

pub fn hide_desktop_lyric<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    with_music_media(app, |plugin| plugin.run_void("hideDesktopLyric", ()))
}

pub fn set_desktop_lyric_text<R: Runtime>(
    app: &tauri::AppHandle<R>,
    line: &str,
    meta: &str,
) -> Result<(), String> {
    with_music_media(app, |plugin| {
        plugin.run_void(
            "setDesktopLyricText",
            DesktopLyricTextArgs {
                line: line.to_string(),
                meta: meta.to_string(),
            },
        )
    })
}

pub fn set_desktop_lyric_style<R: Runtime>(
    app: &tauri::AppHandle<R>,
    args: DesktopLyricStyleArgs,
) -> Result<(), String> {
    with_music_media(app, |plugin| plugin.run_void("setDesktopLyricStyle", args))
}

pub fn set_desktop_lyric_lock<R: Runtime>(
    app: &tauri::AppHandle<R>,
    locked: bool,
) -> Result<(), String> {
    with_music_media(app, |plugin| {
        plugin.run_void("setDesktopLyricLock", DesktopLyricLockArgs { locked })
    })
}

pub fn is_desktop_lyric_shown<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<bool, String> {
    with_music_media(app, |plugin| plugin.run_shown("isDesktopLyricShown"))
}

pub fn get_android_network_type<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<String, String> {
    with_music_media(app, |plugin| plugin.run_network_type("getNetworkType"))
}
