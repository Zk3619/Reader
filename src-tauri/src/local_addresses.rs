//! 枚举本机可用于局域网访问的 IPv4 地址（桌面 / Android / iOS）

pub fn get_local_network_addresses() -> Vec<String> {
    let mut addrs = vec!["127.0.0.1".to_string()];
    if let Ok(ifaces) = if_addrs::get_if_addrs() {
        for iface in ifaces {
            if let std::net::IpAddr::V4(ip) = iface.ip() {
                if !ip.is_loopback() && !ip.is_unspecified() {
                    addrs.push(ip.to_string());
                }
            }
        }
    }
    addrs.sort();
    addrs.dedup();
    addrs
}

#[tauri::command]
pub fn get_local_network_addresses_cmd() -> Vec<String> {
    get_local_network_addresses()
}
