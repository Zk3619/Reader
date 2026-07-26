# Web RIFE 模型目录（lite 随包）

优先使用 **rife_v2**（7 通道，内部 padding）：

```text
web/
  rife_v2/rife_v4.9.onnx          ← 推荐（vs-mlrt implementation=2）
  rife_v2/rife_v4.9_ensemble.onnx
  rife/rife_v4.9.onnx             ← v1：11 通道 + meshgrid
  rife/rife_v4.9_ensemble.onnx
```

来源：[vs-mlrt external-models](https://github.com/AmusementClub/vs-mlrt/releases/tag/external-models)  
（`rife_v4.9.7z` / 含 `rife` 与 `rife_v2` 目录）

## I/O 约定（已接 ORT）

| 实现 | input shape | 通道 |
|------|-------------|------|
| v2 | `[1,7,H,W]` float32 | RGB_a + RGB_b + **t**(常数面) |
| v1 | `[1,11,H,W]` float32 | 上式 + mesh(h,v) + multiplier(h,w)；H/W pad 到 32 倍数 |

输出 `output`：`[1,3,H',W']` RGB，裁回原分辨率。

加载顺序：`resourceDir/.../rife_v2/rife_v4.9.onnx` → 回退 `rife/rife_v4.9.onnx`。
