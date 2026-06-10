/**
 * 从摄像头视频帧解码二维码
 */

import { isTauri } from '@/lib/platform/detect';
import { decodeQrFromVideoElement, isQrDecodeSupported } from '@/lib/qr/decode-qr-core';

export async function decodeTextFromVideoElement(video: HTMLVideoElement): Promise<string | null> {
  return decodeQrFromVideoElement(video);
}

/** Tauri / HTTPS / localhost 等安全上下文（getUserMedia 前提） */
export function isCameraSecureContext(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.isSecureContext) return true;
  return isTauri();
}

/** 是否可调用摄像头（安全上下文 + getUserMedia） */
export function isCameraInputAvailable(): boolean {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return false;
  }
  return isCameraSecureContext();
}

/** 是否支持摄像头实时扫码（摄像头 + 二维码解码） */
export function isCameraScanAvailable(): boolean {
  return isCameraInputAvailable() && isQrDecodeSupported();
}
