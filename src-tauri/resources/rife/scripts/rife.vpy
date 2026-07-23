# RIFE realtime frame interpolation for mpv (VapourSynth)
# user-data: backend=trt|dml|ncnn,factor=2,model=4.15_lite,sc=1,max_fps=30
# dml = vs-mlrt Backend.ORT_DML (DirectML / D3D12, Windows)

import vapoursynth as vs

core = vs.core
clip = video_in  # noqa: F821 — provided by mpv vapoursynth filter


def _parse_ud(raw):
    out = {
        "backend": "ncnn",
        "factor": 2,
        "model": "4.15_lite",
        "sc": 1,
        "max_fps": 30,
    }
    if not raw:
        return out
    for part in str(raw).split(","):
        if "=" not in part:
            continue
        k, v = part.split("=", 1)
        k = k.strip().lower()
        v = v.strip()
        if k == "backend" and v in ("trt", "dml", "ncnn"):
            out["backend"] = v
        elif k == "factor":
            try:
                out["factor"] = max(2, min(4, int(float(v))))
            except Exception:
                pass
        elif k == "model" and v:
            try:
                from urllib.parse import unquote

                out["model"] = unquote(v)
            except Exception:
                out["model"] = v
        elif k == "sc":
            out["sc"] = 0 if v in ("0", "false", "no") else 1
        elif k == "max_fps":
            try:
                out["max_fps"] = max(1, int(float(v)))
            except Exception:
                pass
    return out


ud = ""
try:
    ud = str(user_data)  # noqa: F821
except Exception:
    pass
cfg = _parse_ud(ud)

try:
    fps = float(clip.fps_num) / float(clip.fps_den) if clip.fps_den else 0.0
except Exception:
    fps = 0.0

if fps >= float(cfg["max_fps"]):
    clip.set_output()
else:
    factor = int(cfg["factor"])
    backend = cfg["backend"]
    out = None
    err = None

    try:
        import vsmlrt  # type: ignore

        be = None
        if backend == "trt" and hasattr(vsmlrt.Backend, "TRT"):
            be = vsmlrt.Backend.TRT()
        elif backend == "dml" and hasattr(vsmlrt.Backend, "ORT_DML"):
            # DirectML via ONNX Runtime（Windows D3D12）
            be = vsmlrt.Backend.ORT_DML(device_id=0, fp16=False)
        elif backend == "ncnn" and hasattr(vsmlrt.Backend, "NCNN_VK"):
            be = vsmlrt.Backend.NCNN_VK()
        elif backend not in ("trt", "dml", "ncnn"):
            be = None
        elif hasattr(vsmlrt.Backend, "NCNN_VK"):
            # 兜底：指定后端不可用时尝试 ncnn
            be = vsmlrt.Backend.NCNN_VK()

        if be is not None:
            # video_player=True 降低实时路径延迟（vs-mlrt 建议）
            kwargs = {"multi": factor, "backend": be}
            try:
                out = vsmlrt.RIFE(clip, video_player=True, **kwargs)
            except TypeError:
                out = vsmlrt.RIFE(clip, **kwargs)
    except Exception as e:
        err = e

    if out is None:
        try:
            out = core.rife.RIFE(clip, factor_num=factor, ensemble=False)
        except Exception as e2:
            err = e2 if err is None else err

    if out is None:
        raise RuntimeError(
            "RIFE unavailable (install vs-mlrt with TRT/ORT_DML/NCNN_VK or vsrife). Last error: {}".format(
                err
            )
        )

    out.set_output()
