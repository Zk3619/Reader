/**
 * Libmpv 增强窗轻量播控：音轨 / 字幕 / Anime4K / softvol / EQ / 章节 / 弹幕出口
 */

import { createSignal, Show, For, onMount } from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  AppSelect,
  AppSelectContent,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import {
  createLibMpvEngine,
  probeLibMpvStatus,
} from '@/lib/media/video/playback/libmpv-engine';
import {
  getVideoPlaybackPrefs,
  setVideoPlaybackPrefs,
} from '@/lib/media/video/playback/prefs';
import {
  ANIME4K_MODE_LABELS,
  ANIME4K_MODE_OPTIONS,
  evaluateAnime4KAvailability,
} from '@/lib/media/video/playback/mpv-launch';
import { probeAnime4KShadersPresent } from '@/lib/media/video/playback/shaders-dir';
import { getTvPlayPrefs } from '@/lib/media/tv/play/tv-play-prefs';
import {
  applyAnime4KModeLive,
  applyAudioEqLive,
  applyAudioLive,
  applyFrameInterpLive,
} from '@/lib/media/video/playback/libmpv-live';
import type { Anime4KMode, PlaybackTrackInfo } from '@/lib/media/video/playback/types';
import { AppSwitch, AppSwitchControl, AppSwitchThumb } from '@/components/shared/AppSwitch';
import { probeRifeStatus } from '@/lib/media/video/playback/rife-probe';
import type { RifeProbeStatus } from '@/lib/media/video/playback/frame-interp';
import {
  AUDIO_EQ_PRESET_LABELS,
  AUDIO_EQ_PRESET_OPTIONS,
  type AudioEqPreset,
} from '@/lib/media/video/playback/audio-eq';
import { showAppToast } from '@/components/shared/AppToasts';
import { tryMatchDanmaku } from '@/lib/media/video/danmaku/match';
import { danmuToAss } from '@/lib/media/video/danmaku/to-ass';
import { getTvDetailState, getCurrentEpisodeInfo } from '@/stores/tv-hub/detail';
import { invoke } from '@tauri-apps/api/core';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { tempDir, join } from '@tauri-apps/api/path';
import type { Danmu } from 'artplayer-plugin-danmuku';

type ChapterInfo = { index: number; title: string; time: number };

function formatChapterTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }
  return `${m}:${String(r).padStart(2, '0')}`;
}

function buildAssFromPrefs(danmu: Danmu[]): string {
  const p = getTvPlayPrefs();
  return danmuToAss(danmu, {
    fontSize: p.libmpvDanmakuFontSize,
    opacity: p.libmpvDanmakuOpacity,
    durationSec: p.libmpvDanmakuDuration,
    mergeSec: p.libmpvDanmakuMergeSec,
    maxCount: p.libmpvDanmakuMax,
  });
}

export function LibmpvEnhancePanel(props: { class?: string }) {
  const eng = createLibMpvEngine();
  const [audio, setAudio] = createSignal<PlaybackTrackInfo[]>([]);
  const [subs, setSubs] = createSignal<PlaybackTrackInfo[]>([]);
  const [aid, setAid] = createSignal('');
  const [sid, setSid] = createSignal('no');
  const [mode, setMode] = createSignal<Anime4KMode>(getVideoPlaybackPrefs().anime4kMode);
  const [busy, setBusy] = createSignal(false);
  const [a4kOk, setA4kOk] = createSignal(false);
  const [rifeOk, setRifeOk] = createSignal(false);
  const [rifeDetail, setRifeDetail] = createSignal('');
  const [rifeOn, setRifeOn] = createSignal(getVideoPlaybackPrefs().frameInterpEnabled);
  const [rifeFactor, setRifeFactor] = createSignal(getVideoPlaybackPrefs().frameInterpFactor);
  const [volume, setVolume] = createSignal(getVideoPlaybackPrefs().volume);
  const [muted, setMuted] = createSignal(getVideoPlaybackPrefs().muted);
  const [listenOnly, setListenOnly] = createSignal(getVideoPlaybackPrefs().listenOnly);
  const [eqPreset, setEqPreset] = createSignal<AudioEqPreset>(
    getVideoPlaybackPrefs().audioEqPreset,
  );
  const [danmakuInfo, setDanmakuInfo] = createSignal<{
    count: number;
    label: string;
    danmu: Danmu[];
  } | null>(null);
  const [assAttached, setAssAttached] = createSignal(false);
  const [chapters, setChapters] = createSignal<ChapterInfo[]>([]);

  const refresh = async () => {
    setBusy(true);
    try {
      const [a, s, st, shaders, ch, rife] = await Promise.all([
        eng.listAudioTracks(),
        eng.listSubtitleTracks(),
        probeLibMpvStatus(),
        probeAnime4KShadersPresent(),
        invoke<ChapterInfo[]>('video_libmpv_list_chapters').catch(() => [] as ChapterInfo[]),
        probeRifeStatus().catch(
          (): RifeProbeStatus => ({
            available: false,
            backend: null,
            detail: '探测失败',
            scriptPath: '',
            models: [],
            hasTrt: false,
            hasDml: false,
            hasNcnn: false,
          }),
        ),
      ]);
      setAudio(a);
      setSubs(s);
      setChapters(Array.isArray(ch) ? ch : []);
      if (a[0]) setAid(a[0].id);
      setSid('no');
      const prefs = getVideoPlaybackPrefs();
      const avail = evaluateAnime4KAvailability({
        prefs,
        shadersReady: shaders.ready,
        libmpvAvailable: st.available,
      });
      setA4kOk(avail.usable && !prefs.frameInterpEnabled);
      setRifeOk(rife.available || prefs.frameInterpLightweightFallback);
      setRifeDetail(rife.detail);
      setRifeOn(prefs.frameInterpEnabled);
      setRifeFactor(prefs.frameInterpFactor);
    } catch (e) {
      showAppToast({
        title: '无法读取增强窗轨信息',
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const pushAudio = async (patch: {
    volume?: number;
    muted?: boolean;
    listenOnly?: boolean;
  }) => {
    const next = setVideoPlaybackPrefs(patch);
    setVolume(next.volume);
    setMuted(next.muted);
    setListenOnly(next.listenOnly);
    try {
      await applyAudioLive();
    } catch (e) {
      showAppToast({
        title: '音量/听视频更新失败',
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const attachAsSub = async (danmu?: Danmu[], opts?: { silent?: boolean }) => {
    const list = danmu ?? danmakuInfo()?.danmu;
    if (!list?.length) return false;
    try {
      const dir = await tempDir();
      const path = await join(dir, `reader-danmaku-${Date.now()}.ass`);
      await writeTextFile(path, buildAssFromPrefs(list));
      await invoke('video_libmpv_sub_add', { path });
      setAssAttached(true);
      const s = await eng.listSubtitleTracks().catch(() => [] as PlaybackTrackInfo[]);
      setSubs(s);
      if (!opts?.silent) {
        showAppToast({
          title: '已挂载弹幕 ASS',
          description: `${list.length} 条 · 滚动/顶底；可在设置调字号与时长`,
        });
      }
      return true;
    } catch (e) {
      showAppToast({
        title: '挂载弹幕 ASS 失败',
        description: e instanceof Error ? e.message : String(e),
      });
      return false;
    }
  };

  const detachAss = async () => {
    try {
      await eng.setSubtitleTrack('no');
      setSid('no');
      setAssAttached(false);
      showAppToast({ title: '已卸下弹幕 ASS' });
    } catch (e) {
      showAppToast({
        title: '卸下失败',
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const matchDanmaku = async () => {
    const state = getTvDetailState();
    const ep = getCurrentEpisodeInfo().episode;
    const hint = [state.vod?.vod_name, ep?.name].filter(Boolean).join(' ');
    try {
      const r = await tryMatchDanmaku({
        fileNameHint: hint || state.vod?.vod_name || 'video',
        playUrl: state.playUrl || undefined,
      });
      if (!r?.danmu.length) {
        setDanmakuInfo(null);
        showAppToast({ title: '未匹配到弹幕', description: hint });
        return;
      }
      setDanmakuInfo({ count: r.danmu.length, label: r.label, danmu: r.danmu });
      const auto = getTvPlayPrefs().libmpvDanmakuAutoAttach;
      if (auto) {
        const ok = await attachAsSub(r.danmu, { silent: true });
        showAppToast({
          title: ok ? `已匹配并挂载 ${r.danmu.length} 条` : `已匹配 ${r.danmu.length} 条`,
          description: ok
            ? `${r.source}: ${r.label}`
            : `${r.source}: ${r.label} · 自动挂载失败，可手动重试`,
        });
      } else {
        showAppToast({
          title: `已匹配 ${r.danmu.length} 条`,
          description: `${r.source}: ${r.label} · 点「挂为 ASS」或开启设置中自动挂载`,
        });
      }
    } catch (e) {
      showAppToast({
        title: '弹幕匹配失败',
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const openMainWithDanmaku = async () => {
    const state = getTvDetailState();
    const url = state.playUrl;
    if (!url) {
      showAppToast({ title: '无播放地址' });
      return;
    }
    const { openDirectArtplayerPlay } = await import('@/stores/tv-hub/detail');
    await openDirectArtplayerPlay({
      url,
      title: state.vod?.vod_name,
    });
    showAppToast({
      title: '已切主路播放',
      description: danmakuInfo()
        ? `可点播控「弹幕」加载（已匹配 ${danmakuInfo()!.count}）`
        : '请在播控点「弹幕」匹配',
    });
  };

  onMount(() => {
    void refresh();
  });

  return (
    <div class={`space-y-2 rounded-md border border-border/60 p-2 ${props.class ?? ''}`}>
      <div class="flex items-center justify-between gap-2">
        <p class="text-xs font-medium">Libmpv 增强播控</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          class="h-7 px-2 text-xs"
          disabled={busy()}
          onClick={() => void refresh()}
        >
          刷新轨 / 章节
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          class="h-7 px-2 text-xs"
          disabled={busy() || getTvPlayPrefs().openingSkipSec <= 0}
          onClick={() => {
            const sec = getTvPlayPrefs().openingSkipSec;
            if (sec <= 0) return;
            void eng.seek(sec).then(() =>
              showAppToast({
                title: '已跳过片头',
                description: `${sec}s`,
              }),
            );
          }}
        >
          跳过片头
        </Button>
      </div>
      <p class="text-[11px] text-muted-foreground">
        增强窗为独立 VO，无 Artplayer 弹幕叠层；完整滚动弹幕请用主路。
      </p>

      <div class="space-y-1">
        <p class="text-[11px] text-muted-foreground">章节（E2.4）</p>
        <Show
          when={chapters().length > 0}
          fallback={
            <p class="text-[11px] text-muted-foreground">当前媒体无章节，或会话未就绪</p>
          }
        >
          <ul class="max-h-36 space-y-0.5 overflow-auto rounded border border-border/40 p-1">
            <For each={chapters()}>
              {(ch) => (
                <li>
                  <button
                    type="button"
                    class="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-muted"
                    onClick={() => {
                      void eng.seek(ch.time).then(() =>
                        showAppToast({
                          title: '已跳转章节',
                          description: `${ch.title} · ${formatChapterTime(ch.time)}`,
                        }),
                      );
                    }}
                  >
                    <span class="w-12 shrink-0 tabular-nums text-muted-foreground">
                      {formatChapterTime(ch.time)}
                    </span>
                    <span class="min-w-0 flex-1 truncate">{ch.title}</span>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>

      <div class="grid gap-2 sm:grid-cols-2">
        <div class="space-y-1">
          <p class="text-[11px] text-muted-foreground">Audio Track</p>
          <AppSelect
            value={aid()}
            onChange={(v) => {
              if (!v) return;
              setAid(v);
              void eng.setAudioTrack(v).then(() =>
                showAppToast({ title: '已切换音轨', description: v }),
              );
            }}
            options={audio().map((t) => t.id)}
            itemComponent={(itemProps) => {
              const t = audio().find((x) => x.id === itemProps.item.rawValue);
              return (
                <AppSelectItem item={itemProps.item}>
                  {t?.label || String(itemProps.item.rawValue)}
                </AppSelectItem>
              );
            }}
            disabled={audio().length === 0}
          >
            <AppSelectTrigger
              layout="form"
              class="h-8"
              aria-label="Audio Track"
              disabled={audio().length === 0}
            >
              <AppSelectValue>
                {(sel) => {
                  const id = String(sel.selectedOption() ?? '');
                  return audio().find((t) => t.id === id)?.label || id || 'No Audio';
                }}
              </AppSelectValue>
              <AppSelectIcon />
            </AppSelectTrigger>
            <AppSelectContent>
              <AppSelectListbox />
            </AppSelectContent>
          </AppSelect>
        </div>

        <div class="space-y-1">
          <p class="text-[11px] text-muted-foreground">Subtitle Track</p>
          <AppSelect
            value={sid()}
            onChange={(v) => {
              const id = v || 'no';
              setSid(id);
              void eng.setSubtitleTrack(id).then(() =>
                showAppToast({ title: '已切换字幕', description: id }),
              );
            }}
            options={['no', ...subs().map((t) => t.id)]}
            itemComponent={(itemProps) => {
              const raw = String(itemProps.item.rawValue);
              if (raw === 'no') {
                return <AppSelectItem item={itemProps.item}>Off</AppSelectItem>;
              }
              const t = subs().find((x) => x.id === raw);
              return (
                <AppSelectItem item={itemProps.item}>
                  {t?.label || raw}
                </AppSelectItem>
              );
            }}
          >
            <AppSelectTrigger layout="form" class="h-8" aria-label="Subtitle Track">
              <AppSelectValue>
                {(sel) => {
                  const id = String(sel.selectedOption() ?? 'no');
                  if (id === 'no') return 'Off';
                  return subs().find((t) => t.id === id)?.label || id;
                }}
              </AppSelectValue>
              <AppSelectIcon />
            </AppSelectTrigger>
            <AppSelectContent>
              <AppSelectListbox />
            </AppSelectContent>
          </AppSelect>
        </div>
      </div>

      <div class="space-y-1">
        <p class="text-[11px] text-muted-foreground">Volume / Listen</p>
        <div class="flex flex-wrap items-center gap-2">
          <input
            type="range"
            min={0}
            max={100}
            value={volume()}
            class="h-8 min-w-[8rem] flex-1"
            aria-label="Volume"
            onInput={(e) => {
              const v = Number((e.currentTarget as HTMLInputElement).value);
              void pushAudio({ volume: v });
            }}
          />
          <span class="w-8 text-xs tabular-nums">{Math.round(volume())}</span>
          <label class="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={muted()}
              onChange={(e) => void pushAudio({ muted: e.currentTarget.checked })}
            />
            Mute
          </label>
          <label class="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={listenOnly()}
              onChange={(e) => void pushAudio({ listenOnly: e.currentTarget.checked })}
            />
            听视频
          </label>
        </div>
      </div>

      <div class="space-y-1">
        <p class="text-[11px] text-muted-foreground">Equalizer（E2.5）</p>
        <AppSelect
          value={eqPreset()}
          onChange={(v) => {
            const p = (v || 'off') as AudioEqPreset;
            setEqPreset(p);
            setVideoPlaybackPrefs({ audioEqPreset: p });
            void applyAudioEqLive()
              .then(() =>
                showAppToast({
                  title: '均衡器已更新',
                  description: AUDIO_EQ_PRESET_LABELS[p],
                }),
              )
              .catch((e) =>
                showAppToast({
                  title: '均衡器更新失败',
                  description: e instanceof Error ? e.message : String(e),
                }),
              );
          }}
          options={[...AUDIO_EQ_PRESET_OPTIONS]}
          itemComponent={(itemProps) => (
            <AppSelectItem item={itemProps.item}>
              {AUDIO_EQ_PRESET_LABELS[itemProps.item.rawValue as AudioEqPreset] ??
                String(itemProps.item.rawValue)}
            </AppSelectItem>
          )}
        >
          <AppSelectTrigger layout="form" class="h-8" aria-label="Equalizer">
            <AppSelectValue>
              {(sel) =>
                AUDIO_EQ_PRESET_LABELS[
                  String(sel.selectedOption() ?? 'off') as AudioEqPreset
                ] ?? 'Off'
              }
            </AppSelectValue>
            <AppSelectIcon />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectListbox />
          </AppSelectContent>
        </AppSelect>
      </div>

      <div class="space-y-1 rounded border border-border/40 p-2">
        <div class="flex items-center justify-between gap-2">
          <p class="text-[11px] font-medium text-muted-foreground">RIFE 实时补帧</p>
          <AppSwitch
            checked={rifeOn()}
            disabled={!rifeOk() && !rifeOn()}
            onChange={(checked) => {
              setRifeOn(checked);
              setVideoPlaybackPrefs({ frameInterpEnabled: checked });
              if (checked) setMode('off');
              void applyFrameInterpLive()
                .then(() =>
                  showAppToast({
                    title: checked ? '已开启 RIFE' : '已关闭 RIFE',
                    description: checked
                      ? '与 Anime4K 互斥；已强制 VO=GPU'
                      : undefined,
                  }),
                )
                .catch((e) =>
                  showAppToast({
                    title: 'RIFE 热切换失败',
                    description: e instanceof Error ? e.message : String(e),
                  }),
                )
                .finally(() => void refresh());
            }}
          >
            <AppSwitchControl>
              <AppSwitchThumb />
            </AppSwitchControl>
          </AppSwitch>
        </div>
        <AppSelect
          value={String(rifeFactor())}
          onChange={(v) => {
            const n = Number(v || '2');
            const factor = n === 3 || n === 4 ? n : 2;
            setRifeFactor(factor);
            setVideoPlaybackPrefs({ frameInterpFactor: factor });
            if (rifeOn()) {
              void applyFrameInterpLive()
                .then(() =>
                  showAppToast({
                    title: '补帧倍率已更新',
                    description: `×${factor}`,
                  }),
                )
                .catch((e) =>
                  showAppToast({
                    title: '补帧倍率失败',
                    description: e instanceof Error ? e.message : String(e),
                  }),
                );
            }
          }}
          options={['2', '3', '4']}
          disabled={!rifeOn()}
          itemComponent={(itemProps) => (
            <AppSelectItem item={itemProps.item}>
              ×{String(itemProps.item.rawValue)}
            </AppSelectItem>
          )}
        >
          <AppSelectTrigger layout="form" class="h-8" aria-label="RIFE factor" disabled={!rifeOn()}>
            <AppSelectValue>
              {(sel) => `×${String(sel.selectedOption() ?? rifeFactor())}`}
            </AppSelectValue>
            <AppSelectIcon />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectListbox />
          </AppSelectContent>
        </AppSelect>
        <Show when={!rifeOk()}>
          <p class="text-[11px] text-muted-foreground">
            {rifeDetail() || 'RIFE 运行时不可用'}
          </p>
        </Show>
      </div>

      <div class="space-y-1">
        <p class="text-[11px] text-muted-foreground">Anime4K Mode（热切换）</p>
        <AppSelect
          value={mode()}
          onChange={(v) => {
            const m = (v || 'off') as Anime4KMode;
            setMode(m);
            setVideoPlaybackPrefs({ anime4kMode: m });
            if (m !== 'off') {
              setRifeOn(false);
              setVideoPlaybackPrefs({ frameInterpEnabled: false });
            }
            void applyAnime4KModeLive(m)
              .then(() =>
                showAppToast({
                  title: 'Anime4K 已更新',
                  description: ANIME4K_MODE_LABELS[m],
                }),
              )
              .catch((e) =>
                showAppToast({
                  title: 'Anime4K 热切换失败',
                  description: e instanceof Error ? e.message : String(e),
                }),
              )
              .finally(() => void refresh());
          }}
          options={[...ANIME4K_MODE_OPTIONS]}
          itemComponent={(itemProps) => (
            <AppSelectItem item={itemProps.item}>
              {ANIME4K_MODE_LABELS[itemProps.item.rawValue as Anime4KMode] ??
                String(itemProps.item.rawValue)}
            </AppSelectItem>
          )}
          disabled={!a4kOk() || rifeOn()}
        >
          <AppSelectTrigger
            layout="form"
            class="h-8"
            aria-label="Anime4K Mode"
            disabled={!a4kOk() || rifeOn()}
          >
            <AppSelectValue>
              {(sel) =>
                ANIME4K_MODE_LABELS[String(sel.selectedOption() ?? 'off') as Anime4KMode] ??
                'Off'
              }
            </AppSelectValue>
            <AppSelectIcon />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectListbox />
          </AppSelectContent>
        </AppSelect>
        <Show when={!a4kOk() || rifeOn()}>
          <p class="text-[11px] text-muted-foreground">
            {rifeOn() ? '已开 RIFE，Anime4K 已禁用' : '当前设置下 Anime4K 不可用'}
          </p>
        </Show>
      </div>

      <div class="space-y-1 rounded border border-border/40 p-2">
        <p class="text-[11px] font-medium text-muted-foreground">
          弹幕 ASS（增强窗 · 非 VO 挖洞）
        </p>
        <div class="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            class="h-7 text-xs"
            onClick={() => void matchDanmaku()}
          >
            匹配弹幕
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            class="h-7 text-xs"
            disabled={!danmakuInfo()}
            onClick={() => void attachAsSub()}
          >
            挂为 ASS
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            class="h-7 text-xs"
            disabled={!assAttached()}
            onClick={() => void detachAss()}
          >
            卸下 ASS
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            class="h-7 text-xs"
            onClick={() => void openMainWithDanmaku()}
          >
            主路打开
          </Button>
        </div>
        <Show when={danmakuInfo()}>
          {(d) => (
            <p class="text-[11px] text-muted-foreground">
              已匹配 {d().count} 条 · {d().label}
              {assAttached() ? ' · 已挂载' : ''}
            </p>
          )}
        </Show>
      </div>

      <Show when={subs().length === 0 && audio().length === 0}>
        <p class="text-[11px] text-muted-foreground">
          无活动会话或轨列表为空：请先点「增强」打开 Libmpv 窗后再刷新。
        </p>
      </Show>
    </div>
  );
}
