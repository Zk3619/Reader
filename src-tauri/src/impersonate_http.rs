//! 全平台 in-process JA3/HTTP2（wreq Emulation）。
//!
//! 正式入口：`http_fetch_rquest`（历史名 rquest）。桌面兜底仍可用
//! `media_convert::http_fetch_impersonate`（curl-impersonate 子进程）。

use std::collections::HashMap;
use std::time::Duration;

use crate::http_client::{self, ClientOpts, TlsMode};

/// In-process JA3 path (wreq)。与 `http_fetch_impersonate` 同 JSON 形状。
#[tauri::command]
pub async fn http_fetch_rquest(
    url: String,
    method: Option<String>,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
    profile: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<serde_json::Value, String> {
    let url = url.trim().to_string();
    if url.is_empty() {
        return Err("url 不能为空".into());
    }

    let profile = profile.unwrap_or_else(|| "chrome".into());
    let timeout_ms = timeout_ms.unwrap_or(60_000);
    let method = method.unwrap_or_else(|| "GET".into());
    let headers = headers.unwrap_or_default();

    let opts = ClientOpts {
        timeout: Duration::from_millis(timeout_ms.max(1)),
        tls: TlsMode::Emulation(profile),
        accept_invalid_certs: false,
        ..ClientOpts::default()
    };
    let client = http_client::build_client(&opts)?;
    let m = http_client::parse_method(&method);
    let hdr_map = http_client::header_map_from(&headers);

    let mut req = client.request(m, &url).headers(hdr_map);
    if let Some(b) = body {
        if !b.is_empty() {
            req = req.body(b);
        }
    }

    let resp = req
        .send()
        .await
        .map_err(|e| format!("wreq 请求失败: {e}"))?;
    let status = resp.status().as_u16();
    let mut out_headers = serde_json::Map::new();
    for (k, v) in resp.headers().iter() {
        if let Ok(vs) = v.to_str() {
            out_headers.insert(
                k.as_str().to_string(),
                serde_json::Value::String(vs.to_string()),
            );
        }
    }
    let body_text = resp
        .text()
        .await
        .map_err(|e| format!("wreq 读 body 失败: {e}"))?;

    Ok(serde_json::json!({
        "available": true,
        "status": status,
        "body": body_text,
        "headers": out_headers,
        "via": "rquest",
    }))
}
