# Android RIFE（可选增强包）

标准小喵 / mpv-android AAR **通常无** VapourSynth / RIFE 滤镜。

## 放置（gitignore）

```text
android/rife/
  models/           # ncnn 等模型
  librife_mpv.so    # 或放入 video-player/libs/

运行时也可拷到 App filesDir/rife/
```

探测：`RifeAvailability.probe` / 插件 `probeRife`。

无 so 时：仅当 prefs `frameInterpLightweightFallback=true` 时使用 mpv `interpolation=yes`（非 AI）。

详见 `docs/VIDEO_RIFE.md`。
