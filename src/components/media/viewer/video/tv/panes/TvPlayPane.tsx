/**
 * 播放页 — Artplayer + 进度续播 + 弹幕 + headers
 * 直播：多线路失败自动换线、上下换台
 * 顶栏：与 Hub 其他页一致的 TvHubPageShell / PageToolbar；可隐藏并叠到播放器上
 */

import { Show, createEffect, createSignal, onCleanup, type Accessor } from 'solid-js';
import { PanelTopClose } from 'lucide-solid';
import { SettingsToolbarLeading } from '@/components/shell/SettingsPageToolbar';
import { TvHubPageShell } from '@/components/media/viewer/video/tv/hub/TvHubPageShell';
import { TvHubToolbarIconButton } from '@/components/media/viewer/video/tv/hub/TvHubToolbarIconButton';
import { cn } from '@/lib/utils';
import { getTvDetailState, getCurrentEpisodeInfo, playCurrentEpisode, playNextEpisode, playPrevEpisode, fallbackOnPlaybackError } from '@/stores/tv-hub/detail';
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
  wrapMediaThroughProxy,
} from '@/lib/media/tv/proxy/client';
import { resolveDanmakuPlayUrl } from '@/lib/media/tv/play/danmaku-url';
import { logTvPlayRequest } from '@/lib/media/tv/play/play-debug';
import type Artplayer from 'artplayer';
import type { Danmuku } from 'artplayer-plugin-danmuku';
import { registerTvPlayer } from '@/lib/media/tv/play/player-bridge';
import { detectArtplayerStreamType } from '@/lib/media/video/artplayer/detect-stream-type';
import type { ArtplayerStreamType } from '@/lib/media/video/artplayer/detect-stream-type';
import { getTvPlayPrefs } from '@/lib/media/tv/play/tv-play-prefs';
import { TvVodPlayControls } from '@/components/media/viewer/video/tv/panes/TvVodPlayControls';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  RefreshIcon,
  ReplaceIcon,
} from '@/components/shared/icons';

export function TvPlayPane(props: {
  /** keep-alive 可见性：离开播放页/影视模块时必须为 false，避免后台重建并 autoplay */
  active: Accessor<boolean>;
}) {
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

  const tearDownPlayer = () => {
    playGen += 1;
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = undefined;
    }
    if (lineSwitchTimer) {
      clearTimeout(lineSwitchTimer);
      lineSwitchTimer = undefined;
    }
    detachIdle?.();
    detachIdle = undefined;
    overlay?.detach();
    overlay = null;
    registerTvPlayer(null);
    art?.destroy(false);
    art = null;
    setArtRef(null);
  };

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
    void reloadToken();
    const visible = props.active();
    const el = container();
    const url = playUrl();

    // 先拆掉旧实例；离开播放页时只拆不建，避免 keep-alive 下后台 autoplay
    tearDownPlayer();
    if (!visible || !el || !url) return;

    const rawDanmaku = detail.playDanmaku || VodConfig.getDanmaku();
    const headers = { ...detail.playHeaders };
    const liveMode = isLive();
    const gen = ++playGen;
    const playPrefs = getTvPlayPrefs();

    void (async () => {
      const proxyBase = await resolveProxyBaseUrl();
      if (gen !== playGen) return;

      let resolvedUrl = url;
      if (liveMode || /^https?:\/\//i.test(url)) {
        resolvedUrl = wrapMediaThroughProxy(url, proxyBase, headers);
      }

      let danmuku: Danmuku | undefined;
      if (playPrefs.danmakuEnabled) {
        const episodeInfo = getCurrentEpisodeInfo();
        const danmakuCtx = {
          vodName: detail.vod?.vod_name || live.name || title(),
          episodeName: episodeInfo.episode?.name || live.name || '',
          playUrl: resolvedUrl,
        };
        if (typeof rawDanmaku === 'string' && rawDanmaku.trim()) {
          const fixed = resolveDanmakuPlayUrl(rawDanmaku.trim(), proxyBase, danmakuCtx);
          if (fixed) danmuku = fixed as Danmuku;
          else console.warn('[tv-play] skip invalid danmaku url', rawDanmaku);
        } else if (Array.isArray(rawDanmaku) && rawDanmaku.length) {
          danmuku = rawDanmaku as Danmuku;
        }
      }

      let subtitleUrl = detail.playSubtitleUrl?.trim() || '';
      if (subtitleUrl) {
        subtitleUrl = fixLocalProxyUrl(subtitleUrl, proxyBase);
        if (!isUsableHttpUrl(subtitleUrl)) subtitleUrl = '';
      }

      logTvPlayRequest('create-player', resolvedUrl, headers);
      let streamTypeHint: ArtplayerStreamType | undefined = detectArtplayerStreamType(resolvedUrl);
      if (!streamTypeHint) {
        try {
          const head = await fetch(resolvedUrl, { method: 'HEAD' });
          if (gen !== playGen) return;
          const ct = (head.headers.get('content-type') || '').toLowerCase();
          console.info('[tv-play] probe content-type', {
            status: head.status,
            contentType: ct,
            url: resolvedUrl,
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
          url: resolvedUrl,
          autoplay: true,
          playbackOwner: 'tv',
          headers: Object.keys(headers).length ? headers : undefined,
          streamType: streamTypeHint,
          extras: {
            ...(danmuku ? { danmuku } : {}),
            ...(subtitleUrl
              ? {
                  subtitleUrl,
                  subtitleType: detail.playSubtitleType || 'vtt',
                }
              : {}),
            poster: detail.vod?.vod_pic || '',
            danmakuOpts: {
              opacity: playPrefs.danmakuOpacity,
              fontSize: playPrefs.danmakuFontSize,
              speed: playPrefs.danmakuSpeed,
            },
            ...(detail.playDrm ? { drm: detail.playDrm } : {}),
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
          if (lineSwitchTimer) return;
          lineSwitchTimer = setTimeout(() => {
            lineSwitchTimer = undefined;
            void fallbackOnPlaybackError();
          }, 600);
        });

        if (!liveMode) {
          art.on('video:ended', () => {
            void playNextEpisode();
          });
        }

        const vod = detail.vod;
        const siteKey = hub.siteKey;
        if (vod && siteKey && art && !liveMode) {
          const histKey = `${siteKey}$${vod.vod_id}`;
          const flag = detail.flags[detail.flagIndex];
          const ep = flag?.episodes[detail.episodeIndex];
          const curFlag = flag?.flag ?? '';
          const curEpisode = ep?.name ?? '';
          // 仅当历史线路/集数与当前一致时续播，避免换集误用上一集进度
          void TvDao.getHistory(histKey).then((h) => {
            if (!h || !art || gen !== playGen) return;
            if (h.flag !== curFlag || h.episode !== curEpisode) return;
            if (h.position <= 5) return;
            const seek = () => {
              try {
                if (gen !== playGen || !art) return;
                if (art.duration > 0 && h.position < art.duration - 3) {
                  art.currentTime = h.position;
                }
              } catch {
                /* */
              }
            };
            art.once('video:canplay', seek);
            setTimeout(seek, 800);
          });

          // 片头跳过（全局秒数；续播位置优先于片头跳过）
          if (playPrefs.openingSkipSec > 0) {
            art.once('video:canplay', () => {
              try {
                if (gen !== playGen || !art) return;
                if (art.currentTime < 2 && art.duration > playPrefs.openingSkipSec + 5) {
                  art.currentTime = playPrefs.openingSkipSec;
                }
              } catch {
                /* */
              }
            });
          }

          progressTimer = setInterval(() => {
            if (!art || !vod || !siteKey) return;
            const f = detail.flags[detail.flagIndex];
            const e = f?.episodes[detail.episodeIndex];
            // 片尾跳过：剩余秒数内自动下一集
            if (
              playPrefs.endingSkipSec > 0 &&
              art.duration > playPrefs.endingSkipSec + 10 &&
              art.currentTime > 0 &&
              art.duration - art.currentTime <= playPrefs.endingSkipSec
            ) {
              void playNextEpisode();
              return;
            }
            void TvDao.upsertHistory({
              key: histKey,
              siteKey,
              vodId: vod.vod_id,
              vodName: vod.vod_name,
              vodPic: vod.vod_pic ?? '',
              flag: f?.flag ?? '',
              episode: e?.name ?? '',
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
    tearDownPlayer();
  });

  createEffect(() => {
    if (!props.active() || isLive()) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowLeft' && e.shiftKey) {
        e.preventDefault();
        void playPrevEpisode();
      } else if (e.key === 'ArrowRight' && e.shiftKey) {
        e.preventDefault();
        void playNextEpisode();
      }
    };
    window.addEventListener('keydown', onKey);
    onCleanup(() => window.removeEventListener('keydown', onKey));
  });

  const toolbar = () => (
    <div class="flex flex-wrap items-center justify-end gap-1">
      <Show when={isLive()}>
        <TvHubToolbarIconButton label="上一台" onClick={() => shiftLiveChannel(-1)}>
          <ChevronUpIcon class="h-4 w-4" />
        </TvHubToolbarIconButton>
        <TvHubToolbarIconButton label="下一台" onClick={() => shiftLiveChannel(1)}>
          <ChevronDownIcon class="h-4 w-4" />
        </TvHubToolbarIconButton>
        <Show when={live.urls.length > 1}>
          <TvHubToolbarIconButton
            label={`切线路 ${live.lineIndex + 1}/${live.urls.length}`}
            onClick={() => {
              const next = (live.lineIndex + 1) % live.urls.length;
              setLiveLineIndex(next);
              playLiveChannel({ lineIndex: next });
            }}
          >
            <ReplaceIcon class="h-4 w-4" />
          </TvHubToolbarIconButton>
        </Show>
      </Show>
      <TvHubToolbarIconButton
        label="刷新播放"
        disabled={refreshing() || detail.playLoading}
        onClick={() => refreshPlayback()}
      >
        <RefreshIcon class={cn('h-4 w-4', refreshing() && 'animate-spin')} />
      </TvHubToolbarIconButton>
      <TvHubToolbarIconButton
        label="隐藏顶栏"
        pressed={hideHeader()}
        onClick={() => setTvPlayHideHeader(true)}
      >
        <PanelTopClose class="h-4 w-4" />
      </TvHubToolbarIconButton>
    </div>
  );

  return (
    <TvHubPageShell
      section="play"
      title={title()}
      description={description()}
      hideToolbar={hideHeader()}
      leading={<SettingsToolbarLeading onBack={goBack} />}
      toolbar={toolbar()}
      delegateScroll
      scrollClass="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <Show when={detail.error && !isLive() && !hideHeader()}>
        <p class="bg-background px-4 py-2 text-sm text-muted-foreground">{detail.error}</p>
      </Show>
      <div class="relative flex min-h-0 flex-1 flex-col bg-black">
        <div
          ref={setContainer}
          class="reader-artplayer-stage relative min-h-0 flex-1 overflow-hidden bg-black"
        />
        <Show when={!isLive() && detail.vod}>
          <TvVodPlayControls art={artRef} />
        </Show>
      </div>
    </TvHubPageShell>
  );
}
