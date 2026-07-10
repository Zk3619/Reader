use serde::Serialize;
use tauri::plugin::PluginHandle;
use tauri::{Manager, Runtime};

pub struct MusicMediaAndroid<R: Runtime>(PluginHandle<R>);

#[derive(Serialize)]
struct SyncMediaArgs {
    playing: bool,
    title: String,
    artist: String,
}

#[derive(Serialize)]
struct PluginUnitResponse {}

impl<R: Runtime> MusicMediaAndroid<R> {
    fn run_void(&self, command: &str, payload: impl Serialize) -> Result<(), String> {
        self.0
            .run_mobile_plugin(command, payload)
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
        .ok_or_else(|| "music-media plugin not loaded".into())?
}

pub fn sync_music_notification<R: Runtime>(
    app: &tauri::AppHandle<R>,
    playing: bool,
    title: &str,
    artist: &str,
) -> Result<(), String> {
    with_music_media(app, |plugin| {
        plugin.run_void(
            "syncMusicNotification",
            SyncMediaArgs {
                playing,
                title: title.to_string(),
                artist: artist.to_string(),
            },
        )
    })
}

pub fn request_overlay_permission<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    with_music_media(app, |plugin| plugin.run_void("requestOverlayPermission", ()))
}
