use serde::{Deserialize, Serialize};
use tauri::plugin::PluginHandle;
use tauri::{Manager, Runtime};

pub struct DisplayReaderAndroid<R: Runtime>(PluginHandle<R>);

#[derive(Serialize)]
struct BrightnessLevelArgs {
    level: u8,
    #[serde(default)]
    sync_system: bool,
}

#[derive(Deserialize)]
struct BrightnessLevelResponse {
    level: u8,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetBrightnessPluginResponse {
    /// Kotlin 回传当前亮度；前端目前只用 system_applied / needs_write_settings
    #[allow(dead_code)]
    pub level: u8,
    #[serde(default)]
    pub system_applied: bool,
    #[serde(default)]
    pub needs_write_settings: bool,
}

#[derive(Deserialize)]
struct CanWriteSettingsResponse {
    #[serde(default)]
    allowed: bool,
}

/// Kotlin `invoke.resolve(JSObject())` 返回 `{}`，不能反序列化为 `()`
#[derive(Deserialize)]
struct PluginUnitResponse {}

#[derive(Serialize)]
struct ScreenOrientationArgs {
    mode: u8,
}

#[derive(Serialize)]
struct KeepScreenOnArgs {
    seconds: i32,
}

impl<R: Runtime> DisplayReaderAndroid<R> {
    fn run_void_plugin<T: Serialize>(&self, command: &str, payload: T) -> Result<(), String> {
        let _: PluginUnitResponse = self
            .0
            .run_mobile_plugin(command, payload)
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn set_brightness(
        &self,
        level: u8,
        sync_system: bool,
    ) -> Result<SetBrightnessPluginResponse, String> {
        self.0
            .run_mobile_plugin(
                "setBrightness",
                BrightnessLevelArgs {
                    level,
                    sync_system,
                },
            )
            .map_err(|e| e.to_string())
    }

    pub fn get_brightness(&self) -> Result<u8, String> {
        let resp = self
            .0
            .run_mobile_plugin::<BrightnessLevelResponse>("getBrightness", ())
            .map_err(|e| e.to_string())?;
        Ok(resp.level)
    }

    pub fn capture_brightness(&self) -> Result<(), String> {
        self.run_void_plugin("captureBrightness", ())
    }

    pub fn restore_brightness(&self) -> Result<(), String> {
        self.run_void_plugin("restoreBrightness", ())
    }

    pub fn follow_system_brightness(&self) -> Result<(), String> {
        self.run_void_plugin("followSystemBrightness", ())
    }

    pub fn can_write_display_settings(&self) -> Result<bool, String> {
        let resp = self
            .0
            .run_mobile_plugin::<CanWriteSettingsResponse>("canWriteDisplaySettings", ())
            .map_err(|e| e.to_string())?;
        Ok(resp.allowed)
    }

    pub fn open_write_settings_permission(&self) -> Result<(), String> {
        self.run_void_plugin("openWriteSettingsPermission", ())
    }

    pub fn set_screen_orientation(&self, mode: u8) -> Result<(), String> {
        self.run_void_plugin("setScreenOrientation", ScreenOrientationArgs { mode })
    }

    pub fn set_keep_screen_on(&self, seconds: i32) -> Result<(), String> {
        self.run_void_plugin("setKeepScreenOn", KeepScreenOnArgs { seconds })
    }
}

pub fn init_plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("display-reader")
        .setup(|app, api| {
            let handle =
                api.register_android_plugin("com.zkingz.reader", "DisplayReaderPlugin")?;
            app.manage(DisplayReaderAndroid(handle));
            Ok(())
        })
        .build()
}

pub fn with_android<R: Runtime, F, T>(app: &tauri::AppHandle<R>, f: F) -> Option<Result<T, String>>
where
    F: FnOnce(&DisplayReaderAndroid<R>) -> Result<T, String>,
{
    app.try_state::<DisplayReaderAndroid<R>>()
        .map(|state| f(&state))
}
