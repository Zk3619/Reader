/**
 * 容器背景：solid / gradient / asset（图片、动图、视频）
 */

import type { ContainerBackgroundConfig, ThemeAssetManifest } from '@/lib/theme/schema/theme-pack-v1';

export interface ContainerBackgroundStyleResult {
  className?: string;
  style: Record<string, string>;
  assetLayer?: {
    assetId: string;
    fit: 'cover' | 'contain' | 'fill';
    position: string;
    opacity: number;
    blurPx: number;
    mime?: string;
    url?: string;
  };
}

export function containerBackgroundToStyle(
  config: ContainerBackgroundConfig | undefined,
  assets?: ThemeAssetManifest,
  resolveAssetUrl?: (assetId: string) => string | undefined,
): ContainerBackgroundStyleResult {
  if (!config || config.type === 'none') {
    return { style: {} };
  }

  if (config.type === 'solid') {
    const opacity = config.opacity ?? 100;
    const blurPx = config.blurPx ?? 0;
    return {
      style: {
        backgroundColor: config.color,
        opacity: String(opacity / 100),
        ...(blurPx > 0 ? { filter: `blur(${blurPx}px)` } : {}),
      },
    };
  }

  if (config.type === 'gradient') {
    const angle = config.angle ?? 180;
    const stops = config.stops.map((s) => `${s.color} ${s.at}`).join(', ');
    const opacity = config.opacity ?? 100;
    const blurPx = config.blurPx ?? 0;
    return {
      style: {
        backgroundImage: `linear-gradient(${angle}deg, ${stops})`,
        opacity: String(opacity / 100),
        ...(blurPx > 0 ? { filter: `blur(${blurPx}px)` } : {}),
      },
    };
  }

  const fit = config.fit ?? 'cover';
  const position = config.position ?? 'center';
  const opacity = config.opacity ?? 100;
  const blurPx = config.blurPx ?? 0;
  const asset = assets?.[config.assetId];
  const url = resolveAssetUrl?.(config.assetId);

  if (url && asset?.kind !== 'video') {
    return {
      style: {
        backgroundImage: `url("${url}")`,
        backgroundSize: fit === 'fill' ? '100% 100%' : fit,
        backgroundPosition: position,
        backgroundRepeat: 'no-repeat',
        opacity: String(opacity / 100),
        ...(blurPx > 0 ? { filter: `blur(${blurPx}px)` } : {}),
      },
    };
  }

  return {
    style: {},
    assetLayer: {
      assetId: config.assetId,
      fit,
      position,
      opacity,
      blurPx,
      mime: asset?.mime,
      url,
    },
  };
}

export function isVideoBackgroundAsset(
  config: ContainerBackgroundConfig | undefined,
  assets?: ThemeAssetManifest,
): boolean {
  if (!config || config.type !== 'asset') return false;
  const asset = assets?.[config.assetId];
  return asset?.kind === 'video' || (asset?.mime?.startsWith('video/') ?? false);
}
