/**
 * 二维码解码：优先 BarcodeDetector（Android Chrome 等），回退 jsQR（WebView2 / 桌面 Edge 等）
 */

import jsQR from 'jsqr';

export function isQrDecodeSupported(): boolean {
  return typeof document !== 'undefined';
}

export function isBarcodeDetectorAvailable(): boolean {
  return typeof BarcodeDetector !== 'undefined';
}

async function decodeWithBarcodeDetector(
  source: ImageBitmap | HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
): Promise<string | null> {
  if (!isBarcodeDetectorAvailable()) return null;
  try {
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    const codes = await detector.detect(source);
    return codes[0]?.rawValue?.trim() || null;
  } catch {
    return null;
  }
}

function decodeWithJsQr(imageData: ImageData): string | null {
  const result = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: 'attemptBoth',
  });
  return result?.data?.trim() || null;
}

function imageBitmapToImageData(bitmap: ImageBitmap): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('无法创建画布');
  }
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export async function decodeQrFromImageBitmap(bitmap: ImageBitmap): Promise<string | null> {
  try {
    const fromDetector = await decodeWithBarcodeDetector(bitmap);
    if (fromDetector) return fromDetector;

    const imageData = imageBitmapToImageData(bitmap);
    return decodeWithJsQr(imageData);
  } finally {
    bitmap.close();
  }
}

export async function decodeQrFromVideoElement(video: HTMLVideoElement): Promise<string | null> {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
  if (video.videoWidth < 2 || video.videoHeight < 2) return null;

  const fromDetector = await decodeWithBarcodeDetector(video);
  if (fromDetector) return fromDetector;

  const bitmap = await createImageBitmap(video);
  try {
    const imageData = imageBitmapToImageData(bitmap);
    return decodeWithJsQr(imageData);
  } finally {
    bitmap.close();
  }
}

export async function decodeQrFromImageFile(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  return decodeQrFromImageBitmap(bitmap);
}
