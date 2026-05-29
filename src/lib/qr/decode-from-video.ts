/**
 * 从摄像头视频帧解码二维码（BarcodeDetector + createImageBitmap）
 */

import { isBarcodeDetectorAvailable } from '@/lib/qr/decode-from-image';

let detector: BarcodeDetector | null = null;

function getDetector(): BarcodeDetector | null {
  if (!isBarcodeDetectorAvailable()) return null;
  if (!detector) {
    detector = new BarcodeDetector({ formats: ['qr_code'] });
  }
  return detector;
}

export async function decodeTextFromVideoElement(video: HTMLVideoElement): Promise<string | null> {
  const det = getDetector();
  if (!det || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
  if (video.videoWidth < 2 || video.videoHeight < 2) return null;

  const bitmap = await createImageBitmap(video);
  try {
    const codes = await det.detect(bitmap);
    const text = codes[0]?.rawValue?.trim();
    return text || null;
  } finally {
    bitmap.close();
  }
}

export function isCameraScanAvailable(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    isBarcodeDetectorAvailable()
  );
}
