# 影视实时补帧（RIFE）

> 里程碑 **E-RIFE.0–5**；协议见 [VIDEO_PLAYBACK_KERNEL.md](./VIDEO_PLAYBACK_KERNEL.md)。

## 范围

| 面 | 支持 |
|----|------|
| 桌面 libmpv 增强窗 | ✅ VapourSynth + RIFE（**TRT / DirectML / ncnn**） |
| 外置 mpv | ✅ 同参 `--vf=vapoursynth=...` |
| Android libmpv | ✅ ncnn 滤镜（需增强 AAR/so）或非 AI soft fallback；**无 DirectML / TRT** |
| Artplayer / Media3 | ❌ |

默认：**关闭**；引擎固定 **RIFE**；与 **Anime4K 互斥**；开补帧强制 `vo=gpu` + `hwdec=*-copy`。

## 桌面后端

| 后端 | vs-mlrt | 平台 | 模型目录 |
|------|---------|------|----------|
| `trt` | `Backend.TRT` | NVIDIA + TensorRT | `models/rife_trt/` |
| `dml` | `Backend.ORT_DML` | **Windows** DirectML（D3D12） | `models/rife_dml/` |
| `ncnn` | `Backend.NCNN_VK` | Vulkan | `models/rife_ncnn/` |

`auto` 优选顺序：**TRT → DirectML → ncnn**。

## 运行时

见 [`src-tauri/resources/rife/README.md`](../src-tauri/resources/rife/README.md)。大文件不进 git。

探测命令：`video_rife_status`（返回 `hasTrt` / `hasDml` / `hasNcnn`）。

校验（不下载）：`.\scripts\rife-runtime-check.ps1`（`-Strict` 要求至少一种模型存在）。

## 许可（再分发须自查）

| 组件 | 典型许可 | 说明 |
|------|----------|------|
| RIFE 模型 / 论文实现 | 各上游 LICENSE | 商用前核对 hzwer/RIFE 与模型卡 |
| vs-mlrt | MIT / GPL 组件混用需自查 | [AmusementClub/vs-mlrt](https://github.com/AmusementClub/vs-mlrt) |
| ncnn | BSD-3 | Tencent ncnn |
| TensorRT | NVIDIA 专有 | 不可随 GPL 应用随意捆绑；本项目默认**不**打进安装包 |
| DirectML / ONNX Runtime | Microsoft / ORT 许可 | 随 Windows / vs-mlrt ORT_DML 发行；默认**不**打进主安装包 |

应用本体若链接 GPL libmpv，整体发行仍按 [VIDEO_LIBMPV_LICENSE.md](./VIDEO_LIBMPV_LICENSE.md)。

## 设置项

`frameInterpEnabled` / `frameInterpBackend` (`auto`\|`trt`\|`dml`\|`ncnn`) / `frameInterpFactor` / `frameInterpModel` / `frameInterpMaxInputFps` / `frameInterpSceneDetect` / `frameInterpLightweightFallback`。
