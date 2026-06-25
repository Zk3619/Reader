/**
 * 导出用图片格式转换
 * - Tauri：优先 Rust `image` crate（见 media-convert.ts）
 * - Web：Canvas API
 */

export type ImageTargetFormat = 'original' | 'jpeg' | 'png' | 'webp';

export function targetImageMime(format: ImageTargetFormat): string {
  switch (format) {
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    default:
      return '';
  }
}

export function mimeToTargetFormat(mime: string): ImageTargetFormat {
  const m = mime.toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  return 'jpeg';
}

function loadImageFromBytes(bytes: ArrayBuffer, mime: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([bytes], { type: mime || 'image/jpeg' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片解码失败'));
    };
    img.src = url;
  });
}

/** Canvas 图片转换（Web 降级路径） */
export async function convertImageWithCanvas(
  bytes: ArrayBuffer,
  sourceMime: string,
  target: ImageTargetFormat,
  quality = 0.92,
): Promise<{ bytes: ArrayBuffer; mime: string }> {
  if (target === 'original') {
    return { bytes, mime: sourceMime || 'image/jpeg' };
  }
  const targetMime = targetImageMime(target);
  const sourceFmt = mimeToTargetFormat(sourceMime);
  if (sourceFmt === target) {
    return { bytes, mime: targetMime };
  }

  if (typeof document === 'undefined') {
    return { bytes, mime: sourceMime || 'image/jpeg' };
  }

  const img = await loadImageFromBytes(bytes, sourceMime);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 不可用');
  ctx.drawImage(img, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, targetMime, quality);
  });
  if (!blob) throw new Error('格式转换失败');
  return { bytes: await blob.arrayBuffer(), mime: targetMime };
}

export function imageExtensionForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  return 'jpg';
}
