//! 全平台统一出站 HTTP 门面。
//!
//! - **默认**（无 `tls-impersonate`）：reqwest + rustls（ring / webpki-roots），无 BoringSSL
//! - **`tls-impersonate`**：wreq + BoringSSL；[`TlsMode::Emulation`] 提供 JA3 / 浏览器指纹
//!
//! 无 blocking client：同步场景用 [`block_on`]。业务代码请用本模块类型，勿直接依赖 `wreq` / `reqwest`。

mod shell_proxy;

pub use shell_proxy::{
    get_shell_outbound_proxy, resolve_windows_system_proxy, set_shell_outbound_proxy,
};

use std::future::Future;
use std::time::Duration;

#[cfg(feature = "tls-impersonate")]
mod backend {
    pub use wreq::header::{self, HeaderMap, HeaderName, HeaderValue};
    pub use wreq::redirect;
    pub use wreq::{Client, Method, Proxy, RequestBuilder, Response};
}

#[cfg(not(feature = "tls-impersonate"))]
mod backend {
    pub use reqwest::header::{self, HeaderMap, HeaderName, HeaderValue};
    pub use reqwest::redirect;
    pub use reqwest::{Client, Method, Proxy, RequestBuilder, Response};
}

pub use backend::*;

/// TLS / 指纹模式。
#[derive(Debug, Clone)]
pub enum TlsMode {
    Plain,
    /// profile 名：chrome / safari / edge / chrome120 / chrome131 …
    /// 仅 `tls-impersonate` 构建可用；否则 [`build_client`] 返回错误。
    #[cfg_attr(not(feature = "tls-impersonate"), allow(dead_code))]
    Emulation(String),
}

impl Default for TlsMode {
    fn default() -> Self {
        Self::Plain
    }
}

/// 构建客户端选项。
#[derive(Debug, Clone)]
pub struct ClientOpts {
    pub timeout: Duration,
    pub connect_timeout: Option<Duration>,
    pub redirect_limit: usize,
    pub accept_invalid_certs: bool,
    pub http1_only: bool,
    pub gzip: bool,
    pub brotli: bool,
    pub deflate: bool,
    /// none | env | windows | custom | system（=env）| follow（=壳）| 空（继承壳级出站代理）
    pub proxy_mode: String,
    pub proxy_url: String,
    pub user_agent: Option<String>,
    pub tls: TlsMode,
}

impl Default for ClientOpts {
    fn default() -> Self {
        Self {
            timeout: Duration::from_secs(60),
            connect_timeout: Some(Duration::from_secs(30)),
            redirect_limit: 10,
            accept_invalid_certs: false,
            http1_only: false,
            gzip: true,
            brotli: true,
            deflate: true,
            proxy_mode: String::new(),
            proxy_url: String::new(),
            user_agent: None,
            tls: TlsMode::Plain,
        }
    }
}

/// 将 ClientOpts 中的代理字段解析为最终 mode + url。
/// - `proxy_mode` 为空：继承壳级；若仅有 `proxy_url` 则视为 custom（兼容 download_binary）
/// - `system` → `env`；`follow` → 壳
fn resolve_proxy_settings(opts: &ClientOpts) -> (String, String) {
    let mut mode = opts.proxy_mode.trim().to_ascii_lowercase();
    let mut url = opts.proxy_url.trim().to_string();

    if mode.is_empty() {
        if !url.is_empty() {
            return ("custom".into(), url);
        }
        let shell = get_shell_outbound_proxy();
        mode = shell.mode.trim().to_ascii_lowercase();
        url = shell.url.trim().to_string();
    }

    if mode == "follow" {
        let shell = get_shell_outbound_proxy();
        mode = shell.mode.trim().to_ascii_lowercase();
        if url.is_empty() {
            url = shell.url.trim().to_string();
        }
    } else if mode == "system" {
        mode = "env".into();
    }

    if mode.is_empty() {
        mode = "env".into();
    }

    (mode, url)
}

/// 将 profile 字符串映射到 wreq-util Profile（实现 IntoEmulation）。
#[cfg(feature = "tls-impersonate")]
pub fn map_emulation(profile: &str) -> wreq_util::Profile {
    use wreq_util::Profile;
    let p = profile.to_ascii_lowercase();
    if p.contains("safari") {
        Profile::Safari18_3
    } else if p.contains("edge") {
        Profile::Edge134
    } else if p.contains("120") {
        Profile::Chrome120
    } else if p.contains("131") {
        Profile::Chrome131
    } else {
        Profile::Chrome147
    }
}

/// 响应最终 URL（wreq 用 uri，reqwest 用 url）。
pub fn response_final_url(resp: &Response) -> String {
    #[cfg(feature = "tls-impersonate")]
    {
        resp.uri().to_string()
    }
    #[cfg(not(feature = "tls-impersonate"))]
    {
        resp.url().to_string()
    }
}

/// 按选项构建 HTTP Client。
pub fn build_client(opts: &ClientOpts) -> Result<Client, String> {
    let mut builder = Client::builder()
        .timeout(opts.timeout)
        .redirect(redirect::Policy::limited(opts.redirect_limit))
        .gzip(opts.gzip)
        .brotli(opts.brotli)
        .deflate(opts.deflate);

    // librqbit 会给统一的 reqwest 打开 default-tls；不钉死则桌面 Client 仍走 native-tls。
    #[cfg(not(feature = "tls-impersonate"))]
    {
        builder = builder.use_rustls_tls();
    }

    if let Some(ct) = opts.connect_timeout {
        builder = builder.connect_timeout(ct);
    }

    if opts.accept_invalid_certs {
        #[cfg(feature = "tls-impersonate")]
        {
            builder = builder
                .tls_cert_verification(false)
                .tls_verify_hostname(false);
        }
        #[cfg(not(feature = "tls-impersonate"))]
        {
            builder = builder.danger_accept_invalid_certs(true);
        }
    }

    if opts.http1_only {
        builder = builder.http1_only();
    }

    let (mode, url) = resolve_proxy_settings(opts);
    match mode.as_str() {
        "none" => {
            builder = builder.no_proxy();
        }
        "windows" => {
            if let Some(proxy_url) = resolve_windows_system_proxy() {
                eprintln!("[http_client] Windows 系统代理: {proxy_url}");
                let proxy =
                    Proxy::all(proxy_url.trim()).map_err(|e| format!("系统代理 URL 无效: {e}"))?;
                builder = builder.proxy(proxy);
            } else {
                eprintln!("[http_client] Windows 系统代理未启用，回退环境变量");
            }
        }
        "custom" if !url.is_empty() => {
            let proxy = Proxy::all(url.trim()).map_err(|e| format!("代理 URL 无效: {e}"))?;
            builder = builder.proxy(proxy);
        }
        // env / 其它：reqwest 默认读 HTTP(S)_PROXY / ALL_PROXY
        _ => {}
    }

    if let Some(ref ua) = opts.user_agent {
        if !ua.is_empty() {
            builder = builder.user_agent(ua.as_str());
        }
    }

    match &opts.tls {
        TlsMode::Plain => {}
        TlsMode::Emulation(profile) => {
            #[cfg(feature = "tls-impersonate")]
            {
                builder = builder.emulation(map_emulation(profile));
            }
            #[cfg(not(feature = "tls-impersonate"))]
            {
                let _ = profile;
                return Err(
                    "当前构建未启用 tls-impersonate（需 BoringSSL/wreq）；请用 enhanced 或 READER_TLS_IMPERSONATE=1"
                        .into(),
                );
            }
        }
    }

    builder
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))
}

/// 从字符串 HashMap 构建 HeaderMap。
pub fn header_map_from(headers: &std::collections::HashMap<String, String>) -> HeaderMap {
    let mut map = HeaderMap::new();
    for (k, v) in headers {
        let Ok(name) = HeaderName::from_bytes(k.as_bytes()) else {
            continue;
        };
        let Ok(value) = HeaderValue::from_str(v) else {
            continue;
        };
        map.insert(name, value);
    }
    map
}

/// 解析 HTTP 方法。
pub fn parse_method(method: &str) -> Method {
    Method::from_bytes(method.to_uppercase().as_bytes()).unwrap_or(Method::GET)
}

/// 在已有 tokio runtime 上 block_on；否则临时建 runtime。
pub fn block_on<F: Future>(fut: F) -> F::Output {
    match tokio::runtime::Handle::try_current() {
        Ok(handle) => {
            tokio::task::block_in_place(|| handle.block_on(fut))
        }
        Err(_) => {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("http_client: create tokio runtime");
            rt.block_on(fut)
        }
    }
}

/// 同步发送请求并读完整 body（登录脚本 / 命令回调等）。
pub fn blocking_fetch(
    method: &str,
    url: &str,
    headers: &std::collections::HashMap<String, String>,
    body: Option<&str>,
    opts: &ClientOpts,
) -> Result<(u16, Vec<u8>, HeaderMap), String> {
    let client = build_client(opts)?;
    let m = parse_method(method);
    let hdrs = header_map_from(headers);
    block_on(async move {
        let mut req = client.request(m, url).headers(hdrs);
        if let Some(b) = body {
            if !b.is_empty() {
                req = req.body(b.to_string());
            }
        }
        let resp = req.send().await.map_err(|e| format!("请求失败: {e}"))?;
        let status = resp.status().as_u16();
        let out_headers = resp.headers().clone();
        let bytes = resp
            .bytes()
            .await
            .map_err(|e| format!("读 body 失败: {e}"))?
            .to_vec();
        Ok((status, bytes, out_headers))
    })
}
