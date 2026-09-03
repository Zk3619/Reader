//! Android 影视 JAR 预下载：对齐 TvSpiderPlugin.resolveJarFile 缓存路径，
//! 但 HTTP 走 Rust 客户端（与前端 useBackendHttp / download_binary 同栈）。
//! 配置 JSON 能导入而 JAR 全站失败，常见原因是插件内 HttpURLConnection 拉不动 CDN。

use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use md5::{Digest, Md5};
use tauri::{AppHandle, Manager};

use crate::http_client::{self, ClientOpts};

const CHROME_UA: &str =
    "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

struct ParsedJarSpec {
    url: String,
    md5_expect: String,
}

fn md5_hex(input: &str) -> String {
    format!("{:x}", Md5::digest(input.as_bytes()))
}

fn md5_hex_bytes(bytes: &[u8]) -> String {
    format!("{:x}", Md5::digest(bytes))
}

fn parse_jar_spec(spec: &str) -> ParsedJarSpec {
    let spec = spec.trim();
    if let Some(idx) = spec.find(";md5;") {
        ParsedJarSpec {
            url: spec[..idx].trim().to_string(),
            md5_expect: spec[idx + 5..].trim().to_string(),
        }
    } else {
        ParsedJarSpec {
            url: spec.to_string(),
            md5_expect: String::new(),
        }
    }
}

fn is_zip_magic(path: &Path) -> bool {
    let Ok(mut f) = std::fs::File::open(path) else {
        return false;
    };
    let mut buf = [0u8; 2];
    f.read_exact(&mut buf).is_ok() && buf[0] == b'P' && buf[1] == b'K'
}

fn file_md5(path: &Path) -> Result<String, String> {
    let data = std::fs::read(path).map_err(|e| e.to_string())?;
    Ok(format!("{:x}", Md5::digest(&data)))
}

fn jar_cache_valid(dest: &Path, md5_expect: &str) -> Result<bool, String> {
    if !dest.exists() || dest.metadata().map(|m| m.len()).unwrap_or(0) == 0 {
        return Ok(false);
    }
    if !is_zip_magic(dest) {
        return Ok(false);
    }
    if md5_expect.is_empty() {
        return Ok(true);
    }
    Ok(file_md5(dest)? == md5_expect)
}

async fn fetch_text(url: &str) -> Result<String, String> {
    let bytes = download_url_bytes(url).await?;
    String::from_utf8(bytes).map_err(|e| format!("md5 text utf8: {e}"))
}

async fn download_url_bytes(url: &str) -> Result<Vec<u8>, String> {
    let opts = ClientOpts {
        timeout: std::time::Duration::from_secs(120),
        connect_timeout: Some(std::time::Duration::from_secs(30)),
        user_agent: Some(CHROME_UA.to_string()),
        accept_invalid_certs: true,
        http1_only: true,
        ..ClientOpts::default()
    };
    let client = http_client::build_client(&opts)?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("下载 JAR 失败: {e} (url={url})"))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("下载 JAR HTTP {}: {url}", status.as_u16()));
    }
    response
        .bytes()
        .await
        .map(|b| b.to_vec())
        .map_err(|e| format!("读取 JAR 响应失败: {e}"))
}

fn android_jar_cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .cache_dir()
        .map_err(|e| e.to_string())?
        .join("jar");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn write_atomic(dest: &Path, data: &[u8]) -> Result<(), String> {
    let parent = dest
        .parent()
        .ok_or_else(|| "jar cache parent missing".to_string())?;
    let stem = dest
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("jar");
    let tmp = parent.join(format!("{stem}.{}.part", uuid::Uuid::new_v4().simple()));
    {
        let mut f = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;
        f.write_all(data).map_err(|e| e.to_string())?;
    }
    if dest.exists() {
        std::fs::remove_file(dest).ok();
    }
    if std::fs::rename(&tmp, dest).is_err() {
        std::fs::copy(&tmp, dest).map_err(|e| e.to_string())?;
        std::fs::remove_file(&tmp).ok();
    }
    Ok(())
}

/// 将远程 JAR 预写入 `cacheDir/jar/{md5(url)}.jar`（与 TvSpiderPlugin 一致）。
pub async fn prewarm_android_jar_cache(app: &AppHandle, spec: &str) -> Result<(), String> {
    let parsed = parse_jar_spec(spec);
    let url = parsed.url.trim();
    if url.is_empty() {
        return Err("empty jar".into());
    }
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Ok(());
    }

    let mut md5_expect = parsed.md5_expect.trim().to_lowercase();
    if md5_expect.starts_with("http://") || md5_expect.starts_with("https://") {
        md5_expect = fetch_text(&md5_expect).await?.trim().to_lowercase();
    }

    let cache_dir = android_jar_cache_dir(app)?;
    let dest = cache_dir.join(format!("{}.jar", md5_hex(url)));
    if jar_cache_valid(&dest, &md5_expect)? {
        return Ok(());
    }

    let had_valid =
        dest.exists() && dest.metadata().map(|m| m.len()).unwrap_or(0) > 0 && is_zip_magic(&dest);

    match download_url_bytes(url).await {
        Ok(bytes) => {
            if bytes.len() < 2 || bytes[0] != b'P' || bytes[1] != b'K' {
                if had_valid {
                    log::warn!("[tv-jar] invalid jar bytes, keep cache: {url}");
                    return Ok(());
                }
                return Err(format!("downloaded file is not a jar/zip: {url}"));
            }
            if !md5_expect.is_empty() && md5_hex_bytes(&bytes) != md5_expect {
                if had_valid {
                    log::warn!("[tv-jar] md5 mismatch, keep cache: {url}");
                    return Ok(());
                }
                return Err(format!("JAR md5 mismatch: {url}"));
            }
            write_atomic(&dest, &bytes)?;
            Ok(())
        }
        Err(e) => {
            if had_valid {
                log::warn!("[tv-jar] download failed, using cached jar: {e}");
                Ok(())
            } else {
                Err(e)
            }
        }
    }
}
