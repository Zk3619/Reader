/**
 * Web 增强播放面：canvas 直通 + 最小 HUD（skeleton-core / chrome 雏形）
 * @see docs/VIDEO_WEB_ENHANCE.md
 */

import { onCleanup, onMount, createSignal, Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  AppSelect,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import { ViewerAppSelectContent } from '@/components/media/viewer/viewer-app-overlay';
import {
  createWebEnhanceEngine,
  probeMediaRangeSupport,
  type EnhancePipelineId,
} from '@/lib/media/video/enhance';
import {
  getVideoPlaybackPrefs,
  setVideoPlaybackPrefs,
} from '@/lib/media/video/playback/prefs';
import {
  ANIME4K_MODE_LABELS,
  ANIME4K_MODE_OPTIONS,
} from '@/lib/media/video/playback/mpv-launch';
import type { Anime4KMode } from '@/lib/media/video/playback/types';
import { showAppToast } from '@/components/shared/AppToasts';

export type TvWebEnhancePaneProps = {
  url: string;
  title?: string;
  startSec?: number;
  pipeline: EnhancePipelineId;
  onClose: () => void;
  /** 关闭时回传当前位置，供 Artplayer 热切换迁移 */
  onExitWithPosition?: (sec: number) => void;
};

const HUD_SR_LABELS: Record<Anime4KMode, string> = {
  ...ANIME4K_MODE_LABELS,
  off: '关闭',
};

export function TvWebEnhancePane(props: TvWebEnhancePaneProps) {
  let canvas!: HTMLCanvasElement;
  const [pos, setPos] = createSignal(0);
  const [dur, setDur] = createSignal(0);
  const [playing, setPlaying] = createSignal(false);
  const [rate, setRate] = createSignal(1);
  const [rangeOk, setRangeOk] = createSignal<boolean | null>(null);
  const [ready, setReady] = createSignal(false);
  const [srMode, setSrMode] = createSignal<Anime4KMode>(
    getVideoPlaybackPrefs().anime4kMode,
  );
  const [rifeOn, setRifeOn] = createSignal(
    getVideoPlaybackPrefs().frameInterpEnabled,
  );

  let eng: ReturnType<typeof createWebEnhanceEngine> | null = null;

  onMount(() => {
    eng = createWebEnhanceEngine(canvas, {
      onTimeUpdate: (t, d) => {
        setPos(t);
        setDur(d);
      },
      onReady: () => setReady(true),
      onError: (e) => {
        showAppToast({ title: 'Web 增强错误', description: e.message });
      },
      onWatchdogToast: (msg) => {
        showAppToast({ title: '性能看门狗', description: msg });
      },
      onEnhanceStatus: (s) => {
        showAppToast({ title: '增强后端', description: s });
      },
    });

    void (async () => {
      const range = await probeMediaRangeSupport(props.url);
      setRangeOk(range.ok);
      if (!range.ok) {
        showAppToast({
          title: 'Range 未返回 206',
          description: `${range.detail} · seek 可能退化全量缓冲`,
        });
      }
      try {
        await eng!.load({
          url: props.url,
          title: props.title,
          startSec: props.startSec ?? 0,
        });
        await eng!.play();
        setPlaying(true);
      } catch (e) {
        showAppToast({
          title: 'Web 增强起播失败',
          description: e instanceof Error ? e.message : String(e),
        });
      }
    })();
  });

  onCleanup(() => {
    void eng?.destroy();
    eng = null;
  });

  const fmt = (s: number) => {
    if (!Number.isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const togglePlay = () => {
    if (!eng) return;
    if (playing()) {
      void eng.pause();
      setPlaying(false);
    } else {
      void eng.play();
      setPlaying(true);
    }
  };

  const onSeek = (v: number) => {
    void eng?.seek(v);
  };

  const cycleRate = () => {
    const rates = [0.75, 1, 1.25, 1.5, 2];
    const i = rates.indexOf(rate());
    const next = rates[(i + 1) % rates.length] ?? 1;
    setRate(next);
    eng?.setPlaybackRate(next);
  };

  const applySrMode = (next: Anime4KMode) => {
    setSrMode(next);
    setVideoPlaybackPrefs({ anime4kMode: next });
    eng?.setAnime4KMode(next);
  };

  const toggleRife = () => {
    const next = !rifeOn();
    setRifeOn(next);
    setVideoPlaybackPrefs({ frameInterpEnabled: next });
    eng?.setFrameInterpEnabled(next);
    showAppToast({
      title: next ? 'RIFE 已开' : 'RIFE 已关',
      description: next
        ? '适合 ≤30fps（如 23.976/24/25）。片源帧率过高会自动跳过'
        : undefined,
    });
  };

  const close = async () => {
    const t = eng ? await eng.getPosition() : pos();
    props.onExitWithPosition?.(t);
    await eng?.destroy();
    eng = null;
    props.onClose();
  };

  return (
    <div class="absolute inset-0 z-40 flex flex-col bg-black text-white">
      <div class="flex items-center gap-2 px-3 py-2 bg-black/80 text-xs">
        <span class="truncate flex-1 opacity-90">
          Web 增强 · {props.pipeline}
          <Show when={props.title}> · {props.title}</Show>
        </span>
        <Show when={rangeOk() === false}>
          <span class="text-amber-400">Range?</span>
        </Show>
        <Button size="sm" variant="secondary" class="h-7 text-xs" onClick={() => void close()}>
          退出增强
        </Button>
      </div>
      <div class="relative flex-1 min-h-0 bg-black overflow-hidden">
        {/*
          布局始终铺满视口；位图宽高与 CSS 解耦。
          object-fit:contain = 单边充满、另一边黑边（父级 bg-black）。
        */}
        <canvas
          ref={canvas!}
          class="absolute inset-0 h-full w-full object-contain bg-black"
        />
        <Show when={!ready()}>
          <div class="absolute inset-0 flex items-center justify-center text-sm opacity-70">
            加载中…
          </div>
        </Show>
      </div>
      <div class="flex flex-col gap-1 px-3 py-2 bg-black/90">
        <input
          type="range"
          class="w-full"
          min={0}
          max={Math.max(dur(), 0.1)}
          step={0.1}
          value={pos()}
          onInput={(e) => onSeek(Number(e.currentTarget.value))}
        />
        <div class="flex flex-wrap items-center gap-2 text-xs">
          <Button size="sm" variant="secondary" class="h-7" onClick={togglePlay}>
            {playing() ? '暂停' : '播放'}
          </Button>
          <Button size="sm" variant="secondary" class="h-7" onClick={cycleRate}>
            {rate()}x
          </Button>
          <AppSelect
            value={srMode()}
            disableAccessibilityAnnounce
            onChange={(v) => {
              const mode = (v || 'off') as Anime4KMode;
              applySrMode(mode);
            }}
            options={[...ANIME4K_MODE_OPTIONS]}
            itemComponent={(itemProps) => (
              <AppSelectItem item={itemProps.item}>
                {HUD_SR_LABELS[itemProps.item.rawValue as Anime4KMode] ??
                  String(itemProps.item.rawValue)}
              </AppSelectItem>
            )}
          >
            <AppSelectTrigger
              layout="plain"
              class="h-7 w-[7.5rem] border-border/60 bg-secondary text-secondary-foreground text-xs px-2"
              aria-label="超分方案"
            >
              <AppSelectValue>
                {(sel) => {
                  const v = String(sel.selectedOption() ?? 'off') as Anime4KMode;
                  return `超分 ${HUD_SR_LABELS[v] ?? v}`;
                }}
              </AppSelectValue>
              <AppSelectIcon />
            </AppSelectTrigger>
            <ViewerAppSelectContent portalZClass="z-[210]">
              <AppSelectListbox />
            </ViewerAppSelectContent>
          </AppSelect>
          <Button size="sm" variant="secondary" class="h-7" onClick={toggleRife}>
            补帧 {rifeOn() ? '开' : '关'}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            class="h-7"
            onClick={() => {
              void (async () => {
                const blob = await eng?.captureFrameBlob();
                if (!blob) {
                  showAppToast({ title: '截图失败', description: '空白或不可用' });
                  return;
                }
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `web-enhance-${Date.now()}.jpg`;
                a.click();
                URL.revokeObjectURL(a.href);
              })();
            }}
          >
            截图
          </Button>
          <span class="opacity-80 tabular-nums">
            {fmt(pos())} / {fmt(dur())}
          </span>
        </div>
      </div>
    </div>
  );
}
