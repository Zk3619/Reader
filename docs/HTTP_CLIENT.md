# 统一 HTTP 客户端

全平台 Rust 出站 HTTP 经 `http_client` 门面：

| 构建 | TLS 后端 | JA3 Emulation |
|------|----------|---------------|
| **默认 / lite** | **reqwest**（桌面 native-tls / Android rustls） | 否 |
| **`tls-impersonate`**（enhanced 默认） | **wreq** + BoringSSL（`btls`） | 是（`TlsMode::Emulation`） |

## 架构

| 路径 | 用途 |
|------|------|
| `http_client::TlsMode::Plain` | 书源 / 下载 / 代理 / WebJs 等默认 HTTPS |
| `http_client::TlsMode::Emulation(profile)` | JA3 / 浏览器指纹（仅 `tls-impersonate`） |
| `http_fetch_rquest` | 前端 JA3 正式入口；未启 feature 时 `available: false` |
| `http_fetch_impersonate` | 桌面 curl-impersonate 子进程兜底（强风控 / HTTP3） |

门面：`src-tauri/src/http_client/`。业务代码勿直接依赖 `reqwest` / `wreq`。

`wreq` 在 **Android / Linux** 开启 **`prefix-symbols`**，BoringSSL 符号加前缀，可与 `openssl-sys` 共存。Windows / macOS / iOS 上该 feature 官方不支持，保持关闭。

## 依赖约定

- **默认**：`reqwest`（gzip / brotli / deflate / stream / cookies + native-tls 或 rustls-tls）
- **可选** Cargo feature `tls-impersonate` → `wreq` / `wreq-util`
- **BT**：`librqbit` 仅 `not(android)`，feature `default-tls`；Windows 使用
  SChannel + CryptoAPI，避免其 `rust-tls` feature 通过 `sha1-ring` 拉入
  `aws-lc-rs` / `aws-lc-sys`
- **tauri-plugin-http**：Cookie 仓；桌面 `native-tls`，Android `rustls-tls`

## 如何开启 JA3

```bat
pnpm tauri:dev:enhanced
REM 或 lite 单独开：
set READER_TLS_IMPERSONATE=1
pnpm tauri:dev:lite
REM 强制关（含 enhanced）：
set READER_SKIP_TLS_IMPERSONATE=1
```

脚本会同时：

- 追加 `--features tls-impersonate`（enhanced 再加 `video-libmpv`）
- 设置 `VITE_YTDLP_TLS_IMPERSONATE=1`
- 注入 BoringSSL 原生工具链（见下）

lite 默认**不**编 wreq/BoringSSL，也**不**加载 MSVC/NASM/libclang 探测。
Windows lite 的 `librqbit` 走 SChannel + CryptoAPI，依赖树不含 AWS-LC。
`enhanced` / `READER_TLS_IMPERSONATE=1` 才会注入完整 BoringSSL 工具链。

## Windows 工具链（仅 tls-impersonate）

BoringSSL 原生 Windows 构建需要：

1. **Visual Studio** 开发者环境（`VsDevCmd.bat -arch=amd64` / `vcvars64.bat`）
2. **CMake** + **Ninja**（`CMAKE_GENERATOR=Ninja`；勿用未识别的 VS 2026 generator）
3. **NASM ≥ 2.16.03**（Strawberry 自带的 2.16.01 不足以编 AVX512 asm）

`pnpm tauri … enhanced`（或 `READER_TLS_IMPERSONATE=1`）经 `scripts/tauri-cli.mjs` 会自动：

- 加载最新 VC 的 `vcvars64.bat`（补齐 `INCLUDE` / `LIB` / `PATH`）
- 设置 `CMAKE_GENERATOR=Ninja`（`src-tauri/.cargo/config.toml` 亦强制此项）
- 前插工程内 `src-tauri/tools/nasm/bin`（若存在）
- 设置 `LIBCLANG_PATH`（bindgen / btls-sys）

裸 `cargo` 带 feature 时建议：

```bat
pnpm cargo:native check --features tls-impersonate
```

验收：

```bat
call "%VSINSTALLDIR%\Common7\Tools\VsDevCmd.bat" -arch=amd64
set PATH=%CD%\src-tauri\tools\nasm\bin;%PATH%
set CMAKE_GENERATOR=Ninja
cd src-tauri
cargo check --features tls-impersonate
cargo tree --features tls-impersonate -i openssl-sys
```

## Android（仅 tls-impersonate 时需 btls 工具链）

```bat
set ANDROID_NDK_HOME=<ndk>
set ANDROID_NDK_ROOT=%ANDROID_NDK_HOME%
set ANDROID_PLATFORM=android-24
set ANDROID_NATIVE_API_LEVEL=24
set CMAKE_GENERATOR=Ninja
set PRE=%ANDROID_NDK_HOME%\toolchains\llvm\prebuilt\windows-x86_64\bin
set CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER=%PRE%\aarch64-linux-android24-clang.cmd
set CMAKE_TOOLCHAIN_FILE_aarch64-linux-android=%CD%\cmake\android-arm64-v8a.toolchain.cmake
REM 不要设置全局 CC/CXX，否则污染 host 构建脚本。
cargo check --target aarch64-linux-android --features tls-impersonate
```

参考批处理：`src-tauri/tools/check-android-full.bat`、`build-check.bat`、`probe-android-btls.bat`。

### 为什么需要 `CMAKE_TOOLCHAIN_FILE_<triple>`

`btls-sys` 自带的 Android 分支有两个坑：

- 写死 `CMAKE_SYSTEM_VERSION=21`，而 NDK 26+ 已不再提供 API 21 的 `crtbegin`
- 把 `TARGET_CC`（`cargo-mobile2` 为 `tauri android` 注入的 `…-clang.cmd` 包装器）
  塞进 `CMAKE_C_COMPILER`，与 `android.toolchain.cmake` 抢编译器。第一次
  `build_target("ssl")` 能过，第二次 `build_target("crypto")` 触发缓存失效重配，
  CMake 改按 Windows 方式链接（`-lkernel32`、`--major-image-version`）而失败。

只要 `CMAKE_TOOLCHAIN_FILE` 有值，`btls-sys` 会整体跳过该分支。`src-tauri/cmake/`
下按 ABI 提供的 toolchain 文件负责钉住 `ANDROID_ABI` / `ANDROID_PLATFORM`
（默认 android-24，可用 `ANDROID_NATIVE_API_LEVEL` 覆盖），再委派给 NDK 官方
toolchain。`pnpm tauri android … enhanced` / `pnpm cargo:native … --features tls-impersonate`
会自动注入这些变量；变量带 triple 后缀，因此不影响桌面构建。

## iOS

本机无 macOS 时：代码与 `cfg` 已按桌面同路径；真机构建 / CI 后补。启用
`tls-impersonate` 时 `aarch64-apple-ios` 依赖 Xcode + NDK 同类 CMake 交叉工具链。

## 前端 JA3

- lite：`VITE_YTDLP_TLS_IMPERSONATE=0`（缺省）
- enhanced / `READER_TLS_IMPERSONATE=1`：`=1`
- 回退链：`http_fetch_rquest` → `http_fetch_impersonate` → 普通下载

冒烟：`tls.peet.ws` 等，经 `http_fetch_rquest`（enhanced）应返回 `available: true` 与浏览器风格 JA3。

## 验收清单

- [ ] lite `cargo check`（无 `tls-impersonate`）+ HTTPS（书源 / download_binary）
- [ ] enhanced `cargo check --features tls-impersonate` + `http_fetch_rquest` JA3 冒烟
- [ ] `cargo tree --features tls-impersonate -i openssl-sys`（host / android）无匹配
- [ ]（可选）`pnpm tauri android … enhanced --target aarch64`
