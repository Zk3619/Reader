//! Rust 原生增强窗（门禁 C，可砍）
//! v1：仅软解 + 纹理上传 ≤1080p；hwaccel↔wgpu 互通另开 spike。
//! Feature 未开时 status.available=false。

use serde::Serialize;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeEnhanceStatus {
    pub available: bool,
    pub detail: String,
    /// v1 约束说明
    pub soft_decode_only: bool,
    pub max_height: u32,
}

#[tauri::command]
pub fn video_native_enhance_status() -> NativeEnhanceStatus {
    #[cfg(feature = "video-native-enhance")]
    {
        NativeEnhanceStatus {
            available: true,
            detail: "video-native-enhance feature enabled (v1 soft-decode ≤1080p)".into(),
            soft_decode_only: true,
            max_height: 1080,
        }
    }
    #[cfg(not(feature = "video-native-enhance"))]
    {
        NativeEnhanceStatus {
            available: false,
            detail: "build without video-native-enhance (wgpu+ort); spike deferred".into(),
            soft_decode_only: true,
            max_height: 1080,
        }
    }
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct NativeEnhanceOpenArgs {
    pub url: String,
    pub title: Option<String>,
    pub start_sec: Option<f64>,
}

/// v1：未实现完整独立窗时返回明确错误（可砍项）
#[tauri::command]
pub async fn video_native_enhance_open_window(args: NativeEnhanceOpenArgs) -> Result<(), String> {
    #[cfg(feature = "video-native-enhance")]
    {
        let _ = args;
        Err(
            "native enhance window v1 soft-decode path not fully wired; use web or mpv"
                .into(),
        )
    }
    #[cfg(not(feature = "video-native-enhance"))]
    {
        let _ = args;
        Err("video-native-enhance feature not enabled".into())
    }
}

#[tauri::command]
pub async fn video_native_enhance_close() -> Result<(), String> {
    Ok(())
}
