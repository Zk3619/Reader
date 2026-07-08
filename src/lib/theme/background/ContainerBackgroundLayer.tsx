/**
 * 容器背景渲染组件（图片 / 动图 / 视频 + solid / gradient）
 */

import { Show, createMemo } from 'solid-js';
import type { JSX } from 'solid-js';
import type { ContainerBackgroundConfig, ThemeAssetManifest } from '@/lib/theme/schema/theme-pack-v1';
import {
  containerBackgroundToStyle,
  isVideoBackgroundAsset,
  type ContainerBackgroundStyleResult,
} from '@/lib/theme/background/container-background-style';
import { cn } from '@/lib/utils';

export interface ContainerBackgroundLayerProps {
  config?: ContainerBackgroundConfig;
  assets?: ThemeAssetManifest;
  resolveAssetUrl?: (assetId: string) => string | undefined;
  class?: string;
  /** 是否作为绝对定位背景层 */
  asBackgroundLayer?: boolean;
}

type AssetLayer = NonNullable<ContainerBackgroundStyleResult['assetLayer']>;

export function ContainerBackgroundLayer(props: ContainerBackgroundLayerProps) {
  const resolved = createMemo(() =>
    containerBackgroundToStyle(props.config, props.assets, props.resolveAssetUrl),
  );

  const assetLayer = createMemo(() => resolved().assetLayer);
  const isVideo = createMemo(() => isVideoBackgroundAsset(props.config, props.assets));
  const videoLayer = createMemo(() => {
    const layer = assetLayer();
    if (!layer || !isVideo()) return undefined;
    return layer;
  });
  const imageLayer = createMemo(() => {
    const layer = assetLayer();
    if (!layer || isVideo() || resolved().style.backgroundImage) return undefined;
    return layer;
  });

  const layerClass = () =>
    cn(
      props.asBackgroundLayer !== false && 'pointer-events-none absolute inset-0 z-0 overflow-hidden',
      props.class,
    );

  const assetMediaStyle = (layer: AssetLayer): JSX.CSSProperties => ({
    opacity: layer.opacity / 100,
    filter: layer.blurPx > 0 ? `blur(${layer.blurPx}px)` : undefined,
    'object-fit': layer.fit === 'fill' ? 'fill' : layer.fit,
    'object-position': layer.position,
  });

  const resolveAssetUrl = (layer: AssetLayer) =>
    layer.url ?? props.resolveAssetUrl?.(layer.assetId);

  return (
    <>
      <div class={layerClass()} style={resolved().style} data-theme-background="" aria-hidden="true" />
      <Show when={videoLayer()}>
        {(layer) => {
          const l = layer();
          const url = resolveAssetUrl(l);
          return (
            <Show when={url}>
              <video
                class={cn(layerClass(), 'h-full w-full object-cover')}
                style={assetMediaStyle(l)}
                src={url}
                autoplay
                muted
                loop
                playsinline
                aria-hidden="true"
              />
            </Show>
          );
        }}
      </Show>
      <Show when={imageLayer()}>
        {(layer) => {
          const l = layer();
          const url = resolveAssetUrl(l);
          return (
            <Show when={url}>
              <img
                class={cn(layerClass(), 'h-full w-full')}
                style={assetMediaStyle(l)}
                src={url}
                alt=""
                aria-hidden="true"
              />
            </Show>
          );
        }}
      </Show>
    </>
  );
}
