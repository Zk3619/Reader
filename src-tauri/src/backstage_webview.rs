//! Legado BackstageWebView：隐藏子 WebView 加载 URL/HTML 并执行 WebJs

use serde::Deserialize;
use tauri::AppHandle;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct BackstageWebJsParams {
    pub request_id: String,
    pub url: Option<String>,
    pub html: Option<String>,
    pub base_url: Option<String>,
    pub script: String,
    pub bridge_script: Option<String>,
    pub cookies: Option<String>,
    pub headers_json: Option<String>,
    pub delay_ms: Option<u64>,
    pub timeout_ms: Option<u64>,
    pub prior_result: Option<String>,
    pub source_regex: Option<String>,
    pub override_url_regex: Option<String>,
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub(crate) use desktop::run_backstage_webjs_impl;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod desktop {
    use std::collections::HashMap;
    use std::sync::{Mutex, OnceLock};
    use std::time::Duration;

    use base64::Engine;
    use regex::Regex;
    use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewUrl};
    use tauri::webview::WebviewBuilder;
    use tokio::sync::oneshot;

    use super::BackstageWebJsParams;
    use crate::apply_http_cookies_to_webview;

    pub const BACKSTAGE_WEBVIEW_LABEL: &str = "reader-backstage-web";

    struct Pending {
        tx: oneshot::Sender<Result<String, String>>,
    }

    #[derive(Default)]
    struct NavOverrideState {
        request_id: Option<String>,
        regex: Option<Regex>,
    }

    fn pending_map() -> &'static Mutex<HashMap<String, Pending>> {
        static MAP: OnceLock<Mutex<HashMap<String, Pending>>> = OnceLock::new();
        MAP.get_or_init(|| Mutex::new(HashMap::new()))
    }

    fn nav_override_state() -> &'static Mutex<NavOverrideState> {
        static STATE: OnceLock<Mutex<NavOverrideState>> = OnceLock::new();
        STATE.get_or_init(|| Mutex::new(NavOverrideState::default()))
    }

    fn html_to_data_url(html: &str) -> Result<String, String> {
        let b64 = base64::engine::general_purpose::STANDARD.encode(html.as_bytes());
        Ok(format!("data:text/html;charset=utf-8;base64,{}", b64))
    }

    fn ensure_backstage_webview(app: &AppHandle) -> Result<tauri::Webview, String> {
        if let Some(w) = app.get_webview(BACKSTAGE_WEBVIEW_LABEL) {
            return Ok(w);
        }

        let window = app
            .get_window("main")
            .ok_or_else(|| "主窗口不存在".to_string())?;

        let blank: url::Url = "about:blank"
            .parse()
            .map_err(|e: url::ParseError| e.to_string())?;

        let mut webview_builder =
            WebviewBuilder::new(BACKSTAGE_WEBVIEW_LABEL, WebviewUrl::External(blank))
                .on_navigation(move |url| {
                        let (request_id, re_opt) = {
                            let s = nav_override_state().lock().unwrap();
                            (s.request_id.clone(), s.regex.clone())
                        };
                        if let (Some(id), Some(re)) = (request_id, re_opt) {
                            if re.is_match(url.as_str()) {
                                let matched_url = url.as_str().to_string();
                                tauri::async_runtime::spawn(async move {
                                    let _ = super::backstage_webjs_complete(
                                        id.clone(),
                                        Some(matched_url),
                                        None,
                                    )
                                    .await;
                                    let mut s = nav_override_state().lock().unwrap();
                                    if s.request_id.as_deref() == Some(id.as_str()) {
                                        s.request_id = None;
                                        s.regex = None;
                                    }
                                });
                                return false;
                            }
                        }
                        true
                    })
                .focused(false);
        if let Ok(config_path) = crate::portable_paths::config_file_path() {
            if let Ok(root) = crate::portable_paths::effective_webview_data_root(&config_path) {
                if let Ok(data_dir) = crate::portable_paths::webview_data_directory(
                    &root,
                    BACKSTAGE_WEBVIEW_LABEL,
                ) {
                    webview_builder = webview_builder.data_directory(data_dir);
                }
            }
        }
        let panel = window
            .add_child(
                webview_builder,
                LogicalPosition::new(-10_000.0, -10_000.0),
                LogicalSize::new(1.0, 1.0),
            )
            .map_err(|e| e.to_string())?;

        let _ = panel.hide();
        Ok(panel)
    }

    fn apply_user_agent(webview: &tauri::Webview, headers_json: Option<&str>) -> Result<(), String> {
        let Some(raw) = headers_json else {
            return Ok(());
        };
        let map: HashMap<String, String> =
            serde_json::from_str(raw).map_err(|e| format!("headers JSON 无效: {}", e))?;
        let ua = map
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case("user-agent"))
            .map(|(_, v)| v.clone());
        if let Some(ua) = ua {
            let js = format!(
                "try{{ navigator.__defineGetter__('userAgent', function(){{ return {}; }}); }}catch(e){{}}",
                serde_json::to_string(&ua).map_err(|e| e.to_string())?
            );
            let _ = webview.eval(&js);
        }
        Ok(())
    }

    pub async fn backstage_webjs_complete_impl(
        id: String,
        result: Option<String>,
        error: Option<String>,
    ) -> Result<(), String> {
        let pending = pending_map().lock().unwrap().remove(&id);
        let Some(p) = pending else {
            return Ok(());
        };
        if let Some(err) = error.filter(|e| !e.is_empty()) {
            let _ = p.tx.send(Err(err));
        } else {
            let _ = p.tx.send(Ok(result.unwrap_or_default()));
        }
        Ok(())
    }

    pub async fn run_backstage_webjs_impl(
        app: AppHandle,
        params: BackstageWebJsParams,
    ) -> Result<String, String> {
        let timeout_ms = params.timeout_ms.unwrap_or(60_000).max(1_000);
        let delay_ms = params.delay_ms.unwrap_or(900);

        {
            let mut s = nav_override_state().lock().unwrap();
            s.request_id = Some(params.request_id.clone());
            s.regex = params
                .override_url_regex
                .as_deref()
                .and_then(|r| Regex::new(r).ok());
        }

        let (tx, rx) = oneshot::channel();
        pending_map()
            .lock()
            .unwrap()
            .insert(params.request_id.clone(), Pending { tx });

        let webview = ensure_backstage_webview(&app)?;

        let url_trim = params.url.as_deref().unwrap_or("").trim();
        let http_url = url_trim.starts_with("http://") || url_trim.starts_with("https://");

        if http_url {
            if let Some(cookies) = params.cookies.as_deref() {
                apply_http_cookies_to_webview(&webview, url_trim, cookies)?;
            }
            apply_user_agent(&webview, params.headers_json.as_deref())?;
            let nav = format!(
                "window.location.replace({});",
                serde_json::to_string(url_trim).map_err(|e| e.to_string())?
            );
            webview.eval(&nav).map_err(|e| e.to_string())?;
        } else if let Some(html) = params.html.as_deref().filter(|h| !h.is_empty()) {
            let base = params
                .base_url
                .as_deref()
                .filter(|b| b.starts_with("http"))
                .unwrap_or("about:blank");
            let doc = format!(
                r#"<!DOCTYPE html><html><head><meta charset="utf-8"><base href="{}"></head><body>{}</body></html>"#,
                base.replace('"', "&quot;"),
                html
            );
            let data_url = html_to_data_url(&doc)?;
            let nav = format!(
                "window.location.replace({});",
                serde_json::to_string(&data_url).map_err(|e| e.to_string())?
            );
            webview.eval(&nav).map_err(|e| e.to_string())?;
        }

        tokio::time::sleep(Duration::from_millis(delay_ms.saturating_add(200))).await;

        webview
            .eval(&params.script)
            .map_err(|e| e.to_string())?;

        let result = tokio::time::timeout(Duration::from_millis(timeout_ms), rx)
            .await
            .map_err(|_| "WebJs 执行超时".to_string())?
            .map_err(|_| "WebJs 回调通道已关闭".to_string())??;

        pending_map().lock().unwrap().remove(&params.request_id);
        {
            let mut s = nav_override_state().lock().unwrap();
            if s.request_id.as_deref() == Some(params.request_id.as_str()) {
                s.request_id = None;
                s.regex = None;
            }
        }
        Ok(result)
    }
}

#[tauri::command]
pub async fn backstage_webjs_complete(
    id: String,
    result: Option<String>,
    error: Option<String>,
) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        return desktop::backstage_webjs_complete_impl(id, result, error).await;
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (id, result, error);
        Ok(())
    }
}

#[tauri::command]
pub async fn run_backstage_webjs(
    app: AppHandle,
    params: BackstageWebJsParams,
) -> Result<String, String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        return desktop::run_backstage_webjs_impl(app, params).await;
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (app, params);
        Err("移动端请使用 iframe WebJs".to_string())
    }
}

/// 从后台 WebView 读取指定 URL 的 Cookie（登录 / WebJs 后回写书源表）
#[tauri::command]
pub async fn get_backstage_webview_cookies_for_url(
    app: AppHandle,
    url: String,
) -> Result<String, String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        use tauri::Manager;
        let url = url.trim();
        if url.is_empty() || !url.starts_with("http") {
            return Err("URL 无效".to_string());
        }
        let parsed = url::Url::parse(url).map_err(|e| e.to_string())?;
        let webview = app
            .get_webview(desktop::BACKSTAGE_WEBVIEW_LABEL)
            .ok_or_else(|| "后台 WebView 未创建".to_string())?;
        let cookies = webview.cookies_for_url(parsed).map_err(|e| e.to_string())?;
        let parts: Vec<String> = cookies
            .iter()
            .map(|c| format!("{}={}", c.name(), c.value()))
            .collect();
        return Ok(parts.join("; "));
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (app, url);
        Ok(String::new())
    }
}

/// 向后台 WebView 注入 Cookie（用于登录池回灌）
#[tauri::command]
pub async fn set_cookies_for_backstage_webview(
    app: AppHandle,
    url: String,
    cookies: String,
) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        use tauri::Manager;
        let url = url.trim().to_string();
        let cookies = cookies.trim().to_string();
        if url.is_empty() || !url.starts_with("http") {
            return Err("URL 无效".to_string());
        }
        if cookies.is_empty() {
            return Ok(());
        }
        let webview = app
            .get_webview(desktop::BACKSTAGE_WEBVIEW_LABEL)
            .ok_or_else(|| "后台 WebView 未创建".to_string())?;
        crate::apply_http_cookies_to_webview(&webview, &url, &cookies)?;
        return Ok(());
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (app, url, cookies);
        Ok(())
    }
}
