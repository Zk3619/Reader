/**
 * 点播播放控制：线路 / 解析器 / 选集 / 上下集 / 快进快退
 * 对齐 TV-fongmi VideoActivity 控制条能力（桌面简化版）
 */

import { For, Show } from 'solid-js';
import type { Accessor } from 'solid-js';
import { Rewind, FastForward } from 'lucide-solid';
import { AppTabs } from '@/components/shared/AppTabs';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import * as VodConfig from '@/lib/media/tv/config/vod-config';
import {
  getTvDetailState,
  getCurrentEpisodeInfo,
  hasPrevEpisode,
  hasNextEpisode,
  selectEpisode,
  selectFlagAndPlay,
  selectParseAndReplay,
  playCurrentEpisode,
  playPrevEpisode,
  playNextEpisode,
  switchSourceAndPlay,
} from '@/stores/tv-hub/detail';
import type Artplayer from 'artplayer';
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/shared/icons';
import {
  getPreferredExternalPlayer,
  openInExternalPlayer,
} from '@/lib/media/tv/play/external-player';
import { getVideoPlaybackPrefs } from '@/lib/media/video/playback/prefs';
import { createLibMpvEngine } from '@/lib/media/video/playback/libmpv-engine';
import { showAppToast } from '@/components/shared/AppToasts';
import { resolvePlaybackEngine } from '@/lib/media/video/playback/router';
import { isDanDanPlayConfigured } from '@/lib/media/video/danmaku/dandanplay';
import { tryMatchDanmaku } from '@/lib/media/video/danmaku/match';
import { getTvPlayPrefs } from '@/lib/media/tv/play/tv-play-prefs';

const SEEK_STEP_SEC = 10;

const episodeBtnClass = (selected: boolean) =>
  cn(
    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
    selected
      ? 'bg-primary text-primary-foreground shadow-sm'
      : 'bg-muted/80 text-foreground hover:bg-muted hover:text-foreground',
  );

export function TvVodPlayControls(props: {
  art: Accessor<Artplayer | null>;
  class?: string;
}) {
  const state = getTvDetailState();
  const flag = () => state.flags[state.flagIndex];
  const flagTabItems = () =>
    state.flags.map((f, i) => ({ value: String(i), label: f.flag }));
  const parses = () => VodConfig.getParses();
  const defaultParse = () => VodConfig.getDefaultParseName();
  const info = () => getCurrentEpisodeInfo();

  const seekBy = (deltaSec: number) => {
    const art = props.art();
    if (!art || !Number.isFinite(art.duration)) return;
    const next = Math.max(0, Math.min(art.duration, art.currentTime + deltaSec));
    art.currentTime = next;
  };

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
    })
      .then(() =>
        showAppToast({
          title: '已交给外置播放器',
          description: getPreferredExternalPlayer(),
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
    const engine = resolvePlaybackEngine({
      url,
      sourceKind: 'hub_stream',
      forceEngine: 'libmpv',
    });
    void (async () => {
      try {
        if (engine === 'external') {
          await openExternal();
          return;
        }
        const prefs = getVideoPlaybackPrefs();
        const eng = createLibMpvEngine();
        await eng.load({
          url,
          title: state.vod?.vod_name,
          subtitle: prefs.preferredSubtitlePath || undefined,
          anime4k: { mode: prefs.anime4kMode, quality: prefs.anime4kQuality },
        });
        showAppToast({
          title: '已打开增强播放窗',
          description: prefs.libmpvGpuNext
            ? 'libmpv (gpu-next，Anime4K 已跳过)'
            : 'libmpv',
        });
      } catch (e) {
        showAppToast({
          title: '增强播放不可用',
          description: e instanceof Error ? e.message : String(e),
        });
      }
    })();
  };

  const rematchDanmaku = () => {
    if (!isDanDanPlayConfigured() && !state.playUrl) {
      showAppToast({
        title: '无法匹配弹幕',
        description: '请先在设置中配置弹弹play，或使用含 BV 的播放地址',
      });
      return;
    }
    const ep = getCurrentEpisodeInfo().episode;
    const hint = [state.vod?.vod_name, ep?.name].filter(Boolean).join(' ');
    void tryMatchDanmaku({
      fileNameHint: hint || state.vod?.vod_name || 'video',
      playUrl: state.playUrl || undefined,
    })
      .then((r) => {
        if (!r?.danmu.length) {
          showAppToast({ title: '未匹配到弹幕', description: hint });
          return;
        }
        const art = props.art() as (Artplayer & { plugins?: Array<{ name?: string; load?: (d: unknown) => void }> }) | null;
        const plugin = art?.plugins?.find(
          (p) => p?.name === 'artplayerPluginDanmuku',
        );
        if (plugin?.load) {
          plugin.load(r.danmu);
        } else if (getTvPlayPrefs().danmakuEnabled) {
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
      })
      .catch((e) =>
        showAppToast({
          title: '弹幕匹配失败',
          description: e instanceof Error ? e.message : String(e),
        }),
      );
  };

  return (
    <div
      class={cn(
        'flex shrink-0 flex-col gap-3 border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur-sm',
        props.class,
      )}
    >
      <Show when={state.flags.length > 1}>
        <div class="space-y-1.5">
          <p class="text-xs font-medium text-muted-foreground">线路</p>
          <AppTabs
            value={String(state.flagIndex)}
            onChange={(value) => void selectFlagAndPlay(Number(value))}
            items={flagTabItems()}
            ariaLabel="播放线路"
            variant="drawer-inline"
            layout="inline"
          />
        </div>
      </Show>

      <div class="flex flex-wrap items-center gap-2">
        <Show when={parses().length > 0}>
          <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <span class="shrink-0 text-xs text-muted-foreground">解析</span>
            <For each={parses()}>
              {(p) => (
                <Button
                  type="button"
                  size="sm"
                  variant={defaultParse() === p.name ? 'default' : 'outline'}
                  class="h-7 px-2 text-xs"
                  onClick={() => void selectParseAndReplay(p.name)}
                >
                  {p.name}
                </Button>
              )}
            </For>
          </div>
        </Show>

        <div class="ml-auto flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            class="h-7 px-2 text-xs"
            onClick={() => void switchSourceAndPlay()}
            title="换源"
          >
            换源
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            class="h-7 px-2 text-xs"
            onClick={openExternal}
            title="外置播放器（mpv/VLC/系统）"
          >
            外置
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            class="h-7 px-2 text-xs"
            onClick={openEnhanced}
            title="增强核 libmpv 独立窗（需 feature video-libmpv）"
          >
            增强
          </Button>
          <Show when={isDanDanPlayConfigured() || !!state.playUrl}>
            <Button
              type="button"
              size="sm"
              variant="outline"
              class="h-7 px-2 text-xs"
              onClick={rematchDanmaku}
              title="弹弹 / B 站弹幕匹配"
            >
              弹幕
            </Button>
          </Show>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!hasPrevEpisode()}
            onClick={() => void playPrevEpisode()}
            title="上一集"
          >
            <ChevronLeftIcon class="h-4 w-4" />
            <span class="sr-only">上一集</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => seekBy(-SEEK_STEP_SEC)}
            title={`快退 ${SEEK_STEP_SEC}s`}
          >
            <Rewind class="h-4 w-4" />
            <span class="hidden sm:inline">{SEEK_STEP_SEC}s</span>
          </Button>
          <Show when={info().episode}>
            <span class="max-w-32 truncate px-1 text-xs text-muted-foreground sm:max-w-48">
              {info().episode?.name}
            </span>
          </Show>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => seekBy(SEEK_STEP_SEC)}
            title={`快进 ${SEEK_STEP_SEC}s`}
          >
            <span class="hidden sm:inline">{SEEK_STEP_SEC}s</span>
            <FastForward class="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!hasNextEpisode()}
            onClick={() => void playNextEpisode()}
            title="下一集"
          >
            <ChevronRightIcon class="h-4 w-4" />
            <span class="sr-only">下一集</span>
          </Button>
        </div>
      </div>

      <Show when={(flag()?.episodes.length ?? 0) > 0}>
        <div class="max-h-36 space-y-1.5 overflow-y-auto">
          <p class="text-xs font-medium text-muted-foreground">选集</p>
          <div class="flex flex-wrap gap-1.5">
            <For each={flag()?.episodes ?? []}>
              {(ep, i) => (
                <button
                  type="button"
                  class={episodeBtnClass(state.episodeIndex === i())}
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
    </div>
  );
}
