#!/usr/bin/env python3
"""Regenerate Android launcher mipmaps with adaptive-icon safe-zone padding.

API 26+ adaptive icons are 108dp; launchers only guarantee the inner 72dp
(~66.7%). `tauri icon` copies the full-bleed square logo into that 108dp
canvas, so "Reader" + the book get clipped.

Source: src-tauri/icons/icon.png (black glyph, transparent background).
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src-tauri" / "icons" / "icon.png"
RES = ROOT / "src-tauri" / "gen" / "android" / "app" / "src" / "main" / "res"

# 108dp * density. Inner 72/108 ≈ 0.667 is the guaranteed visible square.
FOREGROUND = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}

# Legacy square / round (48dp * density). hdpi must be 72, not 49.
LAUNCHER = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

SAFE_ZONE = 72 / 108
# 可见区是安全区内侧，不是整张 108dp。0.92×安全区几乎贴满遮罩，桌面上仍显挤。
# 0.70×安全区 ≈ 画布 47%：遮罩内四周约 15% 留白。
SAFE_FIT = SAFE_ZONE * 0.70
LAUNCHER_FIT = 0.70
ROUND_FIT = 0.64
STORE_FIT = SAFE_FIT


def content_bbox(im: Image.Image) -> tuple[int, int, int, int]:
    alpha = im.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise SystemExit(f"no opaque pixels in {im.size}")
    return bbox


def fit_content(src: Image.Image, canvas: int, inner_ratio: float) -> Image.Image:
    src = src.convert("RGBA")
    cropped = src.crop(content_bbox(src))
    inner = max(1, int(round(canvas * inner_ratio)))
    cw, ch = cropped.size
    scale = min(inner / cw, inner / ch)
    nw = max(1, int(round(cw * scale)))
    nh = max(1, int(round(ch * scale)))
    resized = cropped.resize((nw, nh), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    out.alpha_composite(resized, ((canvas - nw) // 2, (canvas - nh) // 2))
    return out


def main() -> None:
    src = Image.open(SRC).convert("RGBA")
    if not RES.is_dir():
        raise SystemExit(f"missing Android res dir: {RES}")

    for folder, size in FOREGROUND.items():
        dest = RES / folder / "ic_launcher_foreground.png"
        dest.parent.mkdir(parents=True, exist_ok=True)
        fit_content(src, size, SAFE_FIT).save(dest, "PNG")
        print(f"wrote {dest.relative_to(ROOT)} ({size}x{size})")

    for folder, size in LAUNCHER.items():
        square = fit_content(src, size, LAUNCHER_FIT)
        round_icon = fit_content(src, size, ROUND_FIT)
        (RES / folder / "ic_launcher.png").parent.mkdir(parents=True, exist_ok=True)
        square.save(RES / folder / "ic_launcher.png", "PNG")
        round_icon.save(RES / folder / "ic_launcher_round.png", "PNG")
        print(f"wrote {folder}/ic_launcher{{,_round}}.png ({size}x{size})")

    # Play Console 高清图标：512² 不透明白底 + 当前 glyph。勿预烘焙圆角，商店会自己蒙版。
    store = Image.new("RGBA", (512, 512), (255, 255, 255, 255))
    store.alpha_composite(fit_content(src, 512, STORE_FIT))
    store_path = RES / "play_store_512.png"
    store.save(store_path, "PNG")
    print(f"wrote {store_path.relative_to(ROOT)} (512x512)")


if __name__ == "__main__":
    main()
