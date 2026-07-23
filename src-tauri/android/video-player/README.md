# Android 影视增强播放插件（E2.A–E2.D）

- `VideoPlayerActivity`：`media3`（ExoPlayer）可播；`libmpv` 需本机 AAR
- `VideoPlayerPlugin.openPlayer`：Tauri 插件命令（含 Anime4K / 字幕 / softvol extras）
- **E2.D**：优先 `../libmpv/mpv-android-lib-2026-07-18.aar`，回退 `libs/mpvlib.aar`

## 接线

1. 根 `Cargo.toml` Android 依赖已含：`reader-video-player-native = { path = "android/video-player" }`
2. 构建时 `build.rs` 自动写入 `gen/android/tauri.settings.gradle`
3. Rust：`platform/android/video_player.rs` + `video_android_open_player` → `openPlayer`
4. libmpv：见 [../libmpv/README.md](../libmpv/README.md) 与 [libs/README.md](./libs/README.md)
5. 校验：`.\scripts\android-mpvlib-check.ps1`

许可：libmpv 见 `docs/VIDEO_LIBMPV_LICENSE.md`；Media3 为 Apache-2.0。
