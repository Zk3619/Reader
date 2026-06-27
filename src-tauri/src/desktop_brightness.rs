#[cfg(target_os = "linux")]
mod linux {
    use std::fs;
    use std::path::PathBuf;

    fn backlight_dir() -> Option<PathBuf> {
        let root = PathBuf::from("/sys/class/backlight");
        let mut entries = fs::read_dir(&root).ok()?;
        let first = entries.next()?.ok()?;
        Some(first.path())
    }

    pub fn probe() -> bool {
        backlight_dir().is_some()
    }

    pub fn get_brightness() -> Result<u8, String> {
        let dir = backlight_dir().ok_or_else(|| "no backlight".to_string())?;
        let max: u32 = fs::read_to_string(dir.join("max_brightness"))
            .map_err(|e| e.to_string())?
            .trim()
            .parse()
            .map_err(|e| format!("parse max: {e}"))?;
        let current: u32 = fs::read_to_string(dir.join("brightness"))
            .map_err(|e| e.to_string())?
            .trim()
            .parse()
            .map_err(|e| format!("parse brightness: {e}"))?;
        if max == 0 {
            return Ok(0);
        }
        Ok(((current * 100) / max).min(100) as u8)
    }

    pub fn set_brightness(level: u8) -> Result<(), String> {
        let dir = backlight_dir().ok_or_else(|| "no backlight".to_string())?;
        let max: u32 = fs::read_to_string(dir.join("max_brightness"))
            .map_err(|e| e.to_string())?
            .trim()
            .parse()
            .map_err(|e| format!("parse max: {e}"))?;
        let value = ((level as u32) * max / 100).min(max);
        fs::write(dir.join("brightness"), value.to_string()).map_err(|e| e.to_string())
    }
}

#[cfg(windows)]
mod windows_brightness {
    use std::mem::size_of;
    use windows::core::PCWSTR;
    use windows::Win32::Devices::Display::{
        DISPLAY_BRIGHTNESS, IOCTL_VIDEO_QUERY_DISPLAY_BRIGHTNESS,
        IOCTL_VIDEO_SET_DISPLAY_BRIGHTNESS,
    };
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::Storage::FileSystem::{
        CreateFileW, FILE_GENERIC_READ, FILE_GENERIC_WRITE, FILE_SHARE_READ, FILE_SHARE_WRITE,
        OPEN_EXISTING,
    };
    use windows::Win32::System::IO::DeviceIoControl;

    fn display_handle() -> Result<HANDLE, String> {
        let path: Vec<u16> = "\\\\.\\LCD\0".encode_utf16().collect();
        unsafe {
            CreateFileW(
                PCWSTR(path.as_ptr()),
                FILE_GENERIC_READ.0 | FILE_GENERIC_WRITE.0,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                None,
                OPEN_EXISTING,
                Default::default(),
                None,
            )
            .map_err(|e| e.to_string())
        }
    }

    pub fn probe() -> bool {
        display_handle().is_ok()
    }

    pub fn get_brightness() -> Result<u8, String> {
        let handle = display_handle()?;
        let mut display_brightness = DISPLAY_BRIGHTNESS::default();
        let mut returned = 0u32;
        unsafe {
            DeviceIoControl(
                handle,
                IOCTL_VIDEO_QUERY_DISPLAY_BRIGHTNESS,
                None,
                0,
                Some(&mut display_brightness as *mut _ as *mut _),
                size_of::<DISPLAY_BRIGHTNESS>() as u32,
                Some(&mut returned),
                None,
            )
            .map_err(|e| e.to_string())?;
        }
        Ok(display_brightness.ucACBrightness)
    }

    pub fn set_brightness(level: u8) -> Result<(), String> {
        let handle = display_handle()?;
        let mut display_brightness = DISPLAY_BRIGHTNESS {
            ucACBrightness: level,
            ucDCBrightness: level,
            ucDisplayPolicy: 3,
        };
        let mut returned = 0u32;
        unsafe {
            DeviceIoControl(
                handle,
                IOCTL_VIDEO_SET_DISPLAY_BRIGHTNESS,
                Some(&mut display_brightness as *mut _ as *mut _),
                size_of::<DISPLAY_BRIGHTNESS>() as u32,
                None,
                0,
                Some(&mut returned),
                None,
            )
            .map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

pub fn probe_native_brightness() -> bool {
    #[cfg(target_os = "linux")]
    {
        return linux::probe();
    }
    #[cfg(windows)]
    {
        return windows_brightness::probe();
    }
    #[cfg(not(any(target_os = "linux", windows)))]
    {
        false
    }
}

pub fn get_brightness() -> Result<u8, String> {
    #[cfg(target_os = "linux")]
    {
        return linux::get_brightness();
    }
    #[cfg(windows)]
    {
        return windows_brightness::get_brightness();
    }
    #[cfg(not(any(target_os = "linux", windows)))]
    {
        Err("brightness not supported on this platform".into())
    }
}

pub fn set_brightness(level: u8) -> Result<(), String> {
    let level = level.min(100);
    #[cfg(target_os = "linux")]
    {
        return linux::set_brightness(level);
    }
    #[cfg(windows)]
    {
        return windows_brightness::set_brightness(level);
    }
    #[cfg(not(any(target_os = "linux", windows)))]
    {
        let _ = level;
        Err("brightness not supported on this platform".into())
    }
}
