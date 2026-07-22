# 卷积环境音 IR（可选）

将 LX Music Desktop 的滤波器 WAV 复制到本目录后，播放器会优先使用真实 IR，否则回退程序化近似。

来源（LX Desktop）：

`src/renderer/assets/medias/filters/`

需要的文件名：

- `filter-telephone.wav`
- `s2_r4_bd.wav`
- `bright-hall.wav`
- `cinema-diningroom.wav`
- `dining-living-true-stereo.wav`
- `living-bedroom-leveled.wav`
- `spreader50-65ms.wav`
- `s3_r1_bd.wav`
- `matrix-reverb1.wav`
- `matrix-reverb2.wav`
- `cardiod-35-10-spread.wav`
- `tim-omni-35-10-magnetic.wav`
- `feedback-spring.wav`

增益矩阵已在代码中对齐 LX `plugins/player` 的 `convolutions` 表。
