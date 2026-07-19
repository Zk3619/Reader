/**
 * 播放页 — Artplayer + 进度续播 + 弹幕 + headers
 * 直播：多线路失败自动换线、上下换台
 * 顶栏：与 Hub 其他页一致的 TvHubPageShell / PageToolbar；可隐藏并叠到播放器上
 */

import { Show, createEffect, createSignal, onCleanup } from 'solid-js';
import { PanelTopClose } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import { RefreshIcon } from '@/components/shared/icons';
import { TvHubPageShell } from '@/components/viewer/tv/hub/TvHubPageShell';
import { cn } from '@/lib/utils';
import { getTvDetailState, playCurrentEpisode } from '@/stores/tv-hub/detail';
import {
  getLivePlayState,
  playLiveChannel,
  playNextLiveLine,
  setLiveLineIndex,
  shiftLiveChannel,
} from '@/stores/tv-hub/live';
import { getTvHubState, setTvSection } from '@/stores/tv-hub/section';
import {
  getTvPlayUiState,
  setTvPlayHideHeader,
} from '@/stores/tv-hub/tv-play-ui';
import { createReaderArtplayer } from '@/lib/media/video/artplayer/create-reader-artplayer';
import { attachArtplayerIdleChrome } from '@/lib/media/video/artplayer/attach-idle-chrome';
import {
  attachTvPlayOverlayToolbar,
  type TvPlayOverlayToolbarHandle,
} from '@/lib/media/video/artplayer/attach-tv-play-overlay';
import * as TvDao from '@/lib/media/tv/db/tv-dao';
import * as VodConfig from '@/lib/media/tv/config/vod-config';
import {
  fixLocalProxyUrl,
  isUsableHttpUrl,
  resolveProxyBaseUrl,
} from '@/lib/media/tv/proxy/client';
import { logTvPlayRequest } from '@/lib/media/tv/play/play-debug';
import type Artplayer from 'artplayer';
import type { Danmuku } from 'artplayer-plugin-danmuku';
import { registerTvPlayer } from '@/lib/media/tv/play/player-bridge';
import { detectArtplayerStreamType } from '@/lib/media/video/artplayer/detect-stream-type';
import type { ArtplayerStreamType } from '@/lib/media/video/artplayer/detect-stream-type';

export function TvPlayPane() {
  const detail = getTvDetailState();
  const live = getLivePlayState();
  const hub = getTvHubState();
  const playUi = getTvPlayUiState;
  const [container, setContainer] = createSignal<HTMLDivElement>();
  const [artRef, setArtRef] = createSignal<Artplayer | null>(null);
  const [reloadToken, setReloadToken] = createSignal(0);
  const [refreshing, setRefreshing] = createSignal(false);
  let art: Artplayer | null = null;
  let progressTimer: ReturnType<typeof setInterval> | undefined;
  let lineSwitchTimer: ReturnType<typeof setTimeout> | undefined;
  let playGen = 0;
  let overlay: TvPlayOverlayToolbarHandle | null = null;
  let detachIdle: (() => void) | undefined;

  const isLive = () => !!live.url && !detail.playUrl;
  const hideHeader = () => playUi().hideHeader;
  const playUrl = () => {
    if (isLive()) return live.url;
    return detail.playUrl;
  };
  const title = () => detail.vod?.vod_name || live.name || '播放';
  const description = () => {
    if (detail.playLoading) return '解析中…';
    if (detail.error) return detail.error;
    if (isLive()) {
      const parts = [live.epgText, live.urls.length > 1 ? `线路 ${live.lineIndex + 1}/${live.urls.length}` : '']
        .filter(Boolean);
      return parts.join(' · ') || live.url;
    }
    return playUrl() || '';
  };

  const goBack = () => setTvSection(detail.vod && !isLive() ? 'detail' : 'live');

  const refreshPlayback = () => {
    setRefreshing(true);
    overlay?.setRefreshing(true);
    if (isLive()) {
      playLiveChannel({ lineIndex: live.lineIndex });
      setReloadToken((n) => n + 1);
      setRefreshing(false);
      overlay?.setRefreshing(false);
      return;
    }
    void playCurrentEpisode()
      .then(() => setReloadToken((n) => n + 1))
      .finally(() => {
        setRefreshing(false);
        overlay?.setRefreshing(false);
      });
  };

  createEffect(() => {
    void hub.section;
    void reloadToken();
    const el = container();
    const url = playUrl();
    if (!el || !url) return;

    art?.destroy(false);
    art = null;
    setArtRef(null);
    registerTvPlayer(null);
    detachIdle?.();
    detachIdle = undefined;
    overlay?.detach();
    overlay = null;
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = undefined;
    }
    if (lineSwitchTimer) {
      clearTimeout(lineSwitchTimer);
      lineSwitchTimer = undefined;
    }

    const rawDanmaku = detail.playDanmaku || VodConfig.getDanmaku();
    const headers = { ...detail.playHeaders };
    const liveMode = isLive();
    const gen = ++playGen;

    void (async () => {
      const proxyBase = await resolveProxyBaseUrl();
      if (gen !== playGen) return;
      let danmuku: Danmuku | undefined;
      if (typeof rawDanmaku === 'string' && rawDanmaku.trim()) {
        const fixed = fixLocalProxyUrl(rawDanmaku.trim(), proxyBase);
        if (isUsableHttpUrl(fixed)) danmuku = fixed as Danmuku;
        else console.warn('[tv-play] skip invalid danmaku url', rawDanmaku);
      } else if (Array.isArray(rawDanmaku) && rawDanmaku.length) {
        danmuku = rawDanmaku as Danmuku;
      }

      logTvPlayRequest('create-player', url, headers);
      let streamTypeHint: ArtplayerStreamType | undefined = detectArtplayerStreamType(url);
      if (!streamTypeHint) {
        try {
          const head = await fetch(url, { method: 'HEAD' });
          if (gen !== playGen) return;
          const ct = (head.headers.get('content-type') || '').toLowerCase();
          console.info('[tv-play] probe content-type', {
            status: head.status,
            contentType: ct,
            url,
          });
          if (ct.includes('mpegurl') || ct.includes('m3u8')) streamTypeHint = 'm3u8';
          else if (ct.includes('flv')) streamTypeHint = 'flv';
          else if (ct.includes('dash') || ct.includes('mpd')) streamTypeHint = 'mpd';
        } catch (e) {
          console.warn('[tv-play] probe failed', e);
        }
      }
      if (gen !== playGen) return;

      try {
        art = createReaderArtplayer({
          container: el,
          url,
          autoplay: true,
          headers: Object.keys(headers).length ? headers : undefined,
          streamType: streamTypeHint,
          extras: {
            ...(danmuku ? { danmuku } : {}),
            poster: detail.vod?.vod_pic || '',
          },
        });
        if (gen !== playGen) {
          art.destroy(false);
          art = null;
          return;
        }
        registerTvPlayer(art);
        setArtRef(art);
        detachIdle = attachArtplayerIdleChrome(art);

        art.on('error', () => {
          if (liveMode) {
            if (lineSwitchTimer) return;
            lineSwitchTimer = setTimeout(() => {
              lineSwitchTimer = undefined;
              playNextLiveLine();
            }, 400);
            return;
          }
          logTvPlayRequest('artplayer-error', url, headers);
        });

        const vod = detail.vod;
        const siteKey = hub.siteKey;
        if (vod && siteKey && art && !liveMode) {
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
        if (liveMode) playNextLiveLine();
      }
    })();
  });

  // 沉浸模式：播放器 layers 叠层顶栏（随 controls 显隐）
  createEffect(() => {
    const instance = artRef();
    const immersive = hideHeader();
    overlay?.detach();
    overlay = null;
    if (!instance || !immersive) return;

    overlay = attachTvPlayOverlayToolbar(instance, {
      onBack: goBack,
      onRefresh: refreshPlayback,
      onShowHeader: () => setTvPlayHideHeader(false),
    });
    overlay.update(title(), description());
    overlay.setRefreshing(refreshing());

    onCleanup(() => {
      overlay?.detach();
      overlay = null;
    });
  });

  createEffect(() => {
    const t = title();
    const d = description();
    overlay?.update(t, d);
  });

  onCleanup(() => {
    playGen += 1;
    if (progressTimer) clearInterval(progressTimer);
    if (lineSwitchTimer) clearTimeout(lineSwitchTimer);
    detachIdle?.();
    overlay?.detach();
    overlay = null;
    registerTvPlayer(null);
    art?.destroy(false);
    art = null;
    setArtRef(null);
  });

  const toolbar = () => (
    <div class="flex flex-wrap items-center justify-end gap-1">
      <Show when={isLive()}>
        <Button
          type="button"
          size="sm"
          variant="outline"
          class="h-8 px-2 text-xs"
          onClick={() => shiftLiveChannel(-1)}
        >
          上一台
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          class="h-8 px-2 text-xs"
          onClick={() => shiftLiveChannel(1)}
        >
          下一台
        </Button>
        <Show when={live.urls.length > 1}>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            class="h-8 px-2 text-xs"
            onClick={() => {
              const next = (live.lineIndex + 1) % live.urls.length;
              setLiveLineIndex(next);
              playLiveChannel({ lineIndex: next });
            }}
          >
            切线路 {live.lineIndex + 1}/{live.urls.length}
          </Button>
        </Show>
      </Show>
      <AppTooltip>
        <AppTooltipTrigger
          as={Button}
          type="button"
          variant="ghost"
          size="icon"
          class="h-9 w-9 shrink-0"
          disabled={refreshing() || detail.playLoading}
          onClick={() => refreshPlayback()}
        >
          <RefreshIcon class={cn('h-4 w-4', refreshing() && 'animate-spin')} />
          <span class="sr-only">刷新</span>
        </AppTooltipTrigger>
        <AppTooltipContent>刷新播放</AppTooltipContent>
      </AppTooltip>
      <AppTooltip>
        <AppTooltipTrigger
          as={Button}
          type="button"
          variant="ghost"
          size="icon"
          class="h-9 w-9 shrink-0"
          aria-pressed={hideHeader()}
          onClick={() => setTvPlayHideHeader(true)}
        >
          <PanelTopClose class="h-4 w-4" />
          <span class="sr-only">隐藏顶栏</span>
        </AppTooltipTrigger>
        <AppTooltipContent>隐藏顶栏（叠到播放器）</AppTooltipContent>
      </AppTooltip>
    </div>
  );

  return (
    <TvHubPageShell
      section="play"
      title={title()}
      description={description()}
      hideToolbar={hideHeader()}
      leading={
        <Button type="button" variant="ghost" size="sm" onClick={goBack}>
          返回
        </Button>
      }
      toolbar={toolbar()}
      delegateScroll
      scrollClass="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <Show when={detail.error && !isLive() && !hideHeader()}>
        <p class="bg-background px-4 py-2 text-sm text-muted-foreground">{detail.error}</p>
      </Show>
      <div class="relative min-h-0 flex-1 bg-black">
        <div
          ref={setContainer}
          class="reader-artplayer-stage relative h-full w-full overflow-hidden bg-black"
        />
      </div>
    </TvHubPageShell>
  );
}
