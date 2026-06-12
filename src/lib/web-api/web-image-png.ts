/**
 * Web API 图片 → PNG（对齐 Legado HttpServer Bitmap.compress PNG）
 */

export async function createPlaceholderPng(
  width: number,
  height: number,
  label = '?',
): Promise<Uint8Array> {
  if (typeof document === 'undefined') {
    return minimalPngPlaceholder(width, height);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return minimalPngPlaceholder(width, height);
  ctx.fillStyle = '#e5e7eb';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#9ca3af';
  ctx.font = `${Math.max(10, Math.floor(height * 0.35))}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, width / 2, height / 2);
  return canvasToPng(canvas);
}

export async function encodeBytesAsPng(
  bytes: ArrayBuffer,
  mime: string,
  options?: {
    width?: number;
    height?: number;
    maxWidth?: number;
    fit?: 'cover' | 'scale';
  },
): Promise<Uint8Array> {
  if (typeof createImageBitmap === 'undefined' || typeof document === 'undefined') {
    if (mime === 'image/png') return new Uint8Array(bytes);
    throw new Error('PNG 编码需要浏览器环境');
  }

  const blob = new Blob([bytes], { type: mime || 'image/jpeg' });
  const bitmap = await createImageBitmap(blob);
  try {
    let targetW = options?.width ?? bitmap.width;
    let targetH = options?.height ?? bitmap.height;

    if (options?.maxWidth && !options.width && !options.height) {
      const maxW = Math.max(1, options.maxWidth);
      if (bitmap.width > maxW) {
        const scale = maxW / bitmap.width;
        targetW = Math.max(1, Math.round(bitmap.width * scale));
        targetH = Math.max(1, Math.round(bitmap.height * scale));
      } else {
        targetW = bitmap.width;
        targetH = bitmap.height;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, targetW);
    canvas.height = Math.max(1, targetH);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d unavailable');

    if (options?.fit === 'cover' && options.width && options.height) {
      const tw = options.width;
      const th = options.height;
      canvas.width = tw;
      canvas.height = th;
      const scale = Math.max(tw / bitmap.width, th / bitmap.height);
      const sw = tw / scale;
      const sh = th / scale;
      const sx = (bitmap.width - sw) / 2;
      const sy = (bitmap.height - sh) / 2;
      ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, tw, th);
    } else {
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    }

    return await canvasToPng(canvas);
  } finally {
    bitmap.close?.();
  }
}

async function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const pngBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('PNG 编码失败'))),
      'image/png',
    );
  });
  return new Uint8Array(await pngBlob.arrayBuffer());
}

/** 无 DOM 时的 1×1 灰 PNG */
function minimalPngPlaceholder(width: number, height: number): Uint8Array {
  void width;
  void height;
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ]);
}
