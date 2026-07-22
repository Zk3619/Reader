# Android 影视增强播放插件（E2 占位）

- `VideoPlayerActivity`：全屏页 stub（`libmpv` / `media3`）
- `VideoPlayerPlugin.openPlayer`：Tauri 插件命令

## 接线（后续）

1. 在 `gen/android` / tauri.settings 中 `include` 本模块（与 `music-media`、`tv-spider` 同级）。
2. `Cargo.toml` Android 依赖增加：
   `reader-video-player-native = { path = "android/video-player" }`
3. 将 Rust `video_android_open_player` 改为调用插件 `openPlayer`。
4. libmpv：放入预编译 AAR；Media3 已在 `build.gradle.kts` 声明。

许可：libmpv 见 `docs/VIDEO_LIBMPV_LICENSE.md`；Media3 为 Apache-2.0。
