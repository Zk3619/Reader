/**
 * 播放页 — Artplayer + 进度续播 + 弹幕 + headers
 * 直播：多线路失败自动换线、上下换台
 * 顶栏：默认 PageToolbar；可选沉浸模式（隐藏主壳顶栏，改用 Artplayer layers 叠层）
 */

import { Show, createEffect, createSignal, onCleanup, untrack, type Accessor } from 'solid-js';
import { SettingsToolbarLeading } from '@/components/shell/SettingsPageToolbar';
import { TvHubPageShell } from '@/components/media/viewer/video/tv/hub/TvHubPageShell';
import { TvHubToolbarIconButton } from '@/components/media/viewer/video/tv/hub/TvHubToolbarIconButton';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuIconTrigger,
  AppDropdownMenuItem,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import { cn } from '@/lib/utils';
import {
  getTvDetailState,
  getCurrentEpisodeInfo,
  hasNextEpisode,
  hasPrevEpisode,
  playCurrentEpisode,
  playNextEpisode,
  playPrevEpisode,
  fallbackOnPlaybackError,
  isCurrentVodKept,
  toggleKeepCurrent,
  selectPlayQuality,
  selectPlaySubtitle,
} from '@/stores/tv-hub/detail';
import {
  getLivePlayState,
  playLiveChannel,
  playNextLiveLine,
  setLiveLineIndex,
  shiftLiveChannel,
} from '@/stores/tv-hub/live';
import { getTvHubState, setTvSection, openTvDetail, getTvPlayReturnSection } from '@/stores/tv-hub/section';
import {
  getTvPlayUiState,
  isTvMiniPlayerEnabled,
  setTvPlayHideHeader,
  setTvPlayAggregated,
  setTvAutoSwitchFlagOnError,
} from '@/stores/tv-hub/tv-play-ui';
import { createReaderArtplayer } from '@/lib/media/video/artplayer/create-reader-artplayer';
import { getArtplayerPlaySettings, shouldAutoAdvanceOnEnded } from '@/lib/media/video/artplayer/play-settings-prefs';
import { attachArtplayerIdleChrome } from '@/lib/media/video/artplayer/attach-idle-chrome';
import { attachEpisodeNavControls } from '@/lib/media/video/artplayer/attach-episode-nav-controls';
import { attachQualitySubtitleControls } from '@/lib/media/video/artplayer/attach-quality-subtitle-controls';
import {
  attachTvPlayOverlayToolbar,
  type TvPlayOverlayToolbarHandle,
} from '@/lib/media/video/artplayer/attach-tv-play-overlay';
import * as TvDao from '@/lib/media/tv/db/tv-dao';
import * as VodConfig from '@/lib/media/tv/config/vod-config';
import { BANGUMI_SITE_KEY } from '@/lib/media/tv/types';
import {
  decodeBangumiFlag,
  resolveBangumiPlayHistoryWrite,
  upsertBangumiPlayHistory,
} from '@/lib/media/video/bangumi/dao-bridge';
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
import {
  adoptTvRuntimeArt,
  attachTvPlayerStage,
  buildTvPlaySourceKey,
  destroyTvPlayerSession,
  getTvPlayerStageEl,
  getTvRuntimeArt,
  getTvRuntimeSourceKey,
  hasTvPlayerSession,
  setTvPlayerMiniChrome,
  setTvPlayerAggregatedChrome,
  TV_PLAY_LOADING_SOURCE_KEY,
} from '@/lib/media/tv/play/tv-player-runtime';
import { detectArtplayerStreamType } from '@/lib/media/video/artplayer/detect-stream-type';
import type { ArtplayerStreamType } from '@/lib/media/video/artplayer/detect-stream-type';
import { getDanmakuPrefs, danmakuPrefsToArtplayerOpts } from '@/lib/media/video/danmaku/danmaku-prefs';
import { tryMatchDanmaku, parseBangumiSubjectIdFromVodId } from '@/lib/media/video/danmaku/match';
import { trySearchWyzieSubtitle } from '@/lib/media/video/subtitle/wyzie-match';
import { TvVodPlayControls } from '@/components/media/viewer/video/tv/panes/TvVodPlayControls';
import {
  TvPlayPlayerPanels,
  type TvPlayPlayerPanelKind,
} from '@/components/media/viewer/video/tv/panes/TvPlayPlayerPanels';
import { LocalSeekThumbOverlay } from '@/components/media/viewer/video/tv/panes/LocalSeekThumbOverlay';
import { tvMiniPlayerStore } from '@/stores/tv-mini-player';
import { PageToolbarTitleText } from '@/components/shell/PageToolbar';
import { isArtplayerOnlyProfile } from '@/lib/media/video/playback/video-profile';
import { getTvVodToolHandlers } from '@/lib/media/tv/play/tv-vod-tool-handlers';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  MoreIcon,
  RefreshIcon,
  ReplaceIcon,
  StarIcon,
} from '@/components/shared/icons';

export function TvPlayPane(props: {
  /** keep-alive 可见性：离开播放页时 false；有会话则迁入迷你窗而非销毁 */
  active: Accessor<boolean>;
}) {
  const detail = getTvDetailState();
  const live = getLivePlayState();
  const hub = getTvHubState();
  const playUi = () => getTvPlayUiState();
  /** 全屏播放槽：runtime 舞台 reparent 到此 */
  const [playSlot, setPlaySlot] = createSignal<HTMLDivElement>();
  const [artRef, setArtRef] = createSignal<Artplayer | null>(null);
  const [reloadToken, setReloadToken] = createSignal(0);
  const [refreshing, setRefreshing] = createSignal(false);
  /** 叠层已挂上且 layers.show=true，才允许藏主壳顶栏 */
  const [overlayReady, setOverlayReady] = createSignal(false);
  const [kept, setKept] = createSignal(false);
  const [playerPanel, setPlayerPanel] = createSignal<TvPlayPlayerPanelKind>(null);
  /** 在线点播边播边缓存后，可用于 SpriteStore 的 seek 源（proxy 直链或本地缓存路径） */
  const [seekThumbSource, setSeekThumbSource] = createSignal('');
  const [seekThumbKey, setSeekThumbKey] = createSignal('');
  let art: Artplayer | null = null;
  let progressTimer: ReturnType<typeof setInterval> | undefined;
  let lineSwitchTimer: ReturnType<typeof setTimeout> | undefined;
  let playGen = 0;
  let overlay: TvPlayOverlayToolbarHandle | null = null;
  let detachIdle: (() => void) | undefined;
  let detachEpisodeNav: (() => void) | undefined;
  let detachQualitySub: (() => void) | undefined;
  let progressiveCache: { abort: () => void } | null = null;
  let abortSeekSeed: (() => void) | null = null;
  /** 正在异步建播的源指纹；离开播放页时若匹配则不打断 */
  let buildingKey = '';

  const isLive = () => !!live.url && !detail.playUrl;
  /** 本地库直达 Artplayer：布局对齐直播（仅页头+播放器，无点播底栏） */
  const isLocalDirect = () => detail.vod?.siteKey === 'local' && !!detail.playUrl;
  const isBangumi = () => detail.vod?.siteKey === BANGUMI_SITE_KEY;
  const isSimpleChrome = () => isLive() || isLocalDirect();
  const hideHeader = () => playUi().hideHeader || playUi().aggregatedPlay;
  const aggregatedPlay = () => playUi().aggregatedPlay;
  /** 沉浸叠层可接管时才藏主壳；加载中 / 无播放器时保留 PageToolbar */
  const hideShellToolbar = () => hideHeader() && props.active() && overlayReady();
  const playUrl = () => {
    if (isLive()) return live.url;
    return detail.playUrl;
  };
  const title = () => {
    const name = detail.vod?.vod_name || live.name || '播放';
    if (isLive() || isLocalDirect()) return name;
    const ep = getCurrentEpisodeInfo().episode?.name?.trim();
    return ep ? `${name} - ${ep}` : name;
  };
  const description = () => {
    if (detail.playLoading) return '正在获取播放链接…';
    if (detail.error) return detail.error;
    if (isLocalDirect()) return '';
    if (isLive()) {
      const parts = [live.epgText, live.urls.length > 1 ? `线路 ${live.lineIndex + 1}/${live.urls.length}` : '']
        .filter(Boolean);
      return parts.join(' · ') || live.url;
    }
    return playUrl() || '';
  };

  const canKeep = () => !isLive() && !isLocalDirect() && !isBangumi() && !!detail.vod;

  const refreshKeepState = () => {
    if (!canKeep()) {
      setKept(false);
      return;
    }
    void isCurrentVodKept().then(setKept);
  };

  createEffect(() => {
    void detail.vod?.vod_id;
    void hub.siteKey;
    void props.active();
    refreshKeepState();
  });

  const goBack = () => {
    if (isLive()) {
      setTvSection('live');
      return;
    }
    const ret = getTvPlayReturnSection();
    if (ret === 'detail') {
      const siteKey = (hub.siteKey || detail.vod?.siteKey || '').trim();
      const vodId = (hub.vodId || detail.vod?.vod_id || '').trim();
      if (siteKey && vodId) {
        openTvDetail(siteKey, vodId);
        return;
      }
    }
    setTvSection(ret);
  };

  /** 顶栏标题/描述：点播进详情、番剧进番剧详情；本地/直播无对应详情 */
  const canOpenPlayDetail = () => !isLocalDirect() && !isLive();
  const openPlayDetail = () => {
    if (isLive() || isLocalDirect()) return;
    if (isBangumi()) {
      const id = parseBangumiSubjectIdFromVodId(detail.vod?.vod_id || '');
      if (!id) return;
      void (async () => {
        const { openBangumiById } = await import('@/stores/tv-hub/bangumi-ui');
        setTvSection('bangumi');
        await openBangumiById(id, { from: 'play' });
      })();
      return;
    }
    const siteKey = (hub.siteKey || detail.vod?.siteKey || '').trim();
    const vodId = (hub.vodId || detail.vod?.vod_id || '').trim();
    if (!siteKey || !vodId) return;
    // 详情数据已在播放会话中，直接切分区即可
    openTvDetail(siteKey, vodId);
  };

  const detachFullChrome = () => {
    detachIdle?.();
    detachIdle = undefined;
    detachEpisodeNav?.();
    detachEpisodeNav = undefined;
    detachQualitySub?.();
    detachQualitySub = undefined;
  };

  /** 销毁会话（关闭迷你窗 / 无 url / 强制刷新重建前） */
  const tearDownPlayer = (opts?: {
    cancelAsync?: boolean;
    /** 默认 true；换源重建时传 false，避免 artRef 短暂变 null 导致顶栏闪烁 */
    clearArtRef?: boolean;
  }) => {
    if (opts?.cancelAsync !== false) playGen += 1;
    progressiveCache?.abort();
    progressiveCache = null;
    abortSeekSeed?.();
    abortSeekSeed = null;
    setSeekThumbSource('');
    setSeekThumbKey('');
    void import('@/lib/media/video/playback/local-thumb')
      .then(({ abortAllSeekThumbSeeds }) => abortAllSeekThumbSeeds())
      .catch(() => undefined);
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = undefined;
    }
    if (lineSwitchTimer) {
      clearTimeout(lineSwitchTimer);
      lineSwitchTimer = undefined;
    }
    detachFullChrome();
    destroyTvPlayerSession();
    art = null;
    if (opts?.clearArtRef !== false) {
      setArtRef(null);
    }
    buildingKey = '';
  };

  const attachFullChrome = (instance: Artplayer, liveMode: boolean) => {
    detachFullChrome();
    setTvPlayerMiniChrome(false);
    const idle = attachArtplayerIdleChrome(instance);
    detachIdle = () => idle.detach();
    if (!liveMode && (hasPrevEpisode() || hasNextEpisode())) {
      detachEpisodeNav = attachEpisodeNavControls(instance, {
        hasPrev: hasPrevEpisode(),
        hasNext: hasNextEpisode(),
        onPrev: () => void playPrevEpisode(),
        onNext: () => void playNextEpisode(),
      });
    }
    if (!liveMode) {
      detachQualitySub = attachQualitySubtitleControls(instance, {
        getQualities: () => detail.playQualities ?? [],
        getQualityIndex: () => detail.playQualityIndex ?? 0,
        onSelectQuality: async (index) => {
          const url = selectPlayQuality(index);
          if (!url) return;
          try {
            const t = instance.currentTime || 0;
            await (instance.switchUrl as (u: string, time?: number) => Promise<void>)(
              url,
              t,
            );
          } catch (e) {
            console.warn('[tv-play] switch quality failed', e);
          }
        },
        getSubtitles: () => detail.playSubtitles ?? [],
        getActiveSubtitleUrl: () => detail.playSubtitleUrl ?? '',
        onSelectSubtitle: async (url) => {
          selectPlaySubtitle(url);
          try {
            if (!url) {
              try {
                instance.subtitle.show = false;
              } catch {
                /* */
              }
              return;
            }
            const { detectSubType } = await import(
              '@/lib/media/video/artplayer/attach-quality-subtitle-controls'
            );
            const { subtitleStyleToCss } = await import(
              '@/lib/media/video/artplayer/subtitle-style-prefs'
            );
            try {
              instance.subtitle.show = true;
            } catch {
              /* */
            }
            await instance.subtitle.switch(url, {
              type: detectSubType(url),
              style: subtitleStyleToCss(),
            });
          } catch (e) {
            console.warn('[tv-play] switch subtitle failed', e);
          }
        },
      });
    }
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
    if (isLocalDirect()) {
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

  /**
   * 全屏播放可见性 → 迷你窗（与建播 effect 分离，避免侧栏/切壳时漏进窗或误 tearDown）。
   * props.active = 影视壳可见 ∧ section===play；返回键与侧栏/底栏切页都会翻此值。
   */
  createEffect(() => {
    // 直接订阅 hub section，避免仅依赖多层 Accessor 时漏追踪
    void hub.section;
    const fullScreen = props.active();
    // 订阅开关，关小窗时立刻停用
    void getTvPlayUiState().miniPlayerEnabled;
    const miniOn = isTvMiniPlayerEnabled();

    if (fullScreen) {
      // 重新进入全屏播放：允许下次离开时再进小窗，并清掉迷你窗 chrome
      tvMiniPlayerStore.clearDismissed();
      tvMiniPlayerStore.exitMiniToFull();
      setTvPlayerMiniChrome(false);
      return;
    }

    // 已离开全屏播放页（返回 / 侧栏 / 底栏切壳）
    if (!miniOn) {
      if (hasTvPlayerSession() || buildingKey) {
        tearDownPlayer();
      }
      tvMiniPlayerStore.exitMiniToFull();
      return;
    }

    // 用户已关小窗：切页时不要再次挂上
    if (tvMiniPlayerStore.isDismissed()) {
      if (hasTvPlayerSession() || buildingKey) {
        tearDownPlayer();
      }
      return;
    }

    if (hasTvPlayerSession() || buildingKey) {
      detachFullChrome();
      if (hasTvPlayerSession()) {
        tvMiniPlayerStore.enterMini();
      }
      // buildingKey：等异步建播完成后再 enterMini
    }
  });

  createEffect(() => {
    void reloadToken();
    const visible = props.active();
    const slot = playSlot();
    const url = playUrl();
    // 追踪直播 headers，换线时即便 URL 形态相近也重建
    const liveMode = isLive();
    const headers = liveMode
      ? { ...live.headers }
      : { ...detail.playHeaders };
    const token = reloadToken();
    const nextKey = url ? buildTvPlaySourceKey(url, headers, token) : '';

    // 无播放地址：解析中则挂 loading 播放器壳（便于沉浸叠层立刻显示）；否则拆会话
    if (!url) {
      if (visible && detail.playLoading) {
        tvMiniPlayerStore.exitMiniToFull();
        if (!slot) return;
        attachTvPlayerStage(slot);
        setTvPlayerMiniChrome(false);
        const existing = getTvRuntimeArt();
        if (existing && getTvRuntimeSourceKey() === TV_PLAY_LOADING_SOURCE_KEY) {
          art = existing;
          setArtRef(existing);
          try {
            existing.loading.show = true;
          } catch {
            /* */
          }
          return;
        }
        // 取消旧异步建播，挂占位实例
        tearDownPlayer({ cancelAsync: true });
        attachTvPlayerStage(slot);
        buildingKey = TV_PLAY_LOADING_SOURCE_KEY;
        const gen = ++playGen;
        const stage = getTvPlayerStageEl();
        try {
          const instance = createReaderArtplayer({
            container: stage,
            url: '',
            autoplay: false,
            extras: {
              poster: detail.vod?.vod_pic || '',
              // 无媒体时仍挂弹幕插件空数组会偏重；loading 壳不加弹幕
            },
          });
          if (gen !== playGen) {
            try {
              instance.destroy(false);
            } catch {
              /* */
            }
            return;
          }
          try {
            instance.loading.show = true;
          } catch {
            /* */
          }
          adoptTvRuntimeArt(instance, TV_PLAY_LOADING_SOURCE_KEY);
          art = instance;
          setArtRef(instance);
          buildingKey = '';
        } catch (e) {
          console.error('[tv-play] loading shell', e);
          buildingKey = '';
        }
        return;
      }
      tvMiniPlayerStore.exitMiniToFull();
      tearDownPlayer();
      return;
    }

    // 离开全屏：保活同源会话（迷你窗由上方 visibility effect 进入）；切勿 fallthrough tearDown
    if (!visible) {
      detachFullChrome();
      // 用户已关小窗：禁止因 playUrl 仍在而重建并再次 enterMini
      if (tvMiniPlayerStore.isDismissed()) {
        if (getTvRuntimeArt() || buildingKey) {
          tearDownPlayer();
        }
        return;
      }
      const existingMini = getTvRuntimeArt();
      if (existingMini && getTvRuntimeSourceKey() === nextKey) {
        art = existingMini;
        setArtRef(existingMini);
        return;
      }
      // 建播中离开且源未变：等异步完成后再进迷你窗
      if (!existingMini && buildingKey === nextKey) {
        return;
      }
      // 迷你态换源：继续往下重建，结束后 enterMini
    } else {
      // 回到全屏播放页（清除「已关闭」标记，允许下次再进小窗）
      tvMiniPlayerStore.clearDismissed();
      tvMiniPlayerStore.exitMiniToFull();
      if (slot) attachTvPlayerStage(slot);

      // 同源且已有实例：只 reparent + 恢复全屏 chrome，不重建
      const existing = getTvRuntimeArt();
      if (existing && getTvRuntimeSourceKey() === nextKey) {
        art = existing;
        setArtRef(existing);
        attachFullChrome(existing, liveMode);
        return;
      }
    }

    // 源变化或尚无实例：取消旧异步并重建（保留 artRef 至新实例就绪，避免沉浸顶栏闪烁）
    if (visible && !slot) return;
    tearDownPlayer({ clearArtRef: false });
    const stage = getTvPlayerStageEl();
    if (visible && slot) attachTvPlayerStage(slot);
    buildingKey = nextKey;

    const rawDanmaku = detail.playDanmaku || VodConfig.getDanmaku();
    const gen = ++playGen;
    void (async () => {
      // 番剧 prefs 可能尚未 hydrate；默认开弹幕 / 发送开关都依赖库内值
      try {
        const { ensureBangumiSqliteMigrated } = await import(
          '@/lib/media/video/bangumi/db/migrate-ls'
        );
        await ensureBangumiSqliteMigrated();
      } catch (e) {
        console.warn('[tv-play] bangumi prefs hydrate failed', e);
      }
      if (gen !== playGen) return;

      const playPrefs = getDanmakuPrefs();
      const artDanmakuOpts = danmakuPrefsToArtplayerOpts(playPrefs);
      const { shouldShowDanmakuEmitter } = await import(
        '@/lib/media/video/danmaku/send'
      );
      const enableDanmakuEmitter = shouldShowDanmakuEmitter();
      const proxyBase = await resolveProxyBaseUrl();
      if (gen !== playGen) return;

      // 本地直达：每次创建播放器前再放行一次 asset 作用域
      const localPath = detail.playLocalPath?.trim();
      if (localPath) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('video_allow_local_media_asset', { path: localPath });
        } catch (e) {
          console.warn('[tv-play] allow local asset failed', e);
        }
      }
      if (gen !== playGen) return;

      let resolvedUrl = url;
      if (liveMode || /^https?:\/\//i.test(url)) {
        // asset.localhost 勿走电视代理
        if (!/asset\.localhost/i.test(url)) {
          resolvedUrl = wrapMediaThroughProxy(url, proxyBase, headers);
        }
      }

      let danmuku: Danmuku | undefined;
      let configDanmakuUrl = '';
      let deferredDanmakuMatch:
        | {
            input: Parameters<typeof tryMatchDanmaku>[0];
            /** 有缓存时不发「正在获取」提示 */
            skipFetchingTip: boolean;
            fallbackUrl?: string;
          }
        | undefined;
      if (playPrefs.danmakuEnabled) {
        const episodeInfo = getCurrentEpisodeInfo();
        const danmakuCtx = {
          vodName: detail.vod?.vod_name || live.name || title(),
          episodeName: episodeInfo.episode?.name || live.name || '',
          playUrl: resolvedUrl,
        };
        // 站点 CONFIG 弹幕 URL：仅作匹配失败后的兜底，不能挡住内置自动匹配
        if (typeof rawDanmaku === 'string' && rawDanmaku.trim()) {
          const fixed = resolveDanmakuPlayUrl(rawDanmaku.trim(), proxyBase, danmakuCtx);
          if (fixed) configDanmakuUrl = fixed;
          else console.warn('[tv-play] skip unusable danmaku url', rawDanmaku);
        } else if (Array.isArray(rawDanmaku) && rawDanmaku.length) {
          danmuku = rawDanmaku as Danmuku;
        }
        // 无内联弹幕数组时：起播后再自动匹配（站点 URL 不跳过）
        if (!danmuku && !liveMode) {
          const matchInput = {
            fileNameHint:
              [danmakuCtx.vodName, danmakuCtx.episodeName].filter(Boolean).join(' ') ||
              title(),
            animeTitle: danmakuCtx.vodName,
            episodeName: danmakuCtx.episodeName,
            episodeIndex: detail.episodeIndex,
            bgmSubjectId: parseBangumiSubjectIdFromVodId(detail.vod?.vod_id),
            playUrl: url,
            vodId: detail.vod?.vod_id,
            siteKey: getTvHubState().siteKey,
          };
          const { peekDanmakuCacheExists } = await import(
            '@/lib/media/video/danmaku/match'
          );
          const hasCache = await peekDanmakuCacheExists(matchInput);
          if (gen !== playGen) return;
          deferredDanmakuMatch = {
            input: matchInput,
            skipFetchingTip: hasCache,
            fallbackUrl: configDanmakuUrl || undefined,
          };
        }
      }

      let subtitleUrl = detail.playSubtitleUrl?.trim() || '';
      if (subtitleUrl) {
        subtitleUrl = fixLocalProxyUrl(subtitleUrl, proxyBase);
        if (!isUsableHttpUrl(subtitleUrl)) subtitleUrl = '';
      }
      // E3：无字幕时尝试 wyzie（有 key 才搜）
      if (!subtitleUrl && !liveMode && detail.vod?.vod_name) {
        const hit = await trySearchWyzieSubtitle(
          [detail.vod.vod_name, getCurrentEpisodeInfo().episode?.name]
            .filter(Boolean)
            .join(' '),
        );
        if (gen !== playGen) return;
        if (hit?.url) {
          subtitleUrl = hit.url;
          console.info('[tv-play] wyzie subtitle', hit.name);
        }
      }

      logTvPlayRequest('create-player', resolvedUrl, headers);
      let streamTypeHint: ArtplayerStreamType | undefined = detectArtplayerStreamType(resolvedUrl);
      // 直播常见无扩展名的 HLS/TS 直链：缺探测时按 m3u8 尝试
      if (liveMode && !streamTypeHint) {
        const lower = resolvedUrl.toLowerCase();
        if (lower.includes('m3u8') || lower.includes('mpegurl') || /\.ts(\?|$)/i.test(lower)) {
          streamTypeHint = 'm3u8';
        }
      }
      if (!streamTypeHint) {
        const skipProbe =
          /^blob:/i.test(resolvedUrl) ||
          /^asset:/i.test(resolvedUrl) ||
          /asset\.localhost/i.test(resolvedUrl) ||
          isLocalDirect();
        if (!skipProbe) {
          try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), liveMode ? 4000 : 8000);
            const head = await fetch(resolvedUrl, { method: 'HEAD', signal: ctrl.signal });
            clearTimeout(timer);
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
            else if (liveMode && (ct.includes('octet-stream') || ct.includes('video/'))) {
              streamTypeHint = 'm3u8';
            }
          } catch (e) {
            console.warn('[tv-play] probe failed', e);
            if (liveMode) streamTypeHint = 'm3u8';
          }
        }
      }
      if (gen !== playGen) return;

      try {
        art = createReaderArtplayer({
          container: stage,
          url: resolvedUrl,
          // 直播强制开播；点播尊重全局「自动开播」
          autoplay: liveMode ? true : getArtplayerPlaySettings().autoplay,
          playbackRate: getArtplayerPlaySettings().playbackRate,
          playbackOwner: 'tv',
          headers: Object.keys(headers).length ? headers : undefined,
          streamType: streamTypeHint,
          isLive: liveMode,
          extras: {
            // 开启弹幕时始终挂插件（可空数组），便于延迟匹配与提示弹幕
            ...(playPrefs.danmakuEnabled ? { danmuku: danmuku ?? [] } : {}),
            ...(subtitleUrl
              ? {
                  subtitleUrl,
                  subtitleType: detail.playSubtitleType || 'vtt',
                }
              : {}),
            poster: detail.vod?.vod_pic || '',
            danmakuOpts: {
              opacity: artDanmakuOpts.opacity,
              fontSize: artDanmakuOpts.fontSize,
              speed: artDanmakuOpts.speed,
              antiOverlap: artDanmakuOpts.antiOverlap,
              margin: artDanmakuOpts.margin,
              modes: artDanmakuOpts.modes,
              emitter: enableDanmakuEmitter,
            },
            ...(detail.playDrm ? { drm: detail.playDrm } : {}),
          },
        });
        if (enableDanmakuEmitter) {
          stage.classList.add('reader-art-danmaku-send');
        } else {
          stage.classList.remove('reader-art-danmaku-send');
        }
        try {
          const { setArtDanmukuEmitter } = await import(
            '@/lib/media/video/danmaku/art-danmuku'
          );
          setArtDanmukuEmitter(art, enableDanmakuEmitter);
        } catch {
          /* */
        }
        if (gen !== playGen) {
          art.destroy(false);
          art = null;
          setArtRef(null);
          return;
        }
        buildingKey = '';
        adoptTvRuntimeArt(art, nextKey);
        setArtRef(art);

        // 建播完成时已离开播放页 → 进迷你窗；否则挂全屏 chrome
        if (!props.active()) {
          if (
            isTvMiniPlayerEnabled() &&
            !tvMiniPlayerStore.isDismissed()
          ) {
            tvMiniPlayerStore.enterMini();
          } else {
            tearDownPlayer({ cancelAsync: false });
            return;
          }
        } else {
          const playEl = playSlot();
          if (playEl) attachTvPlayerStage(playEl);
          attachFullChrome(art, liveMode);
        }

        // 起播后自动匹配：先提示，再 load；失败可回落站点弹幕 URL
        if (deferredDanmakuMatch && gen === playGen) {
          const artForDanmu = art;
          const deferred = deferredDanmakuMatch;
          void (async () => {
            const {
              emitDanmakuStatusTip,
            } = await import('@/lib/media/video/danmaku/status-tip');
            const {
              replaceArtDanmaku,
              waitArtReady,
            } = await import('@/lib/media/video/danmaku/art-danmuku');
            await waitArtReady(artForDanmu);
            if (gen !== playGen) return;
            if (!deferred.skipFetchingTip) {
              emitDanmakuStatusTip('fetching', artForDanmu);
            }
            try {
              const matched = await tryMatchDanmaku(deferred.input);
              if (gen !== playGen) return;
              if (matched?.danmu.length) {
                const loaded = await replaceArtDanmaku(artForDanmu, matched.danmu);
                if (loaded === 'loaded') {
                  console.info(
                    '[tv-play] matched danmaku',
                    matched.source,
                    matched.label,
                  );
                  return;
                }
              }
              if (deferred.fallbackUrl) {
                const fb = await replaceArtDanmaku(
                  artForDanmu,
                  deferred.fallbackUrl,
                );
                if (fb === 'loaded') {
                  console.info('[tv-play] fallback config danmaku url');
                  return;
                }
              }
              if (!deferred.skipFetchingTip || !matched?.danmu.length) {
                emitDanmakuStatusTip('error', artForDanmu);
              }
            } catch (e) {
              console.warn('[tv-play] deferred danmaku match failed', e);
              if (gen !== playGen) return;
              if (deferred.fallbackUrl) {
                const fb = await replaceArtDanmaku(
                  artForDanmu,
                  deferred.fallbackUrl,
                );
                if (fb === 'loaded') return;
              }
              emitDanmakuStatusTip('error', artForDanmu);
            }
          })();
        }
        // 直链 proxy：立刻挂 seek 缩略图源（不依赖边播边缓存是否启动成功）
        if (!liveMode && !isLocalDirect()) {
          void import('@/lib/media/video/playback/local-thumb').then(
            ({ isProxySeekThumbSource, warmupSeekThumbSource }) => {
              if (gen !== playGen) return;
              if (isProxySeekThumbSource(resolvedUrl)) {
                setSeekThumbKey(url);
                setSeekThumbSource(resolvedUrl);
                warmupSeekThumbSource(resolvedUrl);
              }
            },
          );
        }
        // 在线点播：起播后后台边播边缓存（不阻塞、不替换播放 URL）
        if (!liveMode && !isLocalDirect() && /^https?:\/\//i.test(url)) {
          void (async () => {
            try {
              const { startVideoProgressiveCache } = await import(
                '@/lib/media/video/cache/video-progressive-cache'
              );
              const epInfo = getCurrentEpisodeInfo();
              const handle = startVideoProgressiveCache({
                title: detail.vod?.vod_name || title(),
                episodeUrl: epInfo.episode?.url || url,
                mediaUrl: url,
                fetchUrl: resolvedUrl,
                headers: Object.keys(headers).length ? headers : undefined,
                bgmId: parseBangumiSubjectIdFromVodId(detail.vod?.vod_id) ?? undefined,
                tier: 'auto',
                isLive: liveMode,
              });
              if (gen !== playGen) {
                handle?.abort();
                return;
              }
              if (handle) {
                progressiveCache = handle;
                void handle.whenComplete.then(async (localPath) => {
                  if (gen !== playGen || !localPath) return;
                  // 完成后切到本地 do=file Range（更快 seek）；并后台灌 SpriteStore
                  if (!/\.m3u8$/i.test(localPath)) {
                    setSeekThumbKey(url);
                    setSeekThumbSource(localPath);
                    try {
                      const { warmupSeekThumbSource, seedSeekThumbsFromLocalFile } =
                        await import('@/lib/media/video/playback/local-thumb');
                      if (gen !== playGen) return;
                      warmupSeekThumbSource(localPath);
                      abortSeekSeed?.();
                      abortSeekSeed = seedSeekThumbsFromLocalFile({
                        localPath,
                        spriteKey: url,
                        durationSec: Number(art?.duration) || undefined,
                      });
                    } catch {
                      /* */
                    }
                  }
                });
              }
            } catch (e) {
              console.warn('[tv-play] progressive cache start failed', e);
            }
          })();
        }
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
            void (async () => {
              try {
                const { getVideoPlaybackPrefs } = await import(
                  '@/lib/media/video/playback/prefs'
                );
                const { isAndroid } = await import('@/lib/platform/detect');
                const { isArtplayerOnlyProfile } = await import(
                  '@/lib/media/video/playback/video-profile'
                );
                const prefs = getVideoPlaybackPrefs();
                if (
                  !isArtplayerOnlyProfile() &&
                  isAndroid() &&
                  prefs.androidFallbackMedia3 &&
                  detail.playUrl
                ) {
                  const { openAndroidVideoPlayer } = await import(
                    '@/lib/media/video/playback/android-player'
                  );
                  await openAndroidVideoPlayer(
                    'media3',
                    detail.playUrl,
                    detail.vod?.vod_name,
                  );
                  return;
                }
              } catch {
                /* fall through */
              }
              void fallbackOnPlaybackError();
            })();
          }, 600);
        });

        if (!liveMode) {
          art.on('video:ended', () => {
            if (!shouldAutoAdvanceOnEnded()) return;
            if (detail.vod?.siteKey === 'local' || detail.flags.length === 0) return;
            void playNextEpisode();
          });
        }

        const vod = detail.vod;
        const siteKey = hub.siteKey;
        const directStart = detail.playStartSec;
        if (directStart > 0 && art && !liveMode) {
          const seekDirect = () => {
            try {
              if (gen !== playGen || !art) return;
              if (art.duration > 0 && directStart < art.duration - 1) {
                art.currentTime = directStart;
              } else if (!(art.duration > 0)) {
                art.currentTime = directStart;
              }
            } catch {
              /* */
            }
          };
          art.once('video:canplay', seekDirect);
          setTimeout(seekDirect, 800);
        }
        if (vod && art && !liveMode) {
          const flag = detail.flags[detail.flagIndex];
          const ep = flag?.episodes[detail.episodeIndex];
          const curFlag = flag?.flag ?? '';
          const curEpisode = ep?.name ?? '';
          const episodeUrl = (ep?.url || '').trim();
          const bangumiTarget = resolveBangumiPlayHistoryWrite({
            hubSiteKey: siteKey || '',
            vodSiteKey: vod.siteKey,
            vodId: vod.vod_id,
            episodeUrl,
          });
          // 点播进度依赖 hub.siteKey；番剧走独立 key，不要求站点上下文
          if (bangumiTarget || siteKey) {
          const histKey = bangumiTarget?.key ?? `${siteKey}$${vod.vod_id}`;
          // 仅当历史线路/集数与当前一致时续播，避免换集误用上一集进度
          void TvDao.getHistory(histKey).then((h) => {
            if (!h || !art || gen !== playGen) return;
            if (bangumiTarget) {
              const meta = decodeBangumiFlag(h.flag);
              const sameEp =
                h.episode === curEpisode ||
                (!!episodeUrl && meta?.episodeUrl === episodeUrl);
              if (!sameEp) return;
            } else if (h.flag !== curFlag || h.episode !== curEpisode) {
              return;
            }
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
            if (!art || !vod) return;
            if (!bangumiTarget && !siteKey) return;
            const f = detail.flags[detail.flagIndex];
            const e = f?.episodes[detail.episodeIndex];
            // 片尾跳过：剩余秒数内自动下一集（尊重单集循环 / 播完暂停）
            if (
              playPrefs.endingSkipSec > 0 &&
              art.duration > playPrefs.endingSkipSec + 10 &&
              art.currentTime > 0 &&
              art.duration - art.currentTime <= playPrefs.endingSkipSec
            ) {
              if (shouldAutoAdvanceOnEnded()) {
                void playNextEpisode();
                return;
              }
            }
            if (bangumiTarget) {
              const epUrl = (e?.url || episodeUrl || '').trim();
              void (async () => {
                const writeKey =
                  resolveBangumiPlayHistoryWrite({
                    hubSiteKey: siteKey || '',
                    vodSiteKey: vod.siteKey,
                    vodId: vod.vod_id,
                    episodeUrl: epUrl,
                  })?.key ?? bangumiTarget.key;
                const prev = await TvDao.getHistory(writeKey);
                const meta = decodeBangumiFlag(prev?.flag);
                await upsertBangumiPlayHistory({
                  bgmId: bangumiTarget.bgmId,
                  title: vod.vod_name,
                  cover: vod.vod_pic ?? '',
                  episodeName: e?.name ?? '',
                  ruleId: meta?.ruleId,
                  detailUrl: meta?.detailUrl,
                  episodeUrl: epUrl || meta?.episodeUrl,
                  positionSec: art?.currentTime || 0,
                  durationSec: art?.duration || 0,
                });
                if (bangumiTarget.ghostKey) {
                  await TvDao.removeHistory(bangumiTarget.ghostKey).catch(() => undefined);
                }
              })();
            } else {
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
            }
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
        }
      } catch (e) {
        console.error('[tv-play]', e);
        setArtRef(null);
        if (liveMode) playNextLiveLine();
      }
    })();
  });

  // 沉浸模式：Artplayer layers 叠层顶栏（attach 内会 art.layers.show = true）
  createEffect(() => {
    const instance = artRef();
    const immersive = hideHeader();
    const onPlayPage = props.active();
    void playUi().aggregatedPlay;
    void playUi().autoSwitchFlagOnError;
    void playUi().hideHeader;
    void kept();

    if (!immersive || !onPlayPage) {
      overlay?.detach();
      overlay = null;
      setOverlayReady(false);
      return;
    }

    // 换源间隙 art 可能短暂不可用：保持 overlayReady，避免主壳 PageToolbar 闪现
    if (!instance) return;

    const next = attachTvPlayOverlayToolbar(instance, {
      onBack: goBack,
      onRefresh: refreshPlayback,
      onOpenDetail: canOpenPlayDetail() ? openPlayDetail : undefined,
      showKeep: canKeep(),
      onToggleKeep: canKeep()
        ? () => {
            void toggleKeepCurrent().then((v) => {
              setKept(v);
              overlay?.setKept(v);
            });
          }
        : undefined,
      kept: kept(),
      hideHeader: playUi().hideHeader || playUi().aggregatedPlay,
      aggregated: playUi().aggregatedPlay,
      autoSwitchFlag: playUi().autoSwitchFlagOnError,
      onToggleHideHeader: () => {
        if (playUi().aggregatedPlay) {
          // 聚合中关「隐藏顶栏」= 退出聚合
          setTvPlayAggregated(false);
          setTvPlayHideHeader(false);
          return;
        }
        setTvPlayHideHeader(!playUi().hideHeader);
      },
      onToggleAggregated: () => setTvPlayAggregated(!playUi().aggregatedPlay),
      onToggleAutoSwitchFlag: () =>
        setTvAutoSwitchFlagOnError(!playUi().autoSwitchFlagOnError),
      showAggregatedPanels: playUi().aggregatedPlay && !isSimpleChrome(),
      showFlagPanel: detail.flags.length > 1,
      showParsePanel: !isBangumi() && VodConfig.getParses().length > 0,
      onOpenFlagPanel: () => setPlayerPanel('flag'),
      onOpenParsePanel: () => setPlayerPanel('parse'),
      onOpenEpisodePanel: () => setPlayerPanel('episode'),
      showPlayToolsInMore: !isSimpleChrome() && !isBangumi(),
      enhanceLabel: isArtplayerOnlyProfile() ? 'Web增强' : '增强',
      onSwitchSource: () => getTvVodToolHandlers()?.switchSource(),
      onOpenExternal: () => getTvVodToolHandlers()?.openExternal(),
      onOpenEnhance: () => getTvVodToolHandlers()?.openEnhanced(),
    });
    // 勿订阅 title/description/refreshing，避免标题变化时整层重挂
    untrack(() => {
      next.update(title(), description());
      next.setRefreshing(refreshing());
    });
    setTvPlayerMiniChrome(false);
    const prev = overlay;
    overlay = next;
    setOverlayReady(true);
    // 先挂新再拆旧，缩短无顶栏空隙
    prev?.detach();

    onCleanup(() => {
      if (overlay === next) {
        overlay.detach();
        overlay = null;
      }
    });
  });

  createEffect(() => {
    const t = title();
    const d = description();
    if (props.active()) overlay?.update(t, d);
  });

  createEffect(() => {
    overlay?.setRefreshing(refreshing());
  });

  createEffect(() => {
    overlay?.setKept(kept());
  });

  createEffect(() => {
    overlay?.setMenuState({
      hideHeader: playUi().hideHeader || playUi().aggregatedPlay,
      aggregated: playUi().aggregatedPlay,
      autoSwitchFlag: playUi().autoSwitchFlagOnError,
      showPlayToolsInMore: !isSimpleChrome() && !isBangumi(),
      enhanceLabel: isArtplayerOnlyProfile() ? 'Web增强' : '增强',
    });
  });

  createEffect(() => {
    // 聚合播放：舞台 class，便于钉住弹幕发送条等
    const on = aggregatedPlay() && props.active();
    setTvPlayerAggregatedChrome(on);
    const instance = artRef();
    if (instance && props.active() && !isLive()) {
      // 切换聚合时重挂 chrome（关空闲收栏 ↔ 常显底栏）
      attachFullChrome(instance, false);
    }
    onCleanup(() => setTvPlayerAggregatedChrome(false));
  });

  onCleanup(() => {
    detachFullChrome();
    // 迷你窗会话由 runtime 保活；仅在无迷你态时销毁
    if (!tvMiniPlayerStore.isActive()) {
      tearDownPlayer();
    }
  });

  createEffect(() => {
    if (!props.active() || isSimpleChrome()) return;
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
      <Show when={canKeep()}>
        <TvHubToolbarIconButton
          label={kept() ? '取消收藏' : '收藏'}
          pressed={kept()}
          onClick={() => {
            void toggleKeepCurrent().then(setKept);
          }}
        >
          <StarIcon
            class={cn('h-4 w-4', kept() && 'fill-amber-400 text-amber-400')}
          />
        </TvHubToolbarIconButton>
      </Show>
      <AppDropdownMenu>
        <AppDropdownMenuTrigger
          as={(triggerProps: Record<string, unknown>) => (
            <AppDropdownMenuIconTrigger
              triggerProps={triggerProps}
              aria-label="更多"
              title="更多"
            >
              <MoreIcon class="h-4 w-4" />
            </AppDropdownMenuIconTrigger>
          )}
        />
        <AppDropdownMenuContent layout="compact" class="min-w-44">
          <AppDropdownMenuItem onSelect={() => setTvPlayHideHeader(true)}>
            {playUi().hideHeader || playUi().aggregatedPlay ? '✓ ' : ''}隐藏顶栏
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => setTvPlayAggregated(!playUi().aggregatedPlay)}
          >
            {playUi().aggregatedPlay ? '✓ ' : ''}聚合播放
          </AppDropdownMenuItem>
          <Show when={!isSimpleChrome() && detail.flags.length > 1}>
            <AppDropdownMenuSeparator />
            <AppDropdownMenuItem
              onSelect={() =>
                setTvAutoSwitchFlagOnError(!(playUi().autoSwitchFlagOnError !== false))
              }
            >
              {playUi().autoSwitchFlagOnError !== false ? '✓ ' : ''}失败自动切线路
            </AppDropdownMenuItem>
          </Show>
          <Show when={!isSimpleChrome() && !isBangumi()}>
            <AppDropdownMenuSeparator />
            <AppDropdownMenuItem
              onSelect={() => getTvVodToolHandlers()?.switchSource()}
            >
              换源
            </AppDropdownMenuItem>
            <AppDropdownMenuItem
              onSelect={() => getTvVodToolHandlers()?.openExternal()}
            >
              外置播放
            </AppDropdownMenuItem>
            <AppDropdownMenuItem
              onSelect={() => getTvVodToolHandlers()?.openEnhanced()}
            >
              {isArtplayerOnlyProfile() ? 'Web增强' : '增强'}
            </AppDropdownMenuItem>
          </Show>
        </AppDropdownMenuContent>
      </AppDropdownMenu>
    </div>
  );

  return (
    <TvHubPageShell
      section="play"
      title={title()}
      description={description()}
      hideToolbar={hideShellToolbar()}
      leading={<SettingsToolbarLeading onBack={goBack} />}
      titleSlot={
        canOpenPlayDetail() ? (
          <button
            type="button"
            class="group/play-title min-w-0 max-w-full overflow-hidden rounded-md px-2.5 py-2 text-left hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
            aria-label="查看详情"
            title="查看详情"
            onClick={() => openPlayDetail()}
          >
            <PageToolbarTitleText title={title()} description={description()} />
          </button>
        ) : undefined
      }
      toolbar={toolbar()}
      delegateScroll
      scrollClass="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <Show when={detail.error && !isSimpleChrome() && !hideHeader()}>
        <p class="bg-background px-4 py-2 text-sm text-muted-foreground">{detail.error}</p>
      </Show>
      <div class="relative flex min-h-0 flex-1 flex-col bg-black">
        {/* 小屏也保底高度，避免控制条 shrink-0 把播放器挤成 0 */}
        <div class="reader-artplayer-play-slot relative min-h-[min(42vh,280px)] flex-1 overflow-hidden bg-black">
          <div ref={setPlaySlot} class="absolute inset-0" />
          <Show when={aggregatedPlay() && !isSimpleChrome()}>
            <TvPlayPlayerPanels
              panel={playerPanel}
              onClose={() => setPlayerPanel(null)}
            />
            <TvVodPlayControls art={artRef} mode="aggregated" />
          </Show>
        </div>
        <Show when={isLocalDirect() && !!detail.playLocalPath?.trim()}>
          <LocalSeekThumbOverlay
            art={artRef}
            localPath={() => detail.playLocalPath.trim()}
          />
        </Show>
        <Show when={!isLocalDirect() && !!seekThumbSource().trim()}>
          <LocalSeekThumbOverlay
            art={artRef}
            localPath={() => seekThumbSource().trim()}
            spriteKey={() => seekThumbKey().trim()}
          />
        </Show>
        <Show when={!isSimpleChrome() && detail.vod && !aggregatedPlay()}>
          <div class="min-h-0 max-h-[min(52vh,420px)] shrink-0 overflow-y-auto overscroll-contain border-t border-border/40 bg-background">
            <TvVodPlayControls art={artRef} />
          </div>
        </Show>
      </div>
    </TvHubPageShell>
  );
}
