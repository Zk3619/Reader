//! 内嵌 iframe 的 document-start 脚本（Windows WebView2 子 frame 注入）

#[cfg(windows)]
mod windows_impl {
    use std::sync::atomic::{AtomicBool, Ordering};
    use tauri::WebviewWindow;
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2;
    use webview2_com::AddScriptToExecuteOnDocumentCreatedCompletedHandler;
    use windows::core::HSTRING;

    static BOOTSTRAP_INSTALLED: AtomicBool = AtomicBool::new(false);

    pub fn ensure_iframe_bootstrap(window: &WebviewWindow) -> Result<(), String> {
        if BOOTSTRAP_INSTALLED.load(Ordering::SeqCst) {
            return Ok(());
        }
        let script = include_str!("../scripts/inner_web_iframe_bootstrap.js").to_string();
        let err_slot = std::sync::Arc::new(std::sync::Mutex::new(None::<String>));
        let err_capture = err_slot.clone();
        window
            .with_webview(move |platform| {
                let result = (|| {
                    let webview = unsafe {
                        platform
                            .controller()
                            .CoreWebView2()
                            .map_err(|e| e.to_string())?
                    };
                    add_document_script(&webview, script)
                })();
                if let Err(e) = result {
                    *err_capture.lock().unwrap() = Some(e);
                }
            })
            .map_err(|e| e.to_string())?;

        if let Some(e) = err_slot.lock().unwrap().take() {
            return Err(e);
        }
        BOOTSTRAP_INSTALLED.store(true, Ordering::SeqCst);
        Ok(())
    }

    fn add_document_script(webview: &ICoreWebView2, script: String) -> Result<(), String> {
        let webview = webview.clone();
        AddScriptToExecuteOnDocumentCreatedCompletedHandler::wait_for_async_operation(
            Box::new(move |handler| unsafe {
                let js = HSTRING::from(script);
                webview
                    .AddScriptToExecuteOnDocumentCreated(&js, &handler)
                    .map_err(webview2_com::Error::WindowsError)
            }),
            Box::new(|error_code, _id| error_code),
        )
        .map_err(|e| e.to_string())
    }
}

#[cfg(windows)]
pub use windows_impl::ensure_iframe_bootstrap;

/// 非 Windows 桌面（macOS / Linux）无 WebView2 子 frame 注入，保持 no-op。
#[cfg(all(not(windows), not(any(target_os = "android", target_os = "ios"))))]
pub fn ensure_iframe_bootstrap(_window: &tauri::WebviewWindow) -> Result<(), String> {
    Ok(())
}
