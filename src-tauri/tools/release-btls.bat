@echo off
call "D:\Microsoft Visual Studio\2026\VC\Auxiliary\Build\vcvars64.bat" >nul
set CMAKE_GENERATOR=Ninja
set PATH=d:\Projects\Rust\Reader\Reader\src-tauri\tools\nasm\bin;%PATH%
cd /d d:\Projects\Rust\Reader\Reader\src-tauri
for /d %%D in (target\release\build\btls-sys-*) do rmdir /s /q "%%D" 2>nul
cargo build -p btls-sys --release
