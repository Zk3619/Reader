/**
 * getMediaSource 全音质回退链（对齐 MusicFreeDesktop-dev getMediaSourceAdapter）
 */

import type { MfQualityKey } from '@/lib/media/audio/online/mf-plugin/types';

export const MF_QUALITY_KEYS: MfQualityKey[] = ['low', 'standard', 'high', 'super'];

export type MfQualityFallbackDirection = 'higher' | 'lower';

/**
 * 从请求音质起，按方向展开后补另一侧，再与 qualityOrder 求交。
 */
export function buildMfQualityOrder(
  requestedQuality: MfQualityKey,
  qualityOrder: MfQualityKey[] = MF_QUALITY_KEYS,
  fallbackDirection: MfQualityFallbackDirection = 'lower',
): MfQualityKey[] {
  const idx = MF_QUALITY_KEYS.indexOf(requestedQuality);
  if (idx === -1) return [requestedQuality];

  const result: MfQualityKey[] = [requestedQuality];

  if (fallbackDirection === 'higher') {
    for (let i = idx + 1; i < MF_QUALITY_KEYS.length; i++) {
      result.push(MF_QUALITY_KEYS[i]!);
    }
    for (let i = idx - 1; i >= 0; i--) {
      result.push(MF_QUALITY_KEYS[i]!);
    }
  } else {
    for (let i = idx - 1; i >= 0; i--) {
      result.push(MF_QUALITY_KEYS[i]!);
    }
    for (let i = idx + 1; i < MF_QUALITY_KEYS.length; i++) {
      result.push(MF_QUALITY_KEYS[i]!);
    }
  }

  const allowed = new Set(qualityOrder);
  return result.filter((q) => allowed.has(q));
}

export const MF_MEDIA_SOURCE_RETRY_DELAY_MS = 150;
export const MF_MEDIA_SOURCE_MAX_ATTEMPTS = 2;
