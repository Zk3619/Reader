//! 归档解压：zip/tar 族原生；7z/rar 走系统工具。

use serde::Serialize;
use std::fs::{self, File};
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractArchiveResult {
    pub dest_dir: String,
    pub extracted_files: u32,
    pub deleted_archive: bool,
}

fn ensure_within(root: &Path, candidate: &Path) -> Result<PathBuf, String> {
    let root = fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    let full = if candidate.is_absolute() {
        candidate.to_path_buf()
    } else {
        root.join(candidate)
    };
    let parent = full.parent().unwrap_or(&root);
    if !parent.exists() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
    }
    let canon_parent = fs::canonicalize(parent).unwrap_or_else(|_| parent.to_path_buf());
    if !canon_parent.starts_with(&root) {
        return Err(format!("拒绝写出归档外路径: {}", full.display()));
    }
    Ok(full)
}

fn extract_zip(archive: &Path, dest: &Path) -> Result<u32, String> {
    let file = File::open(archive).map_err(|e| format!("打开 zip 失败: {e}"))?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| format!("解析 zip 失败: {e}"))?;
    let mut count = 0u32;
    for i in 0..zip.len() {
        let mut entry = zip
            .by_index(i)
            .map_err(|e| format!("读取 zip 条目失败: {e}"))?;
        let name = decode_zip_name_raw(entry.name_raw())?;
        let out = ensure_within(dest, &name)?;
        if entry.is_dir() || name.to_string_lossy().ends_with('/') {
            fs::create_dir_all(&out).map_err(|e| format!("创建目录失败: {e}"))?;
            continue;
        }
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
        }
        let mut outfile = File::create(&out).map_err(|e| format!("写入失败: {e}"))?;
        io::copy(&mut entry, &mut outfile).map_err(|e| format!("解压写入失败: {e}"))?;
        count += 1;
    }
    Ok(count)
}

/// Decode ZIP entry path: UTF-8 when valid; else GBK/GB18030 (encoding_rs GBK) for CN archives.
fn decode_zip_name_raw(raw: &[u8]) -> Result<PathBuf, String> {
    let name = if let Ok(s) = std::str::from_utf8(raw) {
        s.to_string()
    } else {
        let (cow, _, _) = encoding_rs::GBK.decode(raw);
        cow.into_owned()
    };
    let cleaned = name.replace('\\', "/");
    let mut out = PathBuf::new();
    for seg in cleaned.split('/') {
        if seg.is_empty() || seg == "." {
            continue;
        }
        if seg == ".." {
            return Err("zip 条目路径非法 (..)".into());
        }
        out.push(seg);
    }
    if out.as_os_str().is_empty() {
        return Err("zip 条目路径为空".into());
    }
    Ok(out)
}

fn extract_tar_stream<R: Read>(decoder: R, dest: &Path) -> Result<u32, String> {
    let mut archive = tar::Archive::new(decoder);
    let mut count = 0u32;
    let entries = archive
        .entries()
        .map_err(|e| format!("读取 tar 失败: {e}"))?;
    for entry in entries {
        let mut entry = entry.map_err(|e| format!("tar 条目失败: {e}"))?;
        let path = entry
            .path()
            .map_err(|e| format!("tar 路径非法: {e}"))?
            .to_path_buf();
        let out = ensure_within(dest, &path)?;
        entry
            .unpack(&out)
            .map_err(|e| format!("tar 解压失败: {e}"))?;
        if entry.header().entry_type().is_file() {
            count += 1;
        }
    }
    Ok(count)
}

fn extract_tar_auto(archive: &Path, dest: &Path) -> Result<u32, String> {
    let lower = archive
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let file = File::open(archive).map_err(|e| format!("打开 tar 失败: {e}"))?;
    if lower.ends_with(".tar.gz") || lower.ends_with(".tgz") {
        let dec = flate2::read::GzDecoder::new(file);
        return extract_tar_stream(dec, dest);
    }
    if lower.ends_with(".gz") && !lower.ends_with(".tar.gz") {
        // 单文件 gzip
        let mut dec = flate2::read::GzDecoder::new(file);
        let stem = archive
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| "out".into());
        let out = ensure_within(dest, Path::new(&stem))?;
        let mut outfile = File::create(&out).map_err(|e| format!("写入失败: {e}"))?;
        io::copy(&mut dec, &mut outfile).map_err(|e| format!("gunzip 失败: {e}"))?;
        return Ok(1);
    }
    extract_tar_stream(file, dest)
}

fn try_external_extract(archive: &Path, dest: &Path, password: &str) -> Result<u32, String> {
    fs::create_dir_all(dest).map_err(|e| format!("创建目标目录失败: {e}"))?;
    let archive_s = archive.to_string_lossy().to_string();
    let dest_s = dest.to_string_lossy().to_string();

    // 7-Zip
    let mut args = vec!["x".to_string(), "-y".to_string(), format!("-o{dest_s}"), archive_s.clone()];
    if !password.is_empty() {
        args.push(format!("-p{password}"));
    }
    for bin in ["7z", "7za", "7zz"] {
        let status = Command::new(bin).args(&args).status();
        if let Ok(st) = status {
            if st.success() {
                return Ok(count_files(dest));
            }
        }
    }

    // unar / unrar
    if Command::new("unar")
        .args(["-o", &dest_s, &archive_s])
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
    {
        return Ok(count_files(dest));
    }

    Err(
        "无法解压该格式：请安装 7-Zip（7z）或 unar，或使用 zip/tar/tar.gz".into(),
    )
}

fn count_files(dir: &Path) -> u32 {
    fn walk(p: &Path, n: &mut u32) {
        let Ok(rd) = fs::read_dir(p) else { return };
        for e in rd.flatten() {
            let path = e.path();
            if path.is_dir() {
                walk(&path, n);
            } else {
                *n += 1;
            }
        }
    }
    let mut n = 0u32;
    walk(dir, &mut n);
    n
}

pub fn extract_archive(
    archive_path: &str,
    dest_dir: &str,
    password: &str,
    delete_after_extract: bool,
) -> Result<ExtractArchiveResult, String> {
    let archive = PathBuf::from(archive_path.trim());
    if !archive.is_file() {
        return Err(format!("归档不存在: {}", archive.display()));
    }
    let dest = PathBuf::from(dest_dir.trim());
    fs::create_dir_all(&dest).map_err(|e| format!("创建目标目录失败: {e}"))?;

    let lower = archive
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    let extracted = if lower.ends_with(".zip") {
        extract_zip(&archive, &dest)?
    } else if lower.ends_with(".tar")
        || lower.ends_with(".tar.gz")
        || lower.ends_with(".tgz")
        || lower.ends_with(".gz")
    {
        extract_tar_auto(&archive, &dest)?
    } else if lower.ends_with(".7z")
        || lower.ends_with(".rar")
        || lower.contains(".7z.")
        || lower.contains(".rar.")
    {
        try_external_extract(&archive, &dest, password)?
    } else {
        // 未知扩展：先试 zip，再试外部
        extract_zip(&archive, &dest).or_else(|_| try_external_extract(&archive, &dest, password))?
    };

    let mut deleted = false;
    if delete_after_extract {
        if fs::remove_file(&archive).is_ok() {
            deleted = true;
        }
    }

    Ok(ExtractArchiveResult {
        dest_dir: dest.to_string_lossy().into_owned(),
        extracted_files: extracted,
        deleted_archive: deleted,
    })
}

pub fn copy_extension_dir(src: &str, identity: &str, dest_root: &str) -> Result<String, String> {
    let src = PathBuf::from(src.trim());
    if !src.is_dir() {
        return Err(format!("扩展源目录不存在: {}", src.display()));
    }
    let id = identity.trim();
    if id.is_empty() || id.contains("..") || id.contains('/') || id.contains('\\') {
        return Err("非法扩展 identity".into());
    }
    let dest_root = PathBuf::from(dest_root.trim());
    fs::create_dir_all(&dest_root).map_err(|e| format!("创建扩展根目录失败: {e}"))?;
    let dest = dest_root.join(id);
    if dest.exists() {
        fs::remove_dir_all(&dest).map_err(|e| format!("清理旧扩展目录失败: {e}"))?;
    }
    copy_dir_recursive(&src, &dest)?;
    Ok(dest.to_string_lossy().into_owned())
}

fn copy_dir_recursive(src: &Path, dest: &Path) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|e| format!("创建目录失败: {e}"))?;
    for entry in fs::read_dir(src).map_err(|e| format!("读取目录失败: {e}"))? {
        let entry = entry.map_err(|e| format!("读取目录项失败: {e}"))?;
        let ty = entry.file_type().map_err(|e| e.to_string())?;
        let to = dest.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_recursive(&entry.path(), &to)?;
        } else if ty.is_file() {
            fs::copy(entry.path(), &to).map_err(|e| format!("复制文件失败: {e}"))?;
        }
    }
    Ok(())
}
