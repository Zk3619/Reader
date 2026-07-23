# RIFE 实时补帧运行时（可选）

默认**不**打进主安装包。放置后由 `video_rife_status` / 设置页探测。

## 目录

```text
resources/rife/
  README.md           ← 本文件
  scripts/rife.vpy    ← 仓库维护（小文件，可进 git）
  vs/                 ← 便携 VapourSynth + vs-mlrt（gitignore）
  models/             ← 模型（gitignore）
    rife_ncnn/        ← hasNcnn（ncnn / Vulkan）
    rife_dml/         ← hasDml（Windows DirectML / ORT_DML，ONNX）
    rife_trt/         ← hasTrt（需本机 TensorRT）
```

## 后端选择

| 设置 `frameInterpBackend` | 说明 |
|---------------------------|------|
| `auto` | **TRT → DirectML → ncnn** |
| `trt` | NVIDIA TensorRT |
| `dml` | Windows DirectML（vs-mlrt `Backend.ORT_DML`） |
| `ncnn` | ncnn-Vulkan |

## 最小可用（ncnn）

1. 安装/解压带 VapourSynth 的便携 mpv 工具链，或把 `vs` 插件目录放到 `resources/rife/vs/`。  
2. 放入 ncnn 模型到 `models/rife_ncnn/`（任意 `.bin`/`.param`/`*.onnx` 即可被探测到）。  
3. 确保系统/捆绑 mpv 能加载 `vapoursynth` 滤镜。  
4. 设置开启「实时补帧」；后端选 `auto` 或 `ncnn`。

## DirectML（推荐 Windows 非 TRT 机）

1. 使用带 **vs-mlrt + ORT DirectML** 的 VapourSynth 发行（Windows）。  
2. 将 RIFE **ONNX** 模型放到 `models/rife_dml/`（探测只检查目录非空；实际推理由 vs-mlrt 内置/旁路模型路径完成，亦可放自定义 onnx）。  
3. 后端选 `dml`，或 `auto`（无 TRT 时优先 DML）。  
4. DirectML **仅 Windows**；非 Windows 即使有模型也不会标 `hasDml`。

## TensorRT

在 `models/rife_trt/` 放入 vs-mlrt TRT 模型，且本机已装 CUDA/TensorRT。`auto` 时优先 TRT。

## 许可

见 `docs/VIDEO_RIFE.md`。
