//! Tauri 内嵌 panel 子 WebView：√ 前抓取 document HTML（光遇 getServerSettings 解析 serverValue）

/// 优先抓取线路设置 span（体积小、快）；否则回退 outerHTML
const CAPTURE_JS: &str = r#"(function(){try{var ids=['serverValue','autoSwitchValue','timeoutSwitchValue','timeoutValue','notifySwitchValue'];var parts=[],any=false;for(var i=0;i<ids.length;i++){var el=document.getElementById(ids[i]);if(el){any=true;parts.push('<span id="'+ids[i]+'">'+(el.textContent||'')+'</span>');}}if(any)return'<html><body>'+parts.join('')+'</body></html>';return document.documentElement?document.documentElement.outerHTML:'';}catch(e){return ''}})()"#;

fn parse_execute_script_json(json: &str) -> String {
    let trimmed = json.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if trimmed.starts_with('"') {
        return serde_json::from_str(trimmed).unwrap_or_else(|_| trimmed.to_string());
    }
    trimmed.to_string()
}

#[cfg(all(not(any(target_os = "android", target_os = "ios")), windows))]
pub fn start_execute_panel_script(
    panel: &tauri::Webview,
    js: &str,
    tx: tokio::sync::oneshot::Sender<String>,
) -> Result<(), String> {
    start_execute_panel_script_inner(panel, js, tx)
}

#[cfg(all(not(any(target_os = "android", target_os = "ios")), windows))]
fn start_execute_panel_script_inner(
    panel: &tauri::Webview,
    js: &str,
    tx: tokio::sync::oneshot::Sender<String>,
) -> Result<(), String> {
    use std::sync::{Arc, Mutex};
    use webview2_com::ExecuteScriptCompletedHandler;
    use windows::core::HSTRING;

    let js_owned = js.to_string();
    let tx_slot = Arc::new(Mutex::new(Some(tx)));
    let tx_fail = tx_slot.clone();
    let err_slot = Arc::new(Mutex::new(None::<String>));
    let err_capture = err_slot.clone();

    let with_result = panel.with_webview(move |platform| {
        let run = (|| -> Result<(), String> {
            let controller = platform.controller();
            let webview = unsafe {
                controller
                    .CoreWebView2()
                    .map_err(|e| e.to_string())?
            };
            let js = HSTRING::from(js_owned);
            let tx_slot_cb = tx_slot.clone();
            unsafe {
                webview
                    .ExecuteScript(
                        &js,
                        &ExecuteScriptCompletedHandler::create(Box::new(
                            move |error_code, json: String| {
                                let value = if error_code.is_ok() {
                                    parse_execute_script_json(&json)
                                } else {
                                    String::new()
                                };
                                if let Some(sender) = tx_slot_cb.lock().unwrap().take() {
                                    let _ = sender.send(value);
                                }
                                Ok(())
                            },
                        )),
                    )
                    .map_err(|e| e.to_string())?;
            }
            Ok(())
        })();
        if let Err(e) = run {
            *err_capture.lock().unwrap() = Some(e);
        }
    });

    if with_result.is_err() || err_slot.lock().unwrap().is_some() {
        if let Some(sender) = tx_fail.lock().unwrap().take() {
            let _ = sender.send(String::new());
        }
    }

    with_result.map_err(|e| e.to_string())?;
    if let Some(e) = err_slot.lock().unwrap().take() {
        return Err(e);
    }
    Ok(())
}

#[cfg(all(not(any(target_os = "android", target_os = "ios")), windows))]
pub fn start_capture_panel_document_html(
    panel: &tauri::Webview,
    tx: tokio::sync::oneshot::Sender<String>,
) -> Result<(), String> {
    start_execute_panel_script(panel, CAPTURE_JS, tx)
}

/// 从 panel 子 WebView 读取 JS 表达式字符串（宿主侧 ExecuteScript，不依赖外部页 IPC）
#[cfg(all(not(any(target_os = "android", target_os = "ios")), windows))]
pub fn start_eval_panel_js_string(
    panel: &tauri::Webview,
    js_expr: &str,
    tx: tokio::sync::oneshot::Sender<String>,
) -> Result<(), String> {
    let js = format!(
        // ExecuteScript 会自动把 JS 返回值编码成 JSON；这里只返回原始字符串。
        // 若先 JSON.stringify，会形成双层引号，导致 __DONE__/__ERROR__ 状态无法识别。
        r#"(function(){{try{{return String({expr});}}catch(e){{return '';}}}})()"#,
        expr = js_expr
    );
    start_execute_panel_script(panel, &js, tx)
}

/// 非 Windows：eval + invoke 快照（在 blocking 线程调用，避免卡 UI）
#[cfg(all(not(any(target_os = "android", target_os = "ios")), not(windows)))]
pub fn capture_panel_document_html_blocking(
    panel: &tauri::Webview,
    html_store: &std::sync::Mutex<String>,
) -> Result<String, String> {
    if let Ok(mut guard) = html_store.lock() {
        guard.clear();
    }

    let js = format!(
        r#"
(function () {{
  try {{
    var ids=['serverValue','autoSwitchValue','timeoutSwitchValue','timeoutValue','notifySwitchValue'];
    var parts=[],any=false;
    for(var i=0;i<ids.length;i++){{var el=document.getElementById(ids[i]);if(el){{any=true;parts.push('<span id="'+ids[i]+'">'+(el.textContent||'')+'</span>');}}}}
    var html=any?'<html><body>'+parts.join('')+'</body></html>':(document.documentElement?document.documentElement.outerHTML:'');
    if(window.__READER_INNER_WEB_PANEL_CAPTURE_HTML__){{window.__READER_INNER_WEB_PANEL_CAPTURE_HTML__();return;}}
    var inv=window.__TAURI_INTERNALS__&&window.__TAURI_INTERNALS__.invoke;
    if(inv)inv('store_inner_web_panel_html_snapshot',{{html:html}});
  }} catch(e) {{}}
}})();
"#
    );
    panel.eval(&js).map_err(|e| e.to_string())?;

    for _ in 0..20 {
        std::thread::sleep(std::time::Duration::from_millis(25));
        let snap = html_store.lock().map_err(|e| e.to_string())?.clone();
        if !snap.is_empty() {
            return Ok(snap);
        }
    }

    Ok(html_store.lock().map_err(|e| e.to_string())?.clone())
}
