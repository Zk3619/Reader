/**
 * 播放页 — Artplayer + 进度续播 + 弹幕 + headers
 */

import { Show, createEffect, createSignal, onCleanup } from 'solid-js';
import { PageToolbar } from '@/components/shell/PageToolbar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { pageToolbarBottomBorder } from '@/lib/ui/viewport-classes';
import { getTvDetailState } from '@/stores/tv-hub/detail';
import { getLivePlayState } from './TvLivePane';
import { getTvHubState, setTvSection } from '@/stores/tv-hub/section';
import { createReaderArtplayer } from '@/lib/media/video/artplayer/create-reader-artplayer';
import * as TvDao from '@/lib/media/tv/db/tv-dao';
import * as VodConfig from '@/lib/media/tv/config/vod-config';
import {
  fixLocalProxyUrl,
  isUsableHttpUrl,
  resolveProxyBaseUrl,
} from '@/lib/media/tv/proxy/client';
import type Artplayer from 'artplayer';
import type { Danmuku } from 'artplayer-plugin-danmuku';
import { registerTvPlayer } from '@/lib/media/tv/play/player-bridge';

export function TvPlayPane() {
  const detail = getTvDetailState();
  const live = getLivePlayState();
  const hub = getTvHubState();
  const [container, setContainer] = createSignal<HTMLDivElement>();
  let art: Artplayer | null = null;
  let progressTimer: ReturnType<typeof setInterval> | undefined;

  const playUrl = () => {
    if (live.url && !detail.playUrl) return live.url;
    return detail.playUrl;
  };
  const title = () => detail.vod?.vod_name || live.name || '播放';

  createEffect(() => {
    void hub.section;
    const el = container();
    const url = playUrl();
    if (!el || !url) return;

    art?.destroy(false);
    art = null;
    registerTvPlayer(null);
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = undefined;
    }

    const rawDanmaku = detail.playDanmaku || VodConfig.getDanmaku();
    const headers = { ...detail.playHeaders };

    void (async () => {
      const proxyBase = await resolveProxyBaseUrl();
      let danmuku: Danmuku | undefined;
      if (typeof rawDanmaku === 'string' && rawDanmaku.trim()) {
        const fixed = fixLocalProxyUrl(rawDanmaku.trim(), proxyBase);
        if (isUsableHttpUrl(fixed)) danmuku = fixed as Danmuku;
        else console.warn('[tv-play] skip invalid danmaku url', rawDanmaku);
      } else if (Array.isArray(rawDanmaku) && rawDanmaku.length) {
        danmuku = rawDanmaku as Danmuku;
      }

      try {
        art = createReaderArtplayer({
          container: el,
          url,
          autoplay: true,
          headers: Object.keys(headers).length ? headers : undefined,
          extras: {
            ...(danmuku ? { danmuku } : {}),
            poster: detail.vod?.vod_pic || '',
          },
        });
        registerTvPlayer(art);

        const vod = detail.vod;
        const siteKey = hub.siteKey;
        if (vod && siteKey && art) {
          const histKey = `${siteKey}$${vod.vod_id}`;
          void TvDao.getHistory(histKey).then((h) => {
            if (h && h.position > 5 && art) {
              const seek = () => {
                try {
                  if (art && art.duration > 0 && h.position < art.duration - 3) {
                    art.currentTime = h.position;
                  }
                } catch {
                  /* */
                }
              };
              art?.once('video:canplay', seek);
              setTimeout(seek, 800);
            }
          });

          progressTimer = setInterval(() => {
            if (!art || !vod || !siteKey) return;
            const flag = detail.flags[detail.flagIndex];
            const ep = flag?.episodes[detail.episodeIndex];
            void TvDao.upsertHistory({
              key: histKey,
              siteKey,
              vodId: vod.vod_id,
              vodName: vod.vod_name,
              vodPic: vod.vod_pic ?? '',
              flag: flag?.flag ?? '',
              episode: ep?.name ?? '',
              position: art.currentTime || 0,
              duration: art.duration || 0,
              updatedAt: Date.now(),
              cid: 0,
            });
            void import('@tauri-apps/api/core').then(({ invoke }) =>
              invoke('tv_media_report', {
                json: JSON.stringify({
                  playing: !!art?.playing,
                  currentTime: art?.currentTime || 0,
                  duration: art?.duration || 0,
                  url: art?.url || '',
                }),
              }).catch(() => undefined),
            );
          }, 5000);
        }
      } catch (e) {
        console.error('[tv-play]', e);
      }
    })();
  });

  onCleanup(() => {
    if (progressTimer) clearInterval(progressTimer);
    registerTvPlayer(null);
    art?.destroy(false);
    art = null;
  });

  return (
    <section class="flex min-h-0 flex-1 flex-col bg-black">
      <PageToolbar
        class={cn(pageToolbarBottomBorder, 'bg-background')}
        title={title()}
        description={
          detail.playLoading
            ? '解析中…'
            : detail.error
              ? detail.error
              : playUrl() || ''
        }
        leading={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setTvSection(detail.vod ? 'detail' : 'live')}
          >
            返回
          </Button>
        }
      />
      <Show when={detail.error}>
        <p class="bg-background px-4 py-2 text-sm text-destructive">{detail.error}</p>
      </Show>
      <div class="relative min-h-0 flex-1">
        <div
          ref={setContainer}
          class="reader-artplayer-stage relative h-full w-full overflow-hidden bg-black"
        />
      </div>
    </section>
  );
}
