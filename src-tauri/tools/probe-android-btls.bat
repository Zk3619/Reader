@echo off
REM Simulate cargo-mobile2 (TARGET_CC=.cmd) and verify btls-sys still builds
REM thanks to the per-target CMAKE_TOOLCHAIN_FILE wrapper.
set "ANDROID_NDK_HOME=C:\Users\JUHAI-ZK\AppData\Local\Android\Sdk\ndk\29.0.14206865"
set "ANDROID_NDK_ROOT=%ANDROID_NDK_HOME%"
set "ANDROID_PLATFORM=android-24"
set "ANDROID_NATIVE_API_LEVEL=24"
set "CMAKE_GENERATOR=Ninja"
set "CMAKE_TOOLCHAIN_FILE_aarch64-linux-android=%~dp0..\cmake\android-arm64-v8a.toolchain.cmake"
set "PRE=%ANDROID_NDK_HOME%\toolchains\llvm\prebuilt\windows-x86_64\bin"
set "PATH=%PRE%;%PATH%"
set "TARGET_CC=%PRE%\aarch64-linux-android24-clang.cmd"
set "TARGET_CXX=%PRE%\aarch64-linux-android24-clang++.cmd"
set "TARGET_AR=%PRE%\llvm-ar.exe"
set "CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER=%PRE%\aarch64-linux-android24-clang.cmd"
cd /d "d:\Projects\Rust\Reader\Reader\src-tauri"
for /d %%D in (target\aarch64-linux-android\release\build\btls-sys-*) do rmdir /s /q "%%D" 2>nul
echo [probe] toolchain=%CMAKE_TOOLCHAIN_FILE_aarch64-linux-android%
cargo build -p btls-sys --release --target aarch64-linux-android
