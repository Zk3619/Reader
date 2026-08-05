//! 全平台统一出站 HTTP（wreq + BoringSSL）。
//!
//! - [`TlsMode::Plain`]：默认 TLS
//! - [`TlsMode::Emulation`]：浏览器 JA3/HTTP2 指纹（wreq-util）
//! - 无 blocking client：同步场景用 [`block_on`]

use std::future::Future;
use std::time::Duration;

use wreq::header::{HeaderMap, HeaderName, HeaderValue};
use wreq::{Client, Method, Proxy};
use wreq_util::Profile;

/// TLS / 指纹模式。
#[derive(Debug, Clone)]
pub enum TlsMode {
    Plain,
    /// profile 名：chrome / safari / edge / chrome120 / chrome131 …
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
    /// none | custom | system（空/system = 尊重环境变量）
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

/// 将 profile 字符串映射到 wreq-util Profile（实现 IntoEmulation）。
pub fn map_emulation(profile: &str) -> Profile {
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

/// 按选项构建 wreq Client。
pub fn build_client(opts: &ClientOpts) -> Result<Client, String> {
    let mut builder = Client::builder()
        .timeout(opts.timeout)
        .redirect(wreq::redirect::Policy::limited(opts.redirect_limit))
        .gzip(opts.gzip)
        .brotli(opts.brotli)
        .deflate(opts.deflate);

    if let Some(ct) = opts.connect_timeout {
        builder = builder.connect_timeout(ct);
    }

    if opts.accept_invalid_certs {
        builder = builder
            .tls_cert_verification(false)
            .tls_verify_hostname(false);
    }

    if opts.http1_only {
        builder = builder.http1_only();
    }

    match opts.proxy_mode.as_str() {
        "none" => {
            builder = builder.no_proxy();
        }
        "custom" if !opts.proxy_url.trim().is_empty() => {
            let proxy = Proxy::all(opts.proxy_url.trim())
                .map_err(|e| format!("代理 URL 无效: {e}"))?;
            builder = builder.proxy(proxy);
        }
        _ => {}
    }

    // 也支持仅传 proxy_url（如 download_binary）
    if opts.proxy_mode.is_empty() && !opts.proxy_url.trim().is_empty() {
        let proxy =
            Proxy::all(opts.proxy_url.trim()).map_err(|e| format!("代理 URL 无效: {e}"))?;
        builder = builder.proxy(proxy);
    }

    if let Some(ref ua) = opts.user_agent {
        if !ua.is_empty() {
            builder = builder.user_agent(ua.as_str());
        }
    }

    match &opts.tls {
        TlsMode::Plain => {}
        TlsMode::Emulation(profile) => {
            builder = builder.emulation(map_emulation(profile));
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
            // 已在 runtime 线程：不能直接 block_on，用独立线程 + 当前 handle
            // 若在 worker 内嵌套 block_on 会死锁；代理等同步线程通常无 Handle。
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

/// 同步流式转发：chunk 回调（代理）。
pub fn blocking_stream_forward<F>(
    method: &str,
    url: &str,
    headers: &std::collections::HashMap<String, String>,
    opts: &ClientOpts,
    mut on_meta: impl FnMut(u16, &HeaderMap),
    mut on_chunk: F,
) -> Result<(), String>
where
    F: FnMut(&[u8]) -> Result<(), String>,
{
    use futures_util::StreamExt;

    let client = build_client(opts)?;
    let m = parse_method(method);
    let hdrs = header_map_from(headers);
    let url = url.to_string();

    block_on(async move {
        let resp = client
            .request(m, &url)
            .headers(hdrs)
            .send()
            .await
            .map_err(|e| format!("请求失败: {e}"))?;
        let status = resp.status().as_u16();
        on_meta(status, resp.headers());
        let mut stream = resp.bytes_stream();
        while let Some(item) = stream.next().await {
            let chunk = item.map_err(|e| format!("读流失败: {e}"))?;
            on_chunk(&chunk)?;
        }
        Ok(())
    })
}
