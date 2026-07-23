# 捆绑 libmpv（桌面增强核）

启用 `video-libmpv` 时，**链接**与**运行**都需要本目录中的文件：

| 阶段 | 文件 | 说明 |
|------|------|------|
| **链接（MSVC / rustc）** | `mpv.lib` | 导入库；缺则 `LNK1181` |
| **运行** | `libmpv-2.dll` | 动态库（本目录已有即可） |

## 为什么下载包里没有 mpv.lib？

- **MinGW / MSYS2** 包（如 `mingw-w64-x86_64-mpv-…`）提供的是 **`libmpv.dll.a`**，给 gcc 用，**不是** MSVC 的 `.lib`。
- 许多「仅播放器」的 `D:\mpv` 发行只带 `mpv.exe`，不带开发导入库。
- **有 `libmpv-2.dll` 就够了**：可用 VS 的 `dumpbin` + `lib` 从 DLL **生成** `mpv.lib`。

## 一键生成（推荐）

DLL 已放在本目录时：

```powershell
cd D:\Projects\Rust\Reader\Reader
.\scripts\bundle-libmpv.ps1
```

`build.rs` 在启用 `video-libmpv` 时会：

1. 准备 `mpv.lib`（链接）
2. **把 `libmpv-2.dll` 复制到 `target/debug` 或 `target/release`（exe 旁）**

否则 `tauri dev` 会在进程启动时 `STATUS_DLL_NOT_FOUND`（0xC0000135）——导入库在加载期就要找 DLL，改 PATH 已来不及。

```powershell
cd src-tauri
$env:MPV_LIB_DIR = (Resolve-Path .\resources\libmpv).Path
pnpm tauri dev --features video-libmpv
```

许可：捆绑 libmpv/FFmpeg 须遵守 GPL，见 `docs/VIDEO_LIBMPV_LICENSE.md`。
