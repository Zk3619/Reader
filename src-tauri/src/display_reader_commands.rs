use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct DisplayBrightnessProbe {
    pub native: bool,
    pub overlay: bool,
}

#[tauri::command]
pub fn probe_display_brightness() -> DisplayBrightnessProbe {
    let native = crate::desktop_brightness::probe_native_brightness();
    DisplayBrightnessProbe {
        native,
        overlay: true,
    }
}

#[tauri::command]
pub fn get_display_brightness() -> Result<u8, String> {
    crate::desktop_brightness::get_brightness()
}

#[tauri::command]
pub fn set_display_brightness(level: u8) -> Result<(), String> {
    crate::desktop_brightness::set_brightness(level)
}

#[tauri::command]
pub fn set_screen_orientation(_mode: u8) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        return Err("set_screen_orientation: Android JNI not wired in this build".into());
    }
    #[cfg(not(target_os = "android"))]
    {
        Err("set_screen_orientation is only available on Android".into())
    }
}

#[tauri::command]
pub fn set_keep_screen_on(seconds: i32) -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows::Win32::System::Power::{SetThreadExecutionState, ES_CONTINUOUS, ES_DISPLAY_REQUIRED};
        unsafe {
            if seconds == 0 {
                SetThreadExecutionState(ES_CONTINUOUS);
            } else {
                SetThreadExecutionState(ES_CONTINUOUS | ES_DISPLAY_REQUIRED);
            }
        }
        return Ok(());
    }
    #[cfg(target_os = "android")]
    {
        let _ = seconds;
        return Err("set_keep_screen_on: Android JNI not wired in this build".into());
    }
    #[cfg(not(any(windows, target_os = "android")))]
    {
        let _ = seconds;
        Ok(())
    }
}
