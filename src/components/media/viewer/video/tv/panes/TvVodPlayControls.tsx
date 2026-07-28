/**
 * 点播播放控制：线路 / 解析器 / 选集 / 换源等
 * 对齐 TV-fongmi VideoActivity 控制条能力（桌面简化版）
 * 番剧会话不展示解析/换源等影视能力
 */

import { showAppToast } from '@/components/shared/AppToasts';
import {
  extractEpisodeNumber,
  isDanDanPlayConfigured,
} from '@/lib/media/video/danmaku/dandanplay';
import {
  tryMatchDanmaku,
  parseBangumiSubjectIdFromVodId,
  prepareDanmakuMatchQuery,
} from '@/lib/media/video/danmaku/match';
import { getDanmuApiPrefs } from '@/lib/media/video/danmaku/danmu-api/prefs';
import {
  cleanVodTitle,
  danmakuOverrideKey,
  prepareVodSearchTitle,
  setDanmakuMatchOverride,
} from '@/lib/media/video/danmaku/normalize-vod-title';
import { getTvPlayPrefs } from '@/lib/media/tv/play/tv-play-prefs';
import { LibmpvEnhancePanel } from '@/components/media/viewer/video/tv/panes/LibmpvEnhancePanel';
import { TvWebEnhancePane } from '@/components/media/viewer/video/tv/panes/TvWebEnhancePane';
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import type { Accessor } from 'solid-js';
import { getArtplayerIdleChrome } from '@/lib/media/video/artplayer/attach-idle-chrome';
import { setTvVodToolHandlers } from '@/lib/media/tv/play/tv-vod-tool-handlers';
import { syncDanmakuRematchButton } from '@/lib/media/video/danmaku/art-danmuku';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogScrollBody,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { AppTextField, AppTextFieldInput } from '@/components/shared/AppTextField';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import * as VodConfig from '@/lib/media/tv/config/vod-config';
import { BANGUMI_SITE_KEY } from '@/lib/media/tv/types';
import {
  getTvDetailState,
  selectEpisode,
  selectFlagAndPlay,
  selectParseAndReplay,
  playCurrentEpisode,
  switchSourceAndPlay,
} from '@/stores/tv-hub/detail';
import { getTvHubState } from '@/stores/tv-hub/section';
import type Artplayer from 'artplayer';
import {
  getPreferredExternalPlayer,
  openInExternalPlayer,
} from '@/lib/media/tv/play/external-player';
import { getVideoPlaybackPrefs } from '@/lib/media/video/playback/prefs';
import { formatExternalPlayerLabel } from '@/lib/media/video/playback/mpv-launch';
import { isArtplayerOnlyProfile } from '@/lib/media/video/playback/video-profile';
import {
  openEnhanceRouted,
  type EnhancePipelineId,
} from '@/lib/media/video/enhance';
import { getTvPlayer } from '@/lib/media/tv/play/player-bridge';
import { replaceArtDanmaku } from '@/lib/media/video/danmaku/art-danmuku';
import type { Danmu } from 'artplayer-plugin-danmuku';

export const vodChipBtnClass = (selected: boolean) =>
  cn(
    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
    selected
      ? 'bg-primary text-primary-foreground shadow-sm'
      : 'bg-muted/80 text-foreground hover:bg-muted hover:text-foreground',
  );

function canMatchDanmakuNow(playUrl: string | undefined): boolean {
  return (
    getDanmuApiPrefs().enabled ||
    isDanDanPlayConfigured() ||
    Boolean(playUrl?.trim())
  );
}

async function loadDanmakuIntoArt(
  art: Artplayer | null,
  danmu: unknown,
): Promise<'loaded' | 'no-plugin' | 'no-art'> {
  if (!Array.isArray(danmu) && typeof danmu !== 'string') return 'no-plugin';
  return replaceArtDanmaku(art, danmu as Danmu[] | string);
}

export function TvVodPlayControls(props: {
  art: Accessor<Artplayer | null>;
  class?: string;
  /**
   * bar：播放器下方线路/解析/选集
   * aggregated：仅保留对话框；换源/外置/增强在顶栏更多，匹配弹幕在弹幕设置
   */
  mode?: 'bar' | 'aggregated';
}) {
  const state = getTvDetailState();
  const aggregated = () => props.mode === 'aggregated';
  const [showEnhance, setShowEnhance] = createSignal(false);
  const [webEnhance, setWebEnhance] = createSignal<{
    url: string;
    pipeline: EnhancePipelineId;
    startSec: number;
  } | null>(null);
  const [rematchOpen, setRematchOpen] = createSignal(false);
  const [rematchTitle, setRematchTitle] = createSignal('');
  const [rematchEpisode, setRematchEpisode] = createSignal('1');
  const [rematchBusy, setRematchBusy] = createSignal(false);
  const isBangumi = () => state.vod?.siteKey === BANGUMI_SITE_KEY;
  const flag = () => state.flags[state.flagIndex];
  const parses = () => VodConfig.getParses();
  const selectedParse = () => state.parseName || VodConfig.getDefaultParseName();

  const previewClean = createMemo(() => {
    const raw = rematchTitle().trim();
    if (!raw) return '';
    return prepareVodSearchTitle(raw).searchTitle;
  });

  const openExternal = () => {
    const url = state.playUrl;
    if (!url) {
      showAppToast({ title: '无播放地址', description: '请先解析出可播放链接' });
      return;
    }
    const prefs = getVideoPlaybackPrefs();
    void openInExternalPlayer(url, {
      kind: getPreferredExternalPlayer(),
      title: state.vod?.vod_name,
      anime4k: { mode: prefs.anime4kMode, quality: prefs.anime4kQuality },
      subtitle: prefs.preferredSubtitlePath || undefined,
      headers: state.playHeaders,
    })
      .then(() =>
        showAppToast({
          title: '已交给外置播放器',
          description: formatExternalPlayerLabel(),
        }),
      )
      .catch((e) =>
        showAppToast({
          title: '外置播放失败',
          description: e instanceof Error ? e.message : String(e),
        }),
      );
  };

  const openEnhanced = () => {
    const url = state.playUrl;
    if (!url) {
      showAppToast({ title: '无播放地址', description: '请先解析出可播放链接' });
      return;
    }
    void (async () => {
      try {
        const art = getTvPlayer();
        const startSec = art?.currentTime ?? 0;
        const result = await openEnhanceRouted({
          url,
          title: state.vod?.vod_name,
          headers: state.playHeaders,
          startSec,
        });
        if (result.kind === 'none') {
          showAppToast({
            title: '增强不可用',
            description: result.toast ?? result.reason,
          });
          return;
        }
        if (result.kind === 'web') {
          art?.pause();
          setShowEnhance(false);
          setWebEnhance({ url, pipeline: result.pipeline, startSec });
          showAppToast({
            title: '已进入 Web 增强',
            description: result.toast ?? result.pipeline,
          });
          return;
        }
        showAppToast({
          title: '已打开增强播放',
          description: result.toast ?? 'libmpv',
        });
        setShowEnhance(true);
      } catch (e) {
        showAppToast({
          title: '增强失败',
          description: e instanceof Error ? e.message : String(e),
        });
      }
    })();
  };

  const openRematchDialog = () => {
    const rawName = state.vod?.vod_name || '';
    const epName = state.flags[state.flagIndex]?.episodes[state.episodeIndex]?.name;
    const prepared = prepareDanmakuMatchQuery({
      fileNameHint: [rawName, epName].filter(Boolean).join(' ') || rawName || '视频',
      animeTitle: rawName,
      episodeName: epName,
      episodeIndex: state.episodeIndex,
      vodId: state.vod?.vod_id,
      siteKey: getTvHubState().siteKey || state.vod?.siteKey,
    });
    setRematchTitle(prepared.searchTitle || cleanVodTitle(rawName) || rawName);
    setRematchEpisode(String(prepared.episode || 1));
    setRematchOpen(true);
  };

  const applyCleanedTitle = () => {
    const cleaned = cleanVodTitle(rematchTitle());
    if (cleaned) setRematchTitle(cleaned);
  };

  const rematchDanmaku = (opts?: {
    title?: string;
    episodeNo?: number;
    persist?: boolean;
  }) => {
    if (!canMatchDanmakuNow(state.playUrl)) {
      showAppToast({
        title: '无法匹配弹幕',
        description: '请开启内置弹幕聚合，或配置弹弹play / 使用含 BV 的地址',
      });
      return;
    }
    const ep = state.flags[state.flagIndex]?.episodes[state.episodeIndex];
    const siteKey = getTvHubState().siteKey || state.vod?.siteKey || '';
    const title =
      (opts?.title || rematchTitle() || state.vod?.vod_name || '').trim();
    const episodeNo =
      opts?.episodeNo && opts.episodeNo > 0
        ? opts.episodeNo
        : Number.parseInt(rematchEpisode(), 10) ||
          extractEpisodeNumber(ep?.name || '', 0) ||
          (state.episodeIndex >= 0 ? state.episodeIndex + 1 : 1);

    if (opts?.persist !== false && title) {
      // 只持久化片名纠正；集号跟当前播放走，避免全剧共用同一集缓存键
      setDanmakuMatchOverride(
        danmakuOverrideKey({
          vodId: state.vod?.vod_id,
          vodName: state.vod?.vod_name,
          siteKey,
        }),
        { title, skipClean: true },
      );
    }

    setRematchBusy(true);
    void (async () => {
      const { emitDanmakuStatusTip } = await import(
        '@/lib/media/video/danmaku/status-tip'
      );
      emitDanmakuStatusTip('fetching', props.art());
      try {
        const r = await tryMatchDanmaku({
          fileNameHint: `${title} 第${episodeNo}集`,
          animeTitle: state.vod?.vod_name,
          episodeName: ep?.name,
          episodeIndex: state.episodeIndex,
          bgmSubjectId: parseBangumiSubjectIdFromVodId(state.vod?.vod_id),
          playUrl: state.playUrl || undefined,
          vodId: state.vod?.vod_id,
          siteKey,
          searchTitleOverride: title,
          episodeNoOverride: episodeNo,
          skipClean: true,
        });
        if (!r?.danmu.length) {
          emitDanmakuStatusTip('error', props.art());
          showAppToast({
            title: '未匹配到弹幕',
            description: `${title} · 第${episodeNo}集`,
          });
          return;
        }
        const loaded = await loadDanmakuIntoArt(props.art(), r.danmu);
        if (loaded === 'no-plugin' && getTvPlayPrefs().danmakuEnabled) {
          showAppToast({
            title: `已匹配 ${r.label}`,
            description: '请重新进入播放页以加载弹幕（当前实例无弹幕插件）',
          });
          return;
        }
        showAppToast({
          title: '弹幕已加载',
          description: `${r.source}: ${r.label}（${r.danmu.length}）`,
        });
        setRematchOpen(false);
      } catch (e) {
        emitDanmakuStatusTip('error', props.art());
        showAppToast({
          title: '弹幕匹配失败',
          description: e instanceof Error ? e.message : String(e),
        });
      } finally {
        setRematchBusy(false);
      }
    })();
  };

  // 供顶栏更多 / 弹幕设置面板调用
  createEffect(() => {
    void state.playUrl;
    setTvVodToolHandlers({
      switchSource: () => void switchSourceAndPlay(),
      openExternal,
      openEnhanced,
      openRematch: openRematchDialog,
      enhanceLabel: isArtplayerOnlyProfile() ? 'Web增强' : '增强',
      showPlayTools: !isBangumi(),
      showRematch: canMatchDanmakuNow(state.playUrl),
    });
    syncDanmakuRematchButton(props.art());
    onCleanup(() => {
      setTvVodToolHandlers(null);
      syncDanmakuRematchButton(props.art());
    });
  });

  // 对话框打开时钉住顶底栏，避免计时隐藏
  createEffect(() => {
    const open = rematchOpen() || showEnhance() || !!webEnhance();
    const idle = getArtplayerIdleChrome();
    if (!open || !idle) return;
    idle.pin();
    onCleanup(() => idle.unpin());
  });

  return (
    <div
      class={cn(
        aggregated()
          ? 'contents'
          : 'flex shrink-0 flex-col gap-3 border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur-sm',
        props.class,
      )}
    >
      <Show when={!aggregated() && state.flags.length > 1}>
        <div class="space-y-1.5">
          <p class="text-xs font-medium text-muted-foreground">线路</p>
          <div class="flex flex-wrap gap-1.5">
            <For each={state.flags}>
              {(f, i) => (
                <button
                  type="button"
                  class={vodChipBtnClass(state.flagIndex === i())}
                  onClick={() => void selectFlagAndPlay(i())}
                >
                  {f.flag}
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>

      <Show when={!aggregated() && !isBangumi() && parses().length > 0}>
        <div class="flex flex-wrap items-center gap-2">
          <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <span class="shrink-0 text-xs text-muted-foreground">解析</span>
            <For each={parses()}>
              {(p) => (
                <button
                  type="button"
                  class={vodChipBtnClass(selectedParse() === p.name)}
                  onClick={() => void selectParseAndReplay(p.name)}
                >
                  {p.name}
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>

      <Show when={!aggregated() && (flag()?.episodes.length ?? 0) > 0}>
        <div class="max-h-36 space-y-1.5 overflow-y-auto">
          <p class="text-xs font-medium text-muted-foreground">选集</p>
          <div class="flex flex-wrap gap-1.5">
            <For each={flag()?.episodes ?? []}>
              {(ep, i) => (
                <button
                  type="button"
                  class={vodChipBtnClass(state.episodeIndex === i())}
                  onClick={() => {
                    selectEpisode(i());
                    void playCurrentEpisode();
                  }}
                >
                  {ep.name}
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>

      <Show when={!isArtplayerOnlyProfile() && showEnhance()}>
        <LibmpvEnhancePanel />
      </Show>

      <Show when={webEnhance()}>
        {(w) => (
          <Portal>
            <div class="fixed inset-0 z-[200]">
              <TvWebEnhancePane
                url={w().url}
                title={state.vod?.vod_name}
                startSec={w().startSec}
                pipeline={w().pipeline}
                onClose={() => setWebEnhance(null)}
                onExitWithPosition={(sec) => {
                  const art = getTvPlayer() ?? props.art();
                  if (art && Number.isFinite(sec)) {
                    try {
                      art.currentTime = sec;
                      void art.play();
                    } catch {
                      /* */
                    }
                  }
                }}
              />
            </div>
          </Portal>
        )}
      </Show>

      <AppDialog open={rematchOpen()} onOpenChange={setRematchOpen}>
        <AppDialogContent class="max-w-md" portalToBody>
          <AppDialogHeader>
            <AppDialogTitle>匹配弹幕</AppDialogTitle>
            <AppDialogDescription>
              按剧名到爱优腾芒哔等弹幕源搜索，与当前播放站无关。片名过脏时可改名或一键清洗。
            </AppDialogDescription>
          </AppDialogHeader>
          <AppDialogScrollBody class="space-y-3 px-1">
            <AppTextField>
              <Label class="text-xs text-muted-foreground">匹配剧名</Label>
              <AppTextFieldInput
                value={rematchTitle()}
                placeholder={state.vod?.vod_name || '剧名'}
                onInput={(e: Event) =>
                  setRematchTitle((e.currentTarget as HTMLInputElement).value)
                }
              />
            </AppTextField>
            <Show
              when={
                previewClean() &&
                previewClean() !== rematchTitle().trim() &&
                rematchTitle().trim()
              }
            >
              <p class="text-[11px] text-muted-foreground">
                自动清洗预览：{previewClean()}
              </p>
            </Show>
            <AppTextField>
              <Label class="text-xs text-muted-foreground">集数</Label>
              <AppTextFieldInput
                type="number"
                min="1"
                value={rematchEpisode()}
                onInput={(e: Event) =>
                  setRematchEpisode((e.currentTarget as HTMLInputElement).value)
                }
              />
            </AppTextField>
          </AppDialogScrollBody>
          <AppDialogFooter class="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={rematchBusy()}
              onClick={applyCleanedTitle}
            >
              一键清洗
            </Button>
            <div class="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={rematchBusy()}
                onClick={() => setRematchOpen(false)}
              >
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={rematchBusy() || !rematchTitle().trim()}
                onClick={() => rematchDanmaku({ persist: true })}
              >
                {rematchBusy() ? '匹配中…' : '开始匹配'}
              </Button>
            </div>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>
    </div>
  );
}
