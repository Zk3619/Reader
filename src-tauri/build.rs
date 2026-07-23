use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

fn main() {
    println!("cargo:rerun-if-changed=permissions");
    println!("cargo:rerun-if-changed=android/display-reader");
    println!("cargo:rerun-if-changed=android/music-media");
    println!("cargo:rerun-if-changed=android/tv-spider");
    println!("cargo:rerun-if-changed=resources/libmpv");
    println!("cargo:rerun-if-changed=resources/libmpv/mpv.lib");
    println!("cargo:rerun-if-changed=resources/libmpv/libmpv-2.dll");
    println!("cargo:rerun-if-env-changed=MPV_LIB_DIR");
    println!("cargo:rerun-if-env-changed=LIB");

    if env::var_os("CARGO_FEATURE_VIDEO_LIBMPV").is_some() {
        configure_libmpv_link();
    }

    tauri_build::build()
}

/// 过小的 mpv.lib 多半是空 EXPORTS 生成的坏库（会导致 LNK2019/1120）。
const MIN_MPV_LIB_BYTES: u64 = 4096;

/// libmpv2-sys 会 `rustc-link-lib=mpv`，MSVC 需要能找到可用的 `mpv.lib`。
fn configure_libmpv_link() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    let out_lib = out_dir.join("mpv.lib");

    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(dir) = env::var("MPV_LIB_DIR") {
        let p = PathBuf::from(dir.trim());
        if !p.as_os_str().is_empty() {
            candidates.push(p);
        }
    }
    candidates.push(manifest_dir.join("resources").join("libmpv"));
    candidates.push(manifest_dir.join("libmpv"));
    if let Ok(home) = env::var("USERPROFILE") {
        let home = PathBuf::from(home);
        candidates.push(home.join("mpv").join("lib"));
        candidates.push(home.join("mpv"));
    }
    if let Ok(lib) = env::var("LIB") {
        for part in lib.split(';') {
            let p = PathBuf::from(part.trim());
            if !p.as_os_str().is_empty() {
                candidates.push(p);
            }
        }
    }

    // 丢弃 OUT_DIR 中过小的坏库，避免短路径“假成功”
    if is_bad_mpv_lib(&out_lib) {
        let _ = fs::remove_file(&out_lib);
    }

    for dir in &candidates {
        if prepare_mpv_lib(dir, &out_lib) {
            println!("cargo:rustc-link-search=native={}", out_dir.display());
            // 显式 dylib，避免偶发静态解析
            println!("cargo:rustc-link-lib=dylib=mpv");
            let sz = fs::metadata(&out_lib).map(|m| m.len()).unwrap_or(0);
            println!(
                "cargo:warning=video-libmpv: using {} ({} bytes)",
                out_lib.display(),
                sz
            );
            // 导入库在链接期解析；运行期 Windows 加载器要在 exe 旁找到 DLL（改 PATH 已太晚）
            copy_libmpv_runtime_dlls(dir, &out_dir);
            return;
        }
    }

    for dir in &candidates {
        if dir.is_dir() {
            println!("cargo:rustc-link-search=native={}", dir.display());
        }
    }
    println!(
        "cargo:warning=video-libmpv: usable mpv.lib not found. Run scripts/bundle-libmpv.ps1 with libmpv-2.dll present."
    );
}

fn is_bad_mpv_lib(path: &Path) -> bool {
    match fs::metadata(path) {
        Ok(m) => m.is_file() && m.len() < MIN_MPV_LIB_BYTES,
        Err(_) => false,
    }
}

fn is_good_mpv_lib(path: &Path) -> bool {
    match fs::metadata(path) {
        Ok(m) => m.is_file() && m.len() >= MIN_MPV_LIB_BYTES,
        Err(_) => false,
    }
}

/// 将 libmpv-2.dll 复制到 `target/{debug|release}/`（exe 旁）与 `deps/`，
/// 否则 `tauri dev` / `cargo run` 会在进程启动时 STATUS_DLL_NOT_FOUND。
fn copy_libmpv_runtime_dlls(from_dir: &Path, out_dir: &Path) {
    let dll_names = ["libmpv-2.dll", "mpv-2.dll", "libmpv.dll", "mpv.dll"];
    let src = dll_names
        .iter()
        .map(|n| from_dir.join(n))
        .find(|p| p.is_file());
    let Some(src) = src else {
        println!(
            "cargo:warning=video-libmpv: no runtime DLL in {} — app will fail with STATUS_DLL_NOT_FOUND",
            from_dir.display()
        );
        return;
    };
    let file_name = src.file_name().unwrap().to_owned();

    // OUT_DIR = …/target/<profile>/build/<crate-hash>/out → 上溯 3 层到 <profile>
    let mut profile_dir = out_dir.to_path_buf();
    for _ in 0..3 {
        if !profile_dir.pop() {
            println!(
                "cargo:warning=video-libmpv: cannot resolve profile dir from OUT_DIR={}",
                out_dir.display()
            );
            return;
        }
    }

    let targets = [
        profile_dir.clone(),
        profile_dir.join("deps"),
    ];
    for dest_dir in &targets {
        if !dest_dir.is_dir() {
            let _ = fs::create_dir_all(dest_dir);
        }
        let dest = dest_dir.join(&file_name);
        match fs::copy(&src, &dest) {
            Ok(n) => println!(
                "cargo:warning=video-libmpv: copied runtime {} -> {} ({} bytes)",
                src.display(),
                dest.display(),
                n
            ),
            Err(e) => println!(
                "cargo:warning=video-libmpv: failed to copy {} -> {}: {}",
                src.display(),
                dest.display(),
                e
            ),
        }
    }
}

/// 把可用的 mpv.lib 放到 out_lib；必要时从 DLL 生成。
fn prepare_mpv_lib(dir: &Path, out_lib: &Path) -> bool {
    // 1) 目录内已有好的 mpv.lib → 复制到 OUT_DIR
    let src_lib = dir.join("mpv.lib");
    if is_good_mpv_lib(&src_lib) {
        return fs::copy(&src_lib, out_lib).is_ok() && is_good_mpv_lib(out_lib);
    }
    for alt in ["libmpv-2.lib", "mpv-2.lib", "libmpv.lib"] {
        let src = dir.join(alt);
        if is_good_mpv_lib(&src) {
            return fs::copy(&src, out_lib).is_ok() && is_good_mpv_lib(out_lib);
        }
    }

    // 2) 从 DLL 生成
    let dll = ["libmpv-2.dll", "mpv-2.dll", "libmpv.dll", "mpv.dll"]
        .into_iter()
        .map(|n| dir.join(n))
        .find(|p| p.is_file());
    let Some(dll) = dll else {
        return false;
    };

    let def_path = out_lib.with_extension("def");
    // 优先用目录里已有（且非空）的 def
    let existing_def = dir.join("mpv.def");
    let def_to_use = if existing_def.is_file()
        && fs::metadata(&existing_def).map(|m| m.len()).unwrap_or(0) > 64
    {
        existing_def
    } else if generate_def_from_dll(&dll, &def_path) {
        def_path.clone()
    } else {
        return false;
    };

    if !run_lib_from_def(&def_to_use, out_lib) {
        return false;
    }
    if !is_good_mpv_lib(out_lib) {
        let _ = fs::remove_file(out_lib);
        println!(
            "cargo:warning=video-libmpv: generated mpv.lib too small; check dumpbin exports"
        );
        return false;
    }
    // 写回 resources 便于下次直接用
    let _ = fs::copy(out_lib, dir.join("mpv.lib"));
    let _ = fs::copy(&def_to_use, dir.join("mpv.def"));
    true
}

fn run_lib_from_def(def: &Path, out_lib: &Path) -> bool {
    let Some(lib_exe) = find_msvc_tool("lib.exe") else {
        println!("cargo:warning=video-libmpv: lib.exe not found");
        return false;
    };
    let _ = fs::remove_file(out_lib);
    let _ = fs::remove_file(out_lib.with_extension("exp"));
    let status = Command::new(&lib_exe)
        .args([
            "/nologo",
            &format!("/def:{}", def.display()),
            &format!("/out:{}", out_lib.display()),
            "/machine:x64",
        ])
        .status();
    matches!(status, Ok(s) if s.success()) && is_good_mpv_lib(out_lib)
}

fn generate_def_from_dll(dll: &Path, def_out: &Path) -> bool {
    let Some(dumpbin) = find_msvc_tool("dumpbin.exe") else {
        println!("cargo:warning=video-libmpv: dumpbin.exe not found");
        return false;
    };
    let output = match Command::new(&dumpbin)
        .args(["/nologo", "/exports"])
        .arg(dll)
        .output()
    {
        Ok(o) if o.status.success() => o,
        _ => return false,
    };
    let text = String::from_utf8_lossy(&output.stdout);
    // 与 scripts/bundle-libmpv.ps1 一致：宽松匹配全部 mpv_* 导出名
    let mut exports: Vec<String> = Vec::new();
    for cap in regex_mpv_exports(&text) {
        if !exports.iter().any(|e| e == &cap) {
            exports.push(cap);
        }
    }
    if exports.is_empty() {
        println!(
            "cargo:warning=video-libmpv: no mpv_* exports in {}",
            dll.display()
        );
        return false;
    }
    println!(
        "cargo:warning=video-libmpv: parsed {} exports from {}",
        exports.len(),
        dll.display()
    );
    let dll_name = dll
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("libmpv-2.dll");
    let mut content = format!("LIBRARY \"{dll_name}\"\r\nEXPORTS\r\n");
    for e in &exports {
        content.push_str(e);
        content.push_str("\r\n");
    }
    fs::write(def_out, content).is_ok()
}

fn regex_mpv_exports(text: &str) -> Vec<String> {
    // 避免依赖 regex crate：手工扫 mpv_ 标识符
    let bytes = text.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i + 4 < bytes.len() {
        if bytes[i] == b'm'
            && bytes[i + 1] == b'p'
            && bytes[i + 2] == b'v'
            && bytes[i + 3] == b'_'
        {
            let start = i;
            i += 4;
            while i < bytes.len()
                && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'_')
            {
                i += 1;
            }
            let name = &text[start..i];
            // 边界：前一个字符非标识符
            let ok_before = start == 0
                || !(text.as_bytes()[start - 1].is_ascii_alphanumeric()
                    || text.as_bytes()[start - 1] == b'_');
            if ok_before {
                out.push(name.to_string());
            }
            continue;
        }
        i += 1;
    }
    out
}

fn find_msvc_tool(name: &str) -> Option<PathBuf> {
    if let Ok(output) = Command::new("where").arg(name).output() {
        if output.status.success() {
            let line = String::from_utf8_lossy(&output.stdout);
            if let Some(first) = line.lines().next() {
                let p = PathBuf::from(first.trim());
                if p.is_file() {
                    return Some(p);
                }
            }
        }
    }
    let vswhere =
        PathBuf::from(r"C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe");
    if vswhere.is_file() {
        let output = Command::new(&vswhere)
            .args([
                "-latest",
                "-products",
                "*",
                "-requires",
                "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
                "-find",
                &format!(r"VC\Tools\MSVC\**\bin\Hostx64\x64\{name}"),
            ])
            .output()
            .ok()?;
        if output.status.success() {
            let line = String::from_utf8_lossy(&output.stdout);
            if let Some(first) = line.lines().next() {
                let p = PathBuf::from(first.trim());
                if p.is_file() {
                    return Some(p);
                }
            }
        }
    }
    let guess = PathBuf::from(
        r"D:\Microsoft Visual Studio\2026\VC\Tools\MSVC\14.50.35717\bin\HostX64\x64",
    )
    .join(name);
    if guess.is_file() {
        return Some(guess);
    }
    None
}
