/**
 * 歌词展示（LRC / 多轨 / lxlyric 逐字，对齐 lx）
 * - 原文/翻译/罗马音按时间戳合并到同一行
 * - 拖拽/滚轮手动浏览：暂停自动跟随，约 3s 后恢复（对齐 lx useLyric）
 * - 可选进度预览线（elementFromPoint）+ 确认跳转
 */

import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  type Component,
} from 'solid-js';
import { Play } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { LyricBundle, LyricTrackKind } from '@/lib/media/audio/lyric-types';
import { pickLyricText } from '@/lib/media/audio/lyric-types';
import { buildLyricTextEffectStyle } from '@/lib/media/audio/lyric-text-shadow';
import type { MusicLyricLayout } from '@/lib/media/audio/music-settings';
import {
  computeLyricScrollTop,
  LYRIC_SCROLL_ANCHOR,
} from '@/lib/media/audio/lyric-scroll';
import { settingsStore } from '@/stores/settings';
import {
  LRC_TIME_TAG_RE,
  parseLrcTimeTagToMs,
} from '@/lib/media/audio/lrc-time';

interface LxWord {
  timeMs: number;
  durationMs: number;
  text: string;
}

interface ParsedLine {
  timeMs: number;
  text: string;
  words: LxWord[] | null;
  raw: string;
}

interface MergedLine {
  timeMs: number;
  text: string;
  words: LxWord[] | null;
  extended: string[];
}

/** 对齐 lx line-player + MusicFree 秒制标签 */
function parseTimeTag(tag: string): number | null {
  return parseLrcTimeTagToMs(tag);
}

function parseLxWords(lineBody: string, lineStartMs: number): LxWord[] | null {
  const words: LxWord[] = [];
  const re = /<(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)>([^<]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(lineBody)) !== null) {
    words.push({
      timeMs: lineStartMs + Math.round(Number(m[1])),
      durationMs: Math.max(0, Math.round(Number(m[2]))),
      text: m[3] ?? '',
    });
  }
  // 无逐字标签 → 行模式，不做假逐字
  return words.length > 0 ? words : null;
}

/** 无逐字轨时：句持续时间内按字均分（对齐卡拉 OK 降级） */
function synthesizeEqualWords(
  text: string,
  startMs: number,
  durationMs: number,
): LxWord[] | null {
  const chars = Array.from(text);
  if (chars.length === 0 || durationMs <= 0) return null;
  const each = durationMs / chars.length;
  return chars.map((ch, i) => ({
    timeMs: startMs + Math.round(i * each),
    durationMs: Math.max(1, Math.round(each)),
    text: ch,
  }));
}

function attachKaraokeWords(
  lines: ParsedLine[],
  karaoke: boolean,
): ParsedLine[] {
  if (!karaoke) {
    return lines.map((line) => ({ ...line, words: null }));
  }
  if (lines.length === 0) return lines;
  return lines.map((line, i) => {
    if (line.words && line.words.length > 0) return line;
    const next = lines[i + 1];
    const durationMs = next
      ? Math.max(200, next.timeMs - line.timeMs)
      : 4000;
    return {
      ...line,
      words: synthesizeEqualWords(line.text, line.timeMs, durationMs),
    };
  });
}

function parseTimedLines(lyric: string, asLx: boolean): ParsedLine[] {
  const lines = lyric.split(/\r?\n/);
  const parsed: ParsedLine[] = [];
  for (const line of lines) {
    const matches = [...line.matchAll(LRC_TIME_TAG_RE)];
    if (matches.length === 0) continue;
    const body = line.replace(LRC_TIME_TAG_RE, '');
    const text = body.replace(/<\d+(?:\.\d+)?,\d+(?:\.\d+)?>/g, '').trim();
    if (!text && !asLx) continue;
    for (const m of matches) {
      const timeMs = parseTimeTag(m[0]!);
      if (timeMs == null) continue;
      parsed.push({
        timeMs,
        text: text || body.trim(),
        words: asLx ? parseLxWords(body, timeMs) : null,
        raw: line,
      });
    }
  }
  parsed.sort((a, b) => a.timeMs - b.timeMs);
  return parsed;
}

function nearestLineText(lines: ParsedLine[], timeMs: number, windowMs = 1200): string | null {
  if (lines.length === 0) return null;
  let best: ParsedLine | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    const delta = Math.abs(line.timeMs - timeMs);
    if (delta < bestDelta) {
      best = line;
      bestDelta = delta;
    }
    if (line.timeMs > timeMs + windowMs) break;
  }
  if (!best || bestDelta > windowMs) return null;
  return best.text || null;
}

function formatPreviewTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** 对齐 lx FontPlayer：字内 background-size 线性推进 */
function wordFillPercent(word: LxWord, posMs: number): number {
  if (posMs < word.timeMs) return 0;
  if (word.durationMs <= 0) return posMs >= word.timeMs ? 100 : 0;
  return Math.max(0, Math.min(100, ((posMs - word.timeMs) / word.durationMs) * 100));
}

function karaokeWordStyle(
  fillPercent: number,
  playedColor: string,
  unplayedColor: string,
  vertical: boolean,
): Record<string, string> {
  const size = vertical ? `100% ${fillPercent}%` : `${fillPercent}% 100%`;
  return {
    display: 'inline-block',
    color: unplayedColor,
    'background-color': unplayedColor,
    'background-image': `linear-gradient(to ${vertical ? 'bottom' : 'right'}, ${playedColor}, ${playedColor})`,
    'background-repeat': 'no-repeat',
    'background-size': size,
    '-webkit-background-clip': 'text',
    'background-clip': 'text',
    '-webkit-text-fill-color': 'transparent',
  };
}

export interface AudioLyricPanelProps {
  lyric?: string | null;
  bundle?: LyricBundle | null;
  lyricTrack?: LyricTrackKind;
  positionSec: number;
  /** 播放中时用 rAF 插值，保证卡拉 OK 扫光流畅 */
  playing?: boolean;
  lyricOffset?: number;
  class?: string;
  showTranslation?: boolean;
  showRoma?: boolean;
  secondaryOrder?: 'translation-first' | 'roma-first';
  align?: 'left' | 'center' | 'right' | 'justify';
  /** 字号（rem，默认约 0.875 ≈ 14px @16px 根字号） */
  fontSize?: number;
  zoomActiveLyric?: boolean;
  /**
   * 当前行视觉缩放倍率（仅 transform，不改字号/布局，避免放大换行导致滚动错位）。
   * 默认 1.28；1 表示不放大。
   */
  zoomActiveScale?: number;
  onSeek?: (positionSec: number) => void;
  /** 开启后：手动浏览显示时间预览线并可确认跳转（对齐 playDetail.isShowLyricProgressSetting） */
  allowProgressPreview?: boolean;
  /** 拖拽松手后自动跳转播放（默认关闭） */
  autoPlayOnRelease?: boolean;
  /** 双击歌词行跳转到对应进度 */
  doubleClickSeek?: boolean;
  /** 用于预览跳转时钳制上限（对齐 playProgress.maxPlayTime） */
  durationSec?: number;
  singleLine?: boolean;
  /** 歌词布局（优先于 singleLine） */
  layout?: MusicLyricLayout;
  maxLines?: number;
  playedColor?: string;
  unplayedColor?: string;
  /** 未播放描边/外发光 */
  unplayedShadowEnabled?: boolean;
  unplayedShadowColor?: string;
  /** 已播放描边/外发光 */
  playedShadowEnabled?: boolean;
  playedShadowColor?: string;
  /** @deprecated 使用 unplayedShadowEnabled */
  textShadow?: boolean;
  /** @deprecated 使用 unplayedShadowColor */
  shadowColor?: string;
  scrollDelayMs?: number;
  scrollPosition?: 'top' | 'center' | 'bottom';
  fontFamily?: string;
  lineHeight?: number;
  bold?: boolean;
  /** 逐字歌词加粗（对齐 LX isFontWeightFont） */
  boldFont?: boolean;
  /** 逐行歌词加粗（对齐 LX isFontWeightLine） */
  boldLine?: boolean;
  /** 翻译/罗马音加粗（对齐 LX isFontWeightExtended） */
  boldExtended?: boolean;
  /** 行间距 px（对齐 LX lineGap） */
  lineGap?: number;
  wrap?: boolean;
  direction?: 'horizontal' | 'vertical';
  emptyText?: string;
  loading?: boolean;
  errorText?: string | null;
  active?: boolean;
  /** 透明底（桌面歌词）：下层背景可见，需加强描边避免叠浅色底发糊 */
  transparentBackdrop?: boolean;
  /**
   * 卡拉 OK 模式（对齐 lx isPlayLxlrc）：
   * 有逐字标签则扫光；无则按句时长均分每个字。
   */
  karaokeMode?: boolean;
}

export const AudioLyricPanel: Component<AudioLyricPanelProps> = (props) => {
  let container: HTMLDivElement | undefined;
  let skipLineEl: HTMLDivElement | undefined;
  let scrollTimer: ReturnType<typeof setTimeout> | undefined;
  let resumeTimer: ReturnType<typeof setTimeout> | undefined;
  let msDown = false;
  let msDownY = 0;
  let msDownScrollY = 0;
  let didDrag = false;
  let skipHover = false;
  let lastPreviewEl: Element | null = null;
  const DRAG_THRESHOLD_PX = 5;

  const [userBrowsing, setUserBrowsing] = createSignal(false);
  const [dragging, setDragging] = createSignal(false);
  const [previewTimeSec, setPreviewTimeSec] = createSignal<number | null>(null);
  const [smoothPositionSec, setSmoothPositionSec] = createSignal(props.positionSec);

  const lyricLineGap = () => {
    const gap = props.lineGap;
    if (typeof gap === 'number' && Number.isFinite(gap)) return Math.max(0, gap);
    return undefined;
  };
  const lyricLayout = (): MusicLyricLayout =>
    props.layout ?? (props.singleLine ? 'single' : 'default');

  const dualLineTextAlign = (side: 'top' | 'bottom'): 'left' | 'center' | 'right' => {
    const align = props.align ?? 'center';
    if (align === 'justify') return side === 'top' ? 'left' : 'right';
    return align;
  };

  const shadowEnabled = (isActive: boolean) =>
    isActive
      ? (props.playedShadowEnabled ?? props.textShadow ?? false)
      : (props.unplayedShadowEnabled ?? props.textShadow ?? false);

  const shadowColorFor = (isActive: boolean) =>
    isActive
      ? (props.playedShadowColor ?? props.shadowColor)
      : (props.unplayedShadowColor ?? props.shadowColor);

  const lineEffectStyle = (isActive: boolean) =>
    buildLyricTextEffectStyle({
      enabled: shadowEnabled(isActive),
      shadowColor: shadowColorFor(isActive),
      transparentBackdrop: props.transparentBackdrop,
      mode: 'line',
      direction: props.direction,
    });

  const wordEffectStyle = (isActive: boolean) =>
    buildLyricTextEffectStyle({
      enabled: shadowEnabled(isActive),
      shadowColor: shadowColorFor(isActive),
      transparentBackdrop: props.transparentBackdrop,
      mode: 'font',
      direction: props.direction,
    });

  const lineTextColor = (isActive: boolean) => {
    const raw = isActive ? props.playedColor : props.unplayedColor;
    return raw?.trim() ? raw : undefined;
  };
  const weightFont = () =>
    (props.boldFont ?? props.bold) ? '700' : undefined;
  const weightLine = () =>
    (props.boldLine ?? props.bold) ? '700' : undefined;
  const weightExtended = () =>
    (props.boldExtended ?? props.bold) ? '700' : undefined;

  const reduceMotion = () => settingsStore.state.app.reduceMotion === true;
  const followScrollBehavior = (): ScrollBehavior =>
    reduceMotion() ? 'auto' : 'smooth';

  const primaryKind = () => props.lyricTrack ?? 'lyric';

  const primaryRaw = createMemo(() => {
    if (props.lyric?.trim()) return props.lyric;
    return pickLyricText(props.bundle, primaryKind()) ?? '';
  });

  const karaokeMode = () => props.karaokeMode === true;
  /** 开启卡拉 OK 时即启用扫光插值（含无逐字时的均分降级） */
  const useKaraoke = createMemo(() => karaokeMode());

  /**
   * 卡拉 OK 墙钟插值：主窗/桌面歌词的 positionSec 刷新往往落后于墙钟预测，
   * 若每次都用新 base 重置会出现扫光「倒退」。仅在前进或大跳（seek）时重锚。
   */
  let karaokeAnchorSec = props.positionSec;
  let karaokeAnchorAt = performance.now();
  let karaokeRaf = 0;
  const stopKaraokeRaf = () => {
    if (!karaokeRaf) return;
    cancelAnimationFrame(karaokeRaf);
    karaokeRaf = 0;
  };
  const startKaraokeRaf = () => {
    if (karaokeRaf) return;
    const tick = () => {
      setSmoothPositionSec(
        karaokeAnchorSec + (performance.now() - karaokeAnchorAt) / 1000,
      );
      karaokeRaf = requestAnimationFrame(tick);
    };
    karaokeRaf = requestAnimationFrame(tick);
  };

  createEffect(() => {
    const base = props.positionSec;
    const playing = props.playing === true && useKaraoke();
    if (!playing) {
      stopKaraokeRaf();
      karaokeAnchorSec = base;
      karaokeAnchorAt = performance.now();
      setSmoothPositionSec(base);
      return;
    }

    const now = performance.now();
    const predicted = karaokeAnchorSec + (now - karaokeAnchorAt) / 1000;
    const drift = base - predicted;
    // 大跳（seek / 换曲）或明显超前：重锚；轻微落后：忽略，继续墙钟前进
    if (Math.abs(drift) > 0.75 || drift > 0.04) {
      karaokeAnchorSec = base;
      karaokeAnchorAt = now;
      setSmoothPositionSec(base);
    }
    startKaraokeRaf();
  });

  onCleanup(stopKaraokeRaf);

  const positionMs = createMemo(
    () => (smoothPositionSec() + (props.lyricOffset ?? 0)) * 1000,
  );

  const primaryLines = createMemo(() => {
    const raw = primaryRaw().trim();
    if (!raw) return [] as ParsedLine[];
    const parsed = parseTimedLines(raw, karaokeMode());
    return attachKaraokeWords(parsed, karaokeMode());
  });

  const translationLines = createMemo(() => {
    if (props.showTranslation === false) return [] as ParsedLine[];
    const raw = props.bundle?.tlyric?.trim();
    if (!raw) return [] as ParsedLine[];
    return parseTimedLines(raw, false);
  });

  const romaLines = createMemo(() => {
    if (props.showRoma === false) return [] as ParsedLine[];
    const raw = props.bundle?.rlyric?.trim();
    if (!raw) return [] as ParsedLine[];
    return parseTimedLines(raw, false);
  });

  const mergedLines = createMemo((): MergedLine[] => {
    const primary = primaryLines();
    if (primary.length === 0) return [];
    const kind = primaryKind();
    const tLines = translationLines();
    const rLines = romaLines();
    const order = props.secondaryOrder === 'roma-first' ? (['roma', 'translation'] as const) : (['translation', 'roma'] as const);

    return primary.map((line) => {
      const extended: string[] = [];
      // 主轨为翻译/罗马音时，副轨优先显示原文
      if (kind === 'tlyric' || kind === 'rlyric') {
        const original = props.bundle?.lyric?.trim()
          ? nearestLineText(parseTimedLines(props.bundle.lyric, false), line.timeMs)
          : null;
        if (original) extended.push(original);
      }
      for (const which of order) {
        if (kind === 'tlyric' && which === 'translation') continue;
        if (kind === 'rlyric' && which === 'roma') continue;
        const text =
          which === 'translation'
            ? nearestLineText(tLines, line.timeMs)
            : nearestLineText(rLines, line.timeMs);
        if (text) extended.push(text);
      }
      return {
        timeMs: line.timeMs,
        text: line.text,
        words: line.words,
        extended,
      };
    });
  });

  const activeIndex = createMemo(() => {
    const lines = mergedLines();
    if (lines.length === 0) return -1;
    const posMs = positionMs();
    if (posMs < lines[0]!.timeMs) return -1;
    let idx = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.timeMs <= posMs) idx = i;
      else break;
    }
    return idx;
  });

  const karaokePlayedColor = () => props.playedColor?.trim() || 'hsl(var(--primary))';
  const karaokeUnplayedColor = () =>
    props.unplayedColor?.trim() || 'hsl(var(--muted-foreground) / 0.45)';
  const karaokeVertical = () => props.direction === 'vertical';

  /**
   * 用行下标（primitive）驱动 For，避免每次新建 {line,index} 对象导致整表重挂载，
   * 否则 font-size/transform 过渡永远不会播放。
   */
  const visibleIndices = createMemo(() => {
    const lines = mergedLines();
    const active = Math.max(0, activeIndex());
    if (lyricLayout() === 'single') {
      const idx = activeIndex();
      if (idx < 0 || !lines[idx]) return [] as number[];
      return [idx];
    }
    if (lyricLayout() === 'dual') {
      return [] as number[];
    }
    if (props.singleLine) {
      const idx = activeIndex();
      if (idx < 0 || !lines[idx]) return [] as number[];
      return [idx];
    }
    const maxLines = Math.max(0, Math.floor(props.maxLines ?? 0));
    // 指定 maxLines（桌面歌词）时始终裁窗，避免全量 DOM + 描边拖死 WebView
    if (maxLines > 0 && lines.length > maxLines) {
      const start = Math.max(
        0,
        Math.min(lines.length - maxLines, active - Math.floor(maxLines / 2)),
      );
      const out: number[] = [];
      for (let i = 0; i < maxLines && start + i < lines.length; i++) out.push(start + i);
      return out;
    }
    return lines.map((_, i) => i);
  });

  const useFullScrollLayout = () => {
    if (lyricLayout() === 'single' || lyricLayout() === 'dual') return false;
    return !(props.maxLines != null && props.maxLines > 0);
  };

  const dualLineIndices = createMemo(() => {
    if (lyricLayout() !== 'dual') return null;
    const lines = mergedLines();
    const active = activeIndex();
    if (lines.length === 0) return null;
    const right = active >= 0 ? active : 0;
    const left = right > 0 ? right - 1 : null;
    return { left, right };
  });

  /** keep-alive 隐藏时为 false；再次进入详情需瞬时对齐当前行 */
  let panelWasActive = false;
  let layoutRetryRaf = 0;
  let scrollAnimRaf = 0;
  const [containerEl, setContainerEl] = createSignal<HTMLDivElement | undefined>();

  const clearResumeTimer = () => {
    if (!resumeTimer) return;
    clearTimeout(resumeTimer);
    resumeTimer = undefined;
  };

  const cancelScrollAnim = () => {
    if (!scrollAnimRaf) return;
    cancelAnimationFrame(scrollAnimRaf);
    scrollAnimRaf = 0;
  };

  /** 自定义缓动滚动，比浏览器默认 smooth 更明显（约 420ms） */
  const animateScrollTop = (el: HTMLElement, target: number, durationMs: number) => {
    cancelScrollAnim();
    const start = el.scrollTop;
    const delta = target - start;
    if (Math.abs(delta) < 0.5) {
      el.scrollTop = target;
      return;
    }
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / durationMs);
      // ease-out cubic
      const eased = 1 - (1 - t) ** 3;
      el.scrollTop = start + delta * eased;
      if (t < 1) {
        scrollAnimRaf = requestAnimationFrame(step);
      } else {
        scrollAnimRaf = 0;
        el.scrollTop = target;
      }
    };
    scrollAnimRaf = requestAnimationFrame(step);
  };

  const scrollActiveIntoView = (behavior: ScrollBehavior = followScrollBehavior()) => {
    if (!container || userBrowsing()) return false;
    const active = container.querySelector<HTMLElement>('[data-lyric-active="true"]');
    if (!active) {
      cancelScrollAnim();
      container.scrollTop = 0;
      // 无高亮行（尚未到首句 / 歌词未渲染）：已置顶；歌词就绪后由 activeIndex effect 再滚
      return true;
    }
    if (useFullScrollLayout()) {
      // 容器高度为 0（section hidden / 首帧未布局）时滚动无效，需等布局后再滚
      if (container.clientHeight <= 0) return false;
      const target = computeLyricScrollTop(active.offsetTop, container.clientHeight);
      if (behavior === 'auto' || reduceMotion()) {
        cancelScrollAnim();
        container.scrollTop = target;
      } else {
        animateScrollTop(container, target, 420);
      }
      return true;
    }
    active.scrollIntoView({
      behavior: reduceMotion() ? 'auto' : behavior,
      block:
        props.scrollPosition === 'top'
          ? 'start'
          : props.scrollPosition === 'bottom'
            ? 'end'
            : 'center',
    });
    return true;
  };

  const cancelLayoutRetry = () => {
    if (!layoutRetryRaf) return;
    cancelAnimationFrame(layoutRetryRaf);
    layoutRetryRaf = 0;
  };

  /** 等容器有可测高度后再滚，避免进详情首帧 / 取消 hidden 时滚到错误位置 */
  const scrollWhenLaidOut = (behavior: ScrollBehavior, attemptsLeft = 12) => {
    cancelLayoutRetry();
    const tick = (left: number) => {
      layoutRetryRaf = 0;
      if (props.active === false) return;
      if (scrollActiveIntoView(behavior) || left <= 0) return;
      layoutRetryRaf = requestAnimationFrame(() => tick(left - 1));
    };
    layoutRetryRaf = requestAnimationFrame(() => tick(attemptsLeft));
  };

  const scheduleFollowScroll = () => {
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(
      () => scrollActiveIntoView(followScrollBehavior()),
      Math.max(0, props.scrollDelayMs ?? 0),
    );
  };

  createEffect(() => {
    void activeIndex();
    const isActive = props.active !== false;
    if (!isActive) {
      panelWasActive = false;
      if (scrollTimer) clearTimeout(scrollTimer);
      cancelLayoutRetry();
      return;
    }
    const justActivated = !panelWasActive;
    panelWasActive = true;
    if (justActivated) {
      // 进入详情：清掉 keep-alive 残留的手动浏览态，瞬时跳到当前播放行
      clearResumeTimer();
      setUserBrowsing(false);
      setPreviewTimeSec(null);
      lastPreviewEl = null;
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollWhenLaidOut('auto');
      return;
    }
    scheduleFollowScroll();
  });

  // 容器首次挂载或从零高度恢复时瞬时对齐
  createEffect(() => {
    if (props.active === false) return;
    const el = containerEl();
    if (!el || typeof ResizeObserver === 'undefined') return;
    // 刚挂上 DOM 时先对齐一次（歌词 Show 延迟出现的常见路径）
    queueMicrotask(() => {
      if (props.active !== false && !userBrowsing()) scrollWhenLaidOut('auto');
    });
    let lastHeight = el.clientHeight;
    const ro = new ResizeObserver(() => {
      const next = el.clientHeight;
      if (lastHeight <= 0 && next > 0 && !userBrowsing()) {
        scrollActiveIntoView('auto');
      }
      lastHeight = next;
    });
    ro.observe(el);
    onCleanup(() => ro.disconnect());
  });

  const startResumeTimer = () => {
    clearResumeTimer();
    if (skipHover) return;
    resumeTimer = setTimeout(() => {
      resumeTimer = undefined;
      setUserBrowsing(false);
      setPreviewTimeSec(null);
      lastPreviewEl = null;
      if (props.playing === false) return;
      scrollActiveIntoView(followScrollBehavior());
    }, 3000);
  };

  /** 对齐 lx throttleSetTime：用预览线 elementFromPoint 取行时间 */
  const updatePreviewFromSkipLine = () => {
    if (!props.allowProgressPreview || !props.onSeek || !skipLineEl) {
      setPreviewTimeSec(null);
      return;
    }
    const rect = skipLineEl.getBoundingClientRect();
    let el = document.elementFromPoint(rect.x, rect.y) as HTMLElement | null;
    if (!el) return;
    if (el === lastPreviewEl) return;

    if (el.tagName === 'SPAN') {
      el = (el.parentElement?.parentElement as HTMLElement | null) ?? el;
    }

    const lineEl = el.closest?.('[data-lyric-time]') as HTMLElement | null;
    const spaceEl = el.closest?.('[data-lyric-space]') as HTMLElement | null;

    const lines = mergedLines();
    let timeMs: number | null = null;
    if (lineEl) {
      const raw = Number(lineEl.dataset.lyricTime);
      timeMs = Number.isFinite(raw) ? raw : null;
    } else if (spaceEl?.dataset.lyricSpace === 'pre') {
      timeMs = 0;
    } else if (spaceEl?.dataset.lyricSpace === 'post' || (!lineEl && lines.length > 0)) {
      timeMs = lines[lines.length - 1]?.timeMs ?? 0;
    }

    lastPreviewEl = el;
    if (timeMs == null) {
      setPreviewTimeSec(null);
      return;
    }

    // 对齐 lx：time = max(line.time - offset, 0) / 1000，并钳制到时长
    const offsetSec = props.lyricOffset ?? 0;
    let sec = Math.max(timeMs / 1000 - offsetSec, 0);
    const max = props.durationSec;
    if (typeof max === 'number' && Number.isFinite(max) && max > 0 && sec > max) {
      sec = max;
    }
    setPreviewTimeSec(sec);
  };

  const lineTimeToSeekSec = (timeMs: number): number => {
    const offsetSec = props.lyricOffset ?? 0;
    let sec = Math.max(timeMs / 1000 - offsetSec, 0);
    const max = props.durationSec;
    if (typeof max === 'number' && Number.isFinite(max) && max > 0 && sec > max) {
      sec = max;
    }
    return sec;
  };

  const handleSkipPlay = () => {
    const t = previewTimeSec();
    if (t == null || !props.onSeek) return;
    skipHover = false;
    clearResumeTimer();
    setUserBrowsing(false);
    setPreviewTimeSec(null);
    lastPreviewEl = null;
    props.onSeek(t);
  };

  const seekToLine = (timeMs: number) => {
    if (!props.onSeek) return;
    skipHover = false;
    clearResumeTimer();
    setUserBrowsing(false);
    setPreviewTimeSec(null);
    lastPreviewEl = null;
    props.onSeek(lineTimeToSeekSec(timeMs));
  };

  const handleLyricDown = (y: number) => {
    if (!container) return;
    if (scrollTimer) {
      clearTimeout(scrollTimer);
      scrollTimer = undefined;
    }
    msDown = true;
    didDrag = false;
    setDragging(true);
    msDownY = y;
    msDownScrollY = container.scrollTop;
  };

  const handleMove = (y: number) => {
    if (!msDown || !container) return;
    if (Math.abs(msDownY - y) >= DRAG_THRESHOLD_PX) didDrag = true;
    if (!didDrag) return;
    if (!userBrowsing()) lastPreviewEl = null;
    setUserBrowsing(true);
    cancelScrollAnim();
    container.scrollTop = msDownScrollY + msDownY - y;
    startResumeTimer();
    updatePreviewFromSkipLine();
  };

  const handleUp = () => {
    const shouldAutoPlay =
      msDown &&
      didDrag &&
      props.autoPlayOnRelease === true &&
      props.allowProgressPreview === true &&
      props.onSeek != null;
    msDown = false;
    setDragging(false);
    if (shouldAutoPlay) {
      updatePreviewFromSkipLine();
      handleSkipPlay();
    }
    didDrag = false;
  };

  const handleWheel = (event: WheelEvent) => {
    if (!container) return;
    event.preventDefault();
    if (!userBrowsing()) lastPreviewEl = null;
    setUserBrowsing(true);
    cancelScrollAnim();
    container.scrollTop += event.deltaY;
    startResumeTimer();
    updatePreviewFromSkipLine();
  };

  onMount(() => {
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      if (e.changedTouches.length) handleMove(e.changedTouches[0]!.clientY);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', handleUp);
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', handleUp);
    onCleanup(() => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', handleUp);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', handleUp);
    });
  });

  onCleanup(() => {
    if (scrollTimer) clearTimeout(scrollTimer);
    cancelLayoutRetry();
    cancelScrollAnim();
    clearResumeTimer();
  });

  const hasTimedLyric = () => mergedLines().length > 0;
  const plainText = () => primaryRaw().trim();

  return (
    <div
      class={cn(
        'relative flex min-h-0 w-full flex-1 flex-col overflow-hidden',
        props.class,
      )}
    >
      <Show when={props.loading}>
        <p class="px-3 py-6 text-center text-sm text-muted-foreground">歌词加载中…</p>
      </Show>
      <Show when={!props.loading && props.errorText}>
        <p class="px-3 py-6 text-center text-sm text-destructive">{props.errorText}</p>
      </Show>
      <Show when={!props.loading && !props.errorText && !plainText()}>
        <p class="px-3 py-6 text-center text-sm text-muted-foreground">
          {props.emptyText ?? '暂无歌词'}
        </p>
      </Show>
      <Show when={!props.loading && !props.errorText && plainText()}>
        <div
          ref={(el) => {
            container = el;
            setContainerEl(el);
          }}
          class={cn(
            // 对齐 lx：overflow hidden + 自定义拖拽/滚轮，避免原生滚动条抢交互
            'min-h-0 flex-1 overflow-hidden px-3 py-8 select-none',
            !props.transparentBackdrop &&
              'mask-[linear-gradient(transparent,black_12%,black_88%,transparent)]',
            dragging() ? 'cursor-grabbing' : 'cursor-grab',
            props.align === 'left' && 'text-left',
            props.align === 'right' && 'text-right',
            (!props.align || props.align === 'center') && 'text-center',
          )}
          style={{
            'font-size': `${props.fontSize ?? 0.875}rem`,
            'font-family': props.fontFamily || undefined,
            'line-height': String(props.lineHeight ?? 1.6),
            'font-weight': weightLine(),
            'writing-mode': props.direction === 'vertical' ? 'vertical-rl' : undefined,
          }}
          onWheel={handleWheel}
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            handleLyricDown(e.clientY);
          }}
          onTouchStart={(e) => {
            if (e.changedTouches.length) {
              handleLyricDown(e.changedTouches[0]!.clientY);
            }
          }}
        >
          <Show when={useFullScrollLayout()}>
            <div class="h-[38%]" data-lyric-space="pre" aria-hidden="true" />
          </Show>
          <Show
            when={hasTimedLyric()}
            fallback={
              <p class={props.wrap === false ? 'whitespace-nowrap' : 'whitespace-pre-wrap opacity-80'}>
                {plainText()}
              </p>
            }
          >
            <Show
              when={lyricLayout() === 'dual' && dualLineIndices()}
              fallback={
            <ul
              class="overflow-visible"
              style={{
                display: 'flex',
                'flex-direction': 'column',
                gap: lyricLineGap() != null ? `${lyricLineGap()}px` : undefined,
              }}
              classList={{
                'space-y-3': lyricLineGap() == null,
              }}
            >
              <For each={visibleIndices()}>
                {(originalIndex) => {
                  const line = () => mergedLines()[originalIndex]!;
                  const isActive = () => activeIndex() === originalIndex;
                  const zoom = () =>
                    isActive() && props.zoomActiveLyric !== false;
                  const zoomScale = () => {
                    const s = props.zoomActiveScale ?? 1.28;
                    return Math.max(1, Math.min(1.8, s));
                  };
                  const origin =
                    props.align === 'left'
                      ? 'left center'
                      : props.align === 'right'
                        ? 'right center'
                        : 'center center';
                  const lineUsesKaraokeWords = () =>
                    isActive() && line()?.words && line()!.words!.length > 0;
                  return (
                    <li
                      data-lyric-active={isActive() ? 'true' : undefined}
                      data-lyric-time={String(line()?.timeMs ?? 0)}
                      class={cn(
                        props.transparentBackdrop ? 'overflow-hidden' : 'overflow-visible',
                        (props.doubleClickSeek ||
                          (props.onSeek && !props.allowProgressPreview)) &&
                          'cursor-pointer hover:opacity-90',
                        isActive()
                          ? 'font-medium text-foreground'
                          : 'text-muted-foreground/70',
                        !reduceMotion() &&
                          !props.transparentBackdrop &&
                          'transition-[color,opacity] duration-420 ease-out',
                      )}
                      style={{
                        color: lineTextColor(isActive()),
                        opacity: isActive() ? '1' : '0.62',
                        ...(lineUsesKaraokeWords() ? {} : (lineEffectStyle(isActive()) ?? {})),
                        'white-space':
                          props.wrap === false ? 'nowrap' : 'normal',
                      }}
                      onClick={() => {
                        if (
                          !props.onSeek ||
                          props.allowProgressPreview ||
                          props.doubleClickSeek
                        )
                          return;
                        seekToLine(line()!.timeMs);
                      }}
                      onDblClick={(e) => {
                        if (!props.doubleClickSeek || !props.onSeek) return;
                        e.preventDefault();
                        e.stopPropagation();
                        seekToLine(line()!.timeMs);
                      }}
                    >
                      {/*
                        仅用 transform 放大：不改变布局宽高与换行，避免放大变多行、
                        缩小回单行后 offsetTop/滚动锚点错乱。
                      */}
                      <div
                        class={cn(
                          'inline-block max-w-full',
                          !reduceMotion() &&
                            !props.transparentBackdrop &&
                            'transition-transform duration-420 ease-out',
                          props.transparentBackdrop && 'will-change-transform',
                        )}
                        style={{
                          transform: zoom()
                            ? `scale(${zoomScale()})`
                            : 'scale(1)',
                          'transform-origin': origin,
                        }}
                      >
                        <Show
                          when={
                            isActive() &&
                            line()?.words &&
                            line()!.words!.length > 0
                              ? line()!.words!
                              : false
                          }
                          fallback={
                            <span style={{ 'font-weight': weightLine() }}>{line()?.text}</span>
                          }
                        >
                          {(words) => (
                            <span class="relative inline-block max-w-full">
                              <span class="relative">
                                <For each={words()}>
                                  {(w) => (
                                    <span
                                      style={{
                                        ...karaokeWordStyle(
                                          wordFillPercent(w, positionMs()),
                                          karaokePlayedColor(),
                                          karaokeUnplayedColor(),
                                          karaokeVertical(),
                                        ),
                                        ...(wordEffectStyle(true) ?? {}),
                                        'font-weight': weightFont(),
                                      }}
                                    >
                                      {w.text}
                                    </span>
                                  )}
                                </For>
                              </span>
                            </span>
                          )}
                        </Show>
                        <For each={line()?.extended ?? []}>
                          {(ext) => (
                            <p
                              class="mt-0.5 text-[0.85em] leading-snug opacity-70"
                              style={{
                                'font-weight': weightExtended(),
                                ...(lineEffectStyle(isActive()) ?? {}),
                              }}
                            >
                              {ext}
                            </p>
                          )}
                        </For>
                      </div>
                    </li>
                  );
                }}
              </For>
            </ul>
              }
            >
              {(pair) => {
                const renderDualLine = (
                  index: number | null,
                  side: 'top' | 'bottom',
                ) => {
                  const textAlign = dualLineTextAlign(side);
                  if (index == null) {
                    return (
                      <div
                        class={cn(
                          'w-full',
                          textAlign === 'left'
                            ? 'text-left'
                            : textAlign === 'right'
                              ? 'text-right'
                              : 'text-center',
                        )}
                      />
                    );
                  }
                  const line = () => mergedLines()[index]!;
                  const isActive = () => activeIndex() === index;
                  const lineUsesKaraokeWords = () =>
                    isActive() && line()?.words && line()!.words!.length > 0;
                  return (
                    <div
                      class={cn(
                        'w-full',
                        textAlign === 'left'
                          ? 'text-left'
                          : textAlign === 'right'
                            ? 'text-right'
                            : 'text-center',
                        isActive() ? 'font-medium' : 'opacity-[0.62]',
                      )}
                      style={{
                        color: lineTextColor(isActive()),
                        ...(lineUsesKaraokeWords() ? {} : (lineEffectStyle(isActive()) ?? {})),
                      }}
                    >
                      <Show
                        when={
                          lineUsesKaraokeWords() && line()?.words && line()!.words!.length > 0
                            ? line()!.words!
                            : false
                        }
                        fallback={<span style={{ 'font-weight': weightLine() }}>{line()?.text}</span>}
                      >
                        {(words) => (
                          <span class="inline-block max-w-full">
                            <For each={words()}>
                              {(w) => (
                                <span
                                  style={{
                                    ...karaokeWordStyle(
                                      wordFillPercent(w, positionMs()),
                                      karaokePlayedColor(),
                                      karaokeUnplayedColor(),
                                      karaokeVertical(),
                                    ),
                                    ...(wordEffectStyle(true) ?? {}),
                                    'font-weight': weightFont(),
                                  }}
                                >
                                  {w.text}
                                </span>
                              )}
                            </For>
                          </span>
                        )}
                      </Show>
                    </div>
                  );
                };
                return (
                  <div
                    class="flex w-full flex-col px-1"
                    style={{ gap: lyricLineGap() != null ? `${lyricLineGap()}px` : '0.75rem' }}
                  >
                    {renderDualLine(pair().left, 'top')}
                    {renderDualLine(pair().right, 'bottom')}
                  </div>
                );
              }}
            </Show>
          </Show>
          <Show when={useFullScrollLayout()}>
            <div class="h-[38%]" data-lyric-space="post" aria-hidden="true" />
          </Show>
        </div>
      </Show>

      {/* 对齐 lx：设置开启时始终挂载预览线，供 elementFromPoint；仅浏览时显示 */}
      <Show when={props.allowProgressPreview && props.onSeek}>
        <div
          class={cn(
            'pointer-events-none absolute inset-x-0 z-10 transition-opacity',
            userBrowsing() && previewTimeSec() != null ? 'opacity-100' : 'opacity-0',
          )}
          style={{
            top: `calc(${LYRIC_SCROLL_ANCHOR * 100}% + ${props.fontSize ?? 0.875}rem + 4px)`,
          }}
          aria-hidden={!(userBrowsing() && previewTimeSec() != null)}
        >
          {/* 线在左，时间与播放按钮在右侧，互不重叠；整体垂直居中于锚点 */}
          <div class="mx-3 flex -translate-y-1/2 items-center gap-2">
            <div
              ref={skipLineEl}
              class="min-w-0 flex-1 border-t-2 border-dotted border-primary/20 mask-[linear-gradient(90deg,transparent,transparent_15%,black)]"
            />
            <span class="shrink-0 text-xs tabular-nums text-primary/70">
              {formatPreviewTime(previewTimeSec() ?? 0)}
            </span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              class={cn(
                'h-8 w-8 shrink-0 opacity-80 hover:opacity-60',
                userBrowsing() && previewTimeSec() != null
                  ? 'pointer-events-auto'
                  : 'pointer-events-none',
              )}
              aria-label="跳转到此处播放"
              onMouseEnter={() => {
                skipHover = true;
                clearResumeTimer();
              }}
              onMouseLeave={() => {
                skipHover = false;
                startResumeTimer();
              }}
              onClick={handleSkipPlay}
            >
              <Play class="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Show>
    </div>
  );
};
