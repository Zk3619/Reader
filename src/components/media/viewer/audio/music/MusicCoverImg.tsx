/**
 * 音乐封面图：经磁盘/内存缓存后以 blob URL 展示，避免外站直连。
 */

import { createEffect, createSignal, on, Show, type JSX } from 'solid-js';
import { cn } from '@/lib/utils';
import {
  loadMusicCoverBlob,
  peekMusicCoverBlob,
} from '@/lib/media/audio/music-cover-loader';
import { resolveMusicCoverCacheKey } from '@/lib/media/audio/music-cover-disk-cache';

export interface MusicCoverImgProps {
  src?: string | null;
  trackId?: string | null;
  playlistSource?: string | null;
  playlistId?: string | null;
  cacheKey?: string | null;
  alt?: string;
  class?: string;
  loading?: 'lazy' | 'eager';
  draggable?: boolean;
  fallback?: JSX.Element;
  onError?: () => void;
  onLoad?: () => void;
}

export function MusicCoverImg(props: MusicCoverImgProps) {
  const [blobUrl, setBlobUrl] = createSignal<string | null>(null);
  const [failed, setFailed] = createSignal(false);

  const cacheKey = () =>
    props.cacheKey?.trim() ||
    resolveMusicCoverCacheKey({
      trackId: props.trackId,
      playlistSource: props.playlistSource,
      playlistId: props.playlistId,
      coverUrl: props.src,
    });

  createEffect(
    on(
      () => [props.src?.trim() ?? '', cacheKey() ?? ''] as const,
      ([src, key]) => {
        setFailed(false);
        if (!src) {
          setBlobUrl(null);
          return;
        }
        if (src.startsWith('blob:') || src.startsWith('data:')) {
          setBlobUrl(src);
          return;
        }
        const peeked = key ? peekMusicCoverBlob(key) : null;
        setBlobUrl(peeked);
        let cancelled = false;
        void loadMusicCoverBlob({
          coverUrl: src,
          trackId: props.trackId,
          playlistSource: props.playlistSource,
          playlistId: props.playlistId,
          cacheKey: key || null,
        }).then((url) => {
          if (!cancelled) {
            if (url) setBlobUrl(url);
            else setFailed(true);
          }
        });
        return () => {
          cancelled = true;
        };
      },
    ),
  );

  return (
    <Show
      when={blobUrl() && !failed()}
      fallback={
        props.fallback ?? (
          <div class={cn('flex h-full w-full items-center justify-center bg-muted/40', props.class)} />
        )
      }
    >
      <img
        src={blobUrl()!}
        alt={props.alt ?? ''}
        class={props.class}
        loading={props.loading ?? 'lazy'}
        draggable={props.draggable ?? false}
        onError={() => {
          setFailed(true);
          props.onError?.();
        }}
        onLoad={() => props.onLoad?.()}
      />
    </Show>
  );
}
