//! WebJs java.request RPC（Tauri 后台 WebView 内 invoke）

use serde::Deserialize;
use tauri::AppHandle;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebJsJavaRpcParams {
    pub fun_name: String,
    pub args: Vec<Option<String>>,
    pub base_url: Option<String>,
    pub cookies: Option<String>,
    pub headers_json: Option<String>,
    #[allow(dead_code)]
    pub source_url: Option<String>,
    #[allow(dead_code)]
    pub request_id: Option<String>,
}

fn arg(params: &WebJsJavaRpcParams, i: usize) -> String {
    params
        .args
        .get(i)
        .and_then(|o| o.as_ref())
        .map(|s| s.clone())
        .unwrap_or_default()
}

fn merge_headers(params: &WebJsJavaRpcParams) -> reqwest::header::HeaderMap {
    let mut map = reqwest::header::HeaderMap::new();
    if let Some(raw) = &params.headers_json {
        if let Ok(obj) = serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(raw) {
            for (k, v) in obj {
                if let Some(s) = v.as_str() {
                    if let Ok(name) = reqwest::header::HeaderName::from_bytes(k.as_bytes()) {
                        if let Ok(val) = reqwest::header::HeaderValue::from_str(s) {
                            map.insert(name, val);
                        }
                    }
                }
            }
        }
    }
    if let Some(c) = &params.cookies {
        if !c.trim().is_empty() {
            if let Ok(val) = reqwest::header::HeaderValue::from_str(c.trim()) {
                map.insert(reqwest::header::COOKIE, val);
            }
        }
    }
    map
}

async fn http_text(
    method: reqwest::Method,
    url: &str,
    headers: reqwest::header::HeaderMap,
    body: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(std::time::Duration::from_millis(timeout_ms.unwrap_or(60_000)))
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = client.request(method, url).headers(headers);
    if let Some(b) = body {
        req = req.body(b);
    }
    let res = req.send().await.map_err(|e| e.to_string())?;
    res.text().await.map_err(|e| e.to_string())
}

async fn http_response(
    method: reqwest::Method,
    url: &str,
    headers: reqwest::header::HeaderMap,
    body: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<reqwest::Response, String> {
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(std::time::Duration::from_millis(timeout_ms.unwrap_or(60_000)))
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = client.request(method, url).headers(headers);
    if let Some(b) = body {
        req = req.body(b);
    }
    req.send().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn webjs_java_rpc(
    app: AppHandle,
    params: WebJsJavaRpcParams,
) -> Result<String, String> {
    let fun = params.fun_name.as_str();
    let headers = merge_headers(&params);

    match fun {
        "ajaxAwait" | "getAwait" => {
            let url = arg(&params, 0);
            let timeout = arg(&params, 1).parse::<u64>().ok();
            http_text(reqwest::Method::GET, &url, headers, None, timeout).await
        }
        "postAwait" => {
            let url = arg(&params, 0);
            let body = arg(&params, 1);
            let timeout = arg(&params, 3).parse::<u64>().ok();
            http_text(reqwest::Method::POST, &url, headers, Some(body), timeout).await
        }
        "headAwait" | "connectAwait" => {
            let url = arg(&params, 0);
            let timeout = arg(&params, 2).parse::<u64>().ok();
            if fun == "connectAwait" {
                let res =
                    http_response(reqwest::Method::HEAD, &url, headers, None, timeout).await?;
                Ok(res.status().as_u16().to_string())
            } else {
                let res =
                    http_response(reqwest::Method::HEAD, &url, headers, None, timeout).await?;
                let mut map = serde_json::Map::new();
                for (k, v) in res.headers().iter() {
                    map.insert(
                        k.as_str().to_string(),
                        serde_json::Value::String(v.to_str().unwrap_or_default().to_string()),
                    );
                }
                Ok(serde_json::Value::Object(map).to_string())
            }
        }
        "run" => {
            let code = arg(&params, 0);
            eval_js_snippet(&code).map_err(|e| e.to_string())
        }
        "webViewAwait" | "webViewGetSourceAwait" => {
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            {
                use crate::backstage_webview::{run_backstage_webjs_impl, BackstageWebJsParams};
                let bw = BackstageWebJsParams {
                    request_id: uuid::Uuid::new_v4().to_string(),
                    url: {
                        let u = arg(&params, 1);
                        if u.starts_with("http") {
                            Some(u)
                        } else {
                            None
                        }
                    },
                    html: {
                        let h = arg(&params, 0);
                        if h.is_empty() {
                            None
                        } else {
                            Some(h)
                        }
                    },
                    base_url: params.base_url.clone(),
                    script: arg(&params, 2),
                    bridge_script: None,
                    cookies: params.cookies.clone(),
                    headers_json: params.headers_json.clone(),
                    delay_ms: Some(if fun == "webViewGetSourceAwait" {
                        arg(&params, 5).parse().unwrap_or(0)
                    } else {
                        arg(&params, 4).parse().unwrap_or(0)
                    }),
                    timeout_ms: Some(60_000),
                    prior_result: None,
                    source_regex: if fun == "webViewGetSourceAwait" {
                        let r = arg(&params, 3);
                        if r.is_empty() { None } else { Some(r) }
                    } else {
                        None
                    },
                    override_url_regex: None,
                };
                run_backstage_webjs_impl(app, bw).await
            }
            #[cfg(any(target_os = "android", target_os = "ios"))]
            {
                let _ = app;
                Err("移动端请使用 iframe WebJs".to_string())
            }
        }
        "decryptStrAwait" => Ok(arg(&params, 3)),
        "encryptBase64Await" | "encryptHexAwait" | "createSignHexAwait" => Ok(arg(&params, 3)),
        "importScriptAwait" => {
            let url = arg(&params, 0);
            http_text(reqwest::Method::GET, &url, headers, None, None).await
        }
        "downloadFileAwait" => {
            let url = arg(&params, 0);
            let bytes = reqwest::Client::builder()
                .danger_accept_invalid_certs(true)
                .build()
                .map_err(|e| e.to_string())?
                .get(&url)
                .headers(headers)
                .send()
                .await
                .map_err(|e| e.to_string())?
                .bytes()
                .await
                .map_err(|e| e.to_string())?;
            Ok(base64::Engine::encode(
                &base64::engine::general_purpose::STANDARD,
                bytes,
            ))
        }
        "readTxtFileAwait" => Ok(arg(&params, 0)),
        "getStringAwait" => Err("getStringAwait 需在主 WebView 规则引擎中执行".to_string()),
        _ => Err(format!("不支持的 WebJs RPC: {}", fun)),
    }
}

fn eval_js_snippet(code: &str) -> Result<String, String> {
    use boa_engine::{Context, Source};
    let mut context = Context::default();
    let value = context
        .eval(Source::from_bytes(code.as_bytes()))
        .map_err(|e| format!("脚本执行错误: {}", e))?;
    value
        .to_string(&mut context)
        .map(|s| s.to_std_string_escaped())
        .map_err(|e| e.to_string())
}
