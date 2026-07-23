# Android mpvlib / FlameMaster 消费侧（E2.B–E2.G）

仓库**不提交**二进制。推荐：

```text
src-tauri/android/libmpv/mpv-android-lib-2026-07-18.aar
src-tauri/android/video-player/libs/DanmakuFlameMaster.aar
```

可选 staged 副本：`libs/mpvlib.aar`

## Gradle

1. mpv：`../libmpv/….aar` → `libs/mpvlib.aar`；有则编译 `src/mpvAvailable`（`ReaderMpvView`）
2. FlameMaster：`libs/DanmakuFlameMaster.aar`；有则编译 `src/flameAvailable`
3. 皆无 → Media3 仍可 assemble

Anime4K shaders：`assets/shaders/`（17 文件，对齐桌面/小喵）。
