/**
 * 从图片文件解码二维码/条形码文本（优先 BarcodeDetector API）
 */

export async function decodeTextFromImageFile(file: File): Promise<string | null> {
  if (typeof BarcodeDetector === 'undefined') {
    return null;
  }
  const detector = new BarcodeDetector({ formats: ['qr_code'] });
  const bitmap = await createImageBitmap(file);
  try {
    const codes = await detector.detect(bitmap);
    const text = codes[0]?.rawValue?.trim();
    return text || null;
  } finally {
    bitmap.close();
  }
}

export function isBarcodeDetectorAvailable(): boolean {
  return typeof BarcodeDetector !== 'undefined';
}
