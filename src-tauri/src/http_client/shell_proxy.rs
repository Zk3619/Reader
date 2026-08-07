//! 壳级出站代理：进程内 SoT，供 `build_client` / `download_binary` / tv_proxy 等继承。

use std::sync::{Mutex, OnceLock};

#[derive(Debug, Clone)]
pub struct ShellOutboundProxy {
    /// none | env | windows | custom（空 = env，兼容旧调用）
    pub mode: String,
    pub url: String,
}

impl Default for ShellOutboundProxy {
    fn default() -> Self {
        Self {
            // Windows 默认跟系统代理（与前端 DEFAULT_OUTBOUND_PROXY_MODE 对齐）
            mode: if cfg!(windows) {
                "windows".into()
            } else {
                "env".into()
            },
            url: String::new(),
        }
    }
}

fn shell_slot() -> &'static Mutex<ShellOutboundProxy> {
    static SHELL_OUTBOUND: OnceLock<Mutex<ShellOutboundProxy>> = OnceLock::new();
    SHELL_OUTBOUND.get_or_init(|| Mutex::new(ShellOutboundProxy::default()))
}

pub fn set_shell_outbound_proxy(mode: String, url: String) {
    if let Ok(mut g) = shell_slot().lock() {
        g.mode = mode;
        g.url = url;
    }
}

pub fn get_shell_outbound_proxy() -> ShellOutboundProxy {
    shell_slot()
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default()
}

/// 解析 Windows Internet 设置中的系统代理（ProxyEnable + ProxyServer）。
/// 不支持 PAC（自动配置脚本）；无系统代理时返回 None。
#[cfg(windows)]
pub fn resolve_windows_system_proxy() -> Option<String> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key = hkcu
        .open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Internet Settings")
        .ok()?;
    let enable: u32 = key.get_value("ProxyEnable").ok()?;
    if enable == 0 {
        return None;
    }
    let server: String = key.get_value("ProxyServer").ok()?;
    parse_windows_proxy_server(&server)
}

#[cfg(not(windows))]
pub fn resolve_windows_system_proxy() -> Option<String> {
    None
}

/// `host:port` 或 `http=h:p;https=h:p;socks=h:p`
pub fn parse_windows_proxy_server(server: &str) -> Option<String> {
    let s = server.trim();
    if s.is_empty() {
        return None;
    }
    if !s.contains('=') {
        return Some(ensure_proxy_scheme(s));
    }
    let mut http = None;
    let mut https = None;
    let mut socks = None;
    for part in s.split(';') {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }
        let Some((scheme, rest)) = part.split_once('=') else {
            continue;
        };
        let rest = rest.trim();
        if rest.is_empty() {
            continue;
        }
        match scheme.trim().to_ascii_lowercase().as_str() {
            "https" => https = Some(rest.to_string()),
            "http" => http = Some(rest.to_string()),
            "socks" | "socks5" | "socks5h" => socks = Some(rest.to_string()),
            _ => {}
        }
    }
    let picked = https.or(http).or(socks)?;
    Some(ensure_proxy_scheme(&picked))
}

fn ensure_proxy_scheme(raw: &str) -> String {
    let t = raw.trim();
    if t.contains("://") {
        t.to_string()
    } else {
        format!("http://{t}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_simple_host_port() {
        assert_eq!(
            parse_windows_proxy_server("127.0.0.1:7890").as_deref(),
            Some("http://127.0.0.1:7890")
        );
    }

    #[test]
    fn parse_scheme_map_prefers_https() {
        assert_eq!(
            parse_windows_proxy_server("http=127.0.0.1:7890;https=127.0.0.1:7891").as_deref(),
            Some("http://127.0.0.1:7891")
        );
    }
}
