use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetDisplayBrightnessResult {
    pub window_applied: bool,
    pub system_applied: bool,
    pub needs_write_settings: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct DisplayBrightnessProbe {
    pub native: bool,
    pub overlay: bool,
}

#[tauri::command]
pub fn probe_display_brightness(app: tauri::AppHandle) -> DisplayBrightnessProbe {
    #[cfg(target_os = "android")]
    {
        let native = crate::platform::android::display_brightness::with_android(
            &app,
            |android| android.get_brightness(),
        )
        .map(|r| r.is_ok())
        .unwrap_or(false);
        return DisplayBrightnessProbe {
            native,
            overlay: true,
        };
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = &app;
        let native = crate::desktop_brightness::probe_native_brightness();
        DisplayBrightnessProbe {
            native,
            overlay: true,
        }
    }
}

#[tauri::command]
pub fn get_display_brightness(app: tauri::AppHandle) -> Result<u8, String> {
    #[cfg(target_os = "android")]
    {
        if let Some(result) = crate::platform::android::display_brightness::with_android(
            &app,
            |android| android.get_brightness(),
        ) {
            return result;
        }
        return Err("display brightness plugin not initialized".into());
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = &app;
        crate::desktop_brightness::get_brightness()
    }
}

#[tauri::command]
pub fn set_display_brightness(
    app: tauri::AppHandle,
    level: u8,
    sync_system: Option<bool>,
) -> Result<SetDisplayBrightnessResult, String> {
    let sync_system = sync_system.unwrap_or(false);
    #[cfg(target_os = "android")]
    {
        if let Some(result) = crate::platform::android::display_brightness::with_android(
            &app,
            |android| {
                android
                    .set_brightness(level, sync_system)
                    .map(|resp| SetDisplayBrightnessResult {
                        window_applied: true,
                        system_applied: resp.system_applied,
                        needs_write_settings: resp.needs_write_settings,
                    })
            },
        ) {
            return result;
        }
        return Err("display reader plugin not initialized".into());
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = sync_system;
        let _ = &app;
        crate::desktop_brightness::set_brightness(level)?;
        Ok(SetDisplayBrightnessResult {
            window_applied: true,
            system_applied: false,
            needs_write_settings: false,
        })
    }
}

#[tauri::command]
pub fn capture_display_brightness(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        if let Some(result) = crate::platform::android::display_brightness::with_android(
            &app,
            |android| android.capture_brightness(),
        ) {
            return result;
        }
    }
    #[cfg(not(target_os = "android"))]
    let _ = &app;
    Ok(())
}

#[tauri::command]
pub fn restore_display_brightness(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        if let Some(result) = crate::platform::android::display_brightness::with_android(
            &app,
            |android| android.restore_brightness(),
        ) {
            return result;
        }
    }
    #[cfg(not(target_os = "android"))]
    let _ = &app;
    Ok(())
}

#[tauri::command]
pub fn follow_system_display_brightness(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        if let Some(result) = crate::platform::android::display_brightness::with_android(
            &app,
            |android| android.follow_system_brightness(),
        ) {
            return result;
        }
        return Err("display reader plugin not initialized".into());
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = &app;
        Ok(())
    }
}

#[tauri::command]
pub fn can_write_display_settings(app: tauri::AppHandle) -> Result<bool, String> {
    #[cfg(target_os = "android")]
    {
        if let Some(result) = crate::platform::android::display_brightness::with_android(
            &app,
            |android| android.can_write_display_settings(),
        ) {
            return result;
        }
        return Ok(false);
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = &app;
        Ok(false)
    }
}

#[tauri::command]
pub fn open_display_write_settings(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        if let Some(result) = crate::platform::android::display_brightness::with_android(
            &app,
            |android| android.open_write_settings_permission(),
        ) {
            return result;
        }
        return Err("display reader plugin not initialized".into());
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = &app;
        Ok(())
    }
}

#[tauri::command]
pub fn set_screen_orientation(app: tauri::AppHandle, mode: u8) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        if let Some(result) = crate::platform::android::display_brightness::with_android(
            &app,
            |android| android.set_screen_orientation(mode),
        ) {
            return result;
        }
        return Err("display reader plugin not initialized".into());
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, mode);
        Err("set_screen_orientation is only available on Android".into())
    }
}

#[tauri::command]
pub fn set_keep_screen_on(app: tauri::AppHandle, seconds: i32) -> Result<(), String> {
    #[cfg(windows)]
    {
        let _ = &app;
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
        if let Some(result) = crate::platform::android::display_brightness::with_android(
            &app,
            |android| android.set_keep_screen_on(seconds),
        ) {
            return result;
        }
        return Err("display reader plugin not initialized".into());
    }
    #[cfg(not(any(windows, target_os = "android")))]
    {
        let _ = (app, seconds);
        Ok(())
    }
}

#[tauri::command]
pub fn set_music_sleep_blocked(app: tauri::AppHandle, blocked: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        let _ = &app;
        use windows::Win32::System::Power::{
            SetThreadExecutionState, ES_CONTINUOUS, ES_SYSTEM_REQUIRED,
        };
        unsafe {
            SetThreadExecutionState(if blocked {
                ES_CONTINUOUS | ES_SYSTEM_REQUIRED
            } else {
                ES_CONTINUOUS
            });
        }
        return Ok(());
    }
    #[cfg(target_os = "android")]
    {
        if let Some(result) = crate::platform::android::display_brightness::with_android(
            &app,
            |android| android.set_keep_screen_on(if blocked { -1 } else { 0 }),
        ) {
            return result;
        }
        return Err("display reader plugin not initialized".into());
    }
    #[cfg(not(any(windows, target_os = "android")))]
    {
        let _ = (app, blocked);
        Ok(())
    }
}
