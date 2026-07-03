use serde::{Deserialize, Serialize};
use tauri::plugin::PluginHandle;
use tauri::{Manager, Runtime};

pub struct DisplayReaderAndroid<R: Runtime>(PluginHandle<R>);

#[derive(Serialize)]
struct BrightnessLevelArgs {
    level: u8,
}

#[derive(Deserialize)]
struct BrightnessLevelResponse {
    level: u8,
}

impl<R: Runtime> DisplayReaderAndroid<R> {
    pub fn set_brightness(&self, level: u8) -> Result<(), String> {
        self.0
            .run_mobile_plugin::<()>("setBrightness", BrightnessLevelArgs { level })
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_brightness(&self) -> Result<u8, String> {
        let resp = self
            .0
            .run_mobile_plugin::<BrightnessLevelResponse>("getBrightness", ())
            .map_err(|e| e.to_string())?;
        Ok(resp.level)
    }

    pub fn capture_brightness(&self) -> Result<(), String> {
        self.0
            .run_mobile_plugin::<()>("captureBrightness", ())
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn restore_brightness(&self) -> Result<(), String> {
        self.0
            .run_mobile_plugin::<()>("restoreBrightness", ())
            .map_err(|e| e.to_string())?;
        Ok(())
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
