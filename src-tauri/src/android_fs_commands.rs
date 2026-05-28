use serde::Serialize;
use tauri::AppHandle;

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct AndroidDirEntry {
    pub name: String,
    pub is_dir: bool,
    pub uri: String,
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct AndroidPickedFile {
    pub uri: String,
    pub name: String,
}

#[cfg(target_os = "android")]
fn file_uri_to_js(u: tauri_plugin_android_fs::FileUri) -> String {
    // 目录选择可能带 documentTopTreeUri，序列化后前端可原样 persist
    if u.document_top_tree_uri.is_some() {
        return u.to_json_string().unwrap_or(u.uri);
    }
    u.uri
}

#[cfg(target_os = "android")]
fn file_uri_from_js(s: &str) -> Result<tauri_plugin_android_fs::FileUri, String> {
    let trimmed = s.trim();
    if trimmed.starts_with('{') {
        tauri_plugin_android_fs::FileUri::from_json_str(trimmed).map_err(|e| e.to_string())
    } else {
        Ok(tauri_plugin_android_fs::FileUri::from_uri(trimmed))
    }
}

#[tauri::command]
pub async fn android_fs_probe(app: AppHandle) -> Result<bool, String> {
    #[cfg(target_os = "android")]
    {
        use tauri_plugin_android_fs::AndroidFsExt;
        let _ = app.android_fs_async();
        return Ok(true);
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(false)
    }
}

#[tauri::command]
pub async fn android_pick_files(
    app: AppHandle,
    mime_types: Vec<String>,
    multiple: bool,
) -> Result<Vec<AndroidPickedFile>, String> {
    #[cfg(target_os = "android")]
    {
        use tauri_plugin_android_fs::AndroidFsExt;
        let api = app.android_fs_async();
        let mimes: Vec<&str> = mime_types.iter().map(String::as_str).collect();
        let picked = api
            .file_picker()
            .pick_files(None, &mimes, multiple)
            .await
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for file_uri in picked {
            let name = api
                .get_name(&file_uri)
                .await
                .map_err(|e| e.to_string())?;
            out.push(AndroidPickedFile {
                uri: file_uri_to_js(file_uri),
                name,
            });
        }
        return Ok(out);
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, mime_types, multiple);
        Err("android_pick_files is only available on Android".into())
    }
}

/// 通过 SAF / android-fs 读取 content URI 全文（避免 plugin-fs 读 URI 失败）
#[tauri::command]
pub async fn android_read_uri_bytes(app: AppHandle, uri: String) -> Result<Vec<u8>, String> {
    #[cfg(target_os = "android")]
    {
        use std::io::Read;
        use tauri_plugin_android_fs::AndroidFsExt;
        let api = app.android_fs_async();
        let file_uri = file_uri_from_js(&uri)?;
        let mut file = api
            .open_file_readable(&file_uri)
            .await
            .map_err(|e| e.to_string())?;
        let mut buf = Vec::new();
        file.read_to_end(&mut buf).map_err(|e| e.to_string())?;
        return Ok(buf);
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, uri);
        Err("android_read_uri_bytes is only available on Android".into())
    }
}

#[tauri::command]
pub async fn android_delete_uri(app: AppHandle, uri: String) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        use tauri_plugin_android_fs::AndroidFsExt;
        let api = app.android_fs_async();
        let file_uri = file_uri_from_js(&uri)?;
        api.remove_file(&file_uri)
            .await
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, uri);
        Err("android_delete_uri is only available on Android".into())
    }
}

#[tauri::command]
pub async fn android_uri_display_name(app: AppHandle, uri: String) -> Result<String, String> {
    #[cfg(target_os = "android")]
    {
        use tauri_plugin_android_fs::AndroidFsExt;
        let api = app.android_fs_async();
        let file_uri = file_uri_from_js(&uri)?;
        return api.get_name(&file_uri).await.map_err(|e| e.to_string());
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, uri);
        Err("android_uri_display_name is only available on Android".into())
    }
}

#[tauri::command]
pub async fn android_pick_dir(app: AppHandle) -> Result<Option<String>, String> {
    #[cfg(target_os = "android")]
    {
        use tauri_plugin_android_fs::AndroidFsExt;
        let api = app.android_fs_async();
        let picked = api
            .file_picker()
            .pick_dir(None, false)
            .await
            .map_err(|e| e.to_string())?;
        return Ok(picked.map(file_uri_to_js));
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Err("android_pick_dir is only available on Android".into())
    }
}

#[tauri::command]
pub async fn android_persist_dir_permission(app: AppHandle, uri: String) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        use tauri_plugin_android_fs::AndroidFsExt;
        let api = app.android_fs_async();
        let file_uri = file_uri_from_js(&uri)?;
        api.file_picker()
            .persist_uri_permission(&file_uri)
            .await
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, uri);
        Err("android_persist_dir_permission is only available on Android".into())
    }
}

#[allow(dead_code)]
fn mime_for_file_name(name: &str) -> Option<&'static str> {
    let lower = name.to_ascii_lowercase();
    if lower.ends_with(".epub") {
        return Some("application/epub+zip");
    }
    if lower.ends_with(".txt") {
        return Some("text/plain");
    }
    None
}

/// 将书籍写入用户通过 SAF 选定的书籍库目录（L3 saf-tree 根）
#[tauri::command]
pub async fn android_write_book_to_tree(
    app: AppHandle,
    tree_uri: String,
    file_name: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    #[cfg(target_os = "android")]
    {
        use tauri_plugin_android_fs::AndroidFsExt;
        let api = app.android_fs_async();
        let dir_uri = file_uri_from_js(&tree_uri)?;
        let file_uri = api
            .create_new_file(&dir_uri, &file_name, mime_for_file_name(&file_name))
            .await
            .map_err(|e| e.to_string())?;
        api.write(&file_uri, &bytes)
            .await
            .map_err(|e| e.to_string())?;
        return Ok(file_uri_to_js(file_uri));
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, tree_uri, file_name, bytes);
        Err("android_write_book_to_tree is only available on Android".into())
    }
}

#[tauri::command]
pub async fn android_read_dir(app: AppHandle, uri: String) -> Result<Vec<AndroidDirEntry>, String> {
    #[cfg(target_os = "android")]
    {
        use tauri_plugin_android_fs::AndroidFsExt;
        use tauri_plugin_android_fs::Entry;
        let api = app.android_fs_async();
        let dir_uri = file_uri_from_js(&uri)?;
        let entries = api.read_dir(&dir_uri).await.map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for entry in entries {
            match entry {
                Entry::File { uri: file_uri, name, .. } => {
                    out.push(AndroidDirEntry {
                        name,
                        is_dir: false,
                        uri: file_uri.uri,
                    });
                }
                Entry::Dir { uri: file_uri, name, .. } => {
                    out.push(AndroidDirEntry {
                        name,
                        is_dir: true,
                        uri: file_uri.uri,
                    });
                }
            }
        }
        return Ok(out);
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, uri);
        Err("android_read_dir is only available on Android".into())
    }
}
