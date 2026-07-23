# Android libmpv AAR 源目录（E2.D）

将预编译 **arm64-v8a** AAR 放到本目录（仓库不提交二进制）：

```text
src-tauri/android/libmpv/mpv-android-lib-2026-07-18.aar
```

| 项 | 说明 |
|----|------|
| 期望类 | `is.xyz.mpv.MPVView` / `is.xyz.mpv.MPVLib` |
| Gradle | `video-player` 优先 `../libmpv/mpv-android-lib-2026-07-18.aar`，再回退 `libs/mpvlib.aar` |
| 校验 | `.\scripts\android-mpvlib-check.ps1`；可选 `-StageLibs` 复制到 `video-player/libs/` |
| gitignore | `/android/libmpv/*.aar` |

桌面 DLL 仍在 `src-tauri/resources/libmpv/`，**不要**把 Android AAR 放进 resources（会误打桌面包）。

详见 [video-player/libs/README.md](../video-player/libs/README.md)。
