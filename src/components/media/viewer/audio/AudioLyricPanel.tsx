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
  translation: string | null;
  roma: string | null;
  /** 主轨为翻译/罗马音时回退显示的原文 */
  original: string | null;
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

/** 比较用规范化：折叠空白、忽略大小写，用于判定翻译/罗马音是否「真正可用」 */
function normalizeLyricCompare(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * 「如果可用」：副歌词有内容，且与主歌词（及另一条副歌词）实质不同时才展示。
 * 避免英文歌 romalrc≈原文、中文歌三轨全文相同仍渲染三行。
 */
function usableSecondaryText(
  text: string | null | undefined,
  ...against: Array<string | null | undefined>
): string | null {
  const raw = text?.trim();
  if (!raw) return null;
  const norm = normalizeLyricCompare(raw);
  if (!norm) return null;
  for (const other of against) {
    if (!other?.trim()) continue;
    if (normalizeLyricCompare(other) === norm) return null;
  }
  return raw;
}

function formatPreviewTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function lineEndTimeMs(lines: MergedLine[], index: number): number {
  const cur = lines[index];
  if (!cur) return 0;
  const next = lines[index + 1];
  if (next) return Math.max(cur.timeMs + 200, next.timeMs);
  if (cur.words && cur.words.length > 0) {
    const last = cur.words[cur.words.length - 1]!;
    return last.timeMs + Math.max(200, last.durationMs);
  }
  return cur.timeMs + 4000;
}

/**
 * 不允许换行 + 卡拉 OK：溢出部分从左到右（垂直书写则为从上到下）随进度滚完本行。
 */
const KaraokeOverflowHost: Component<{
  active: boolean;
  enabled: boolean;
  vertical: boolean;
  lineStartMs: number;
  lineEndMs: number;
  positionMs: number;
  class?: string;
  children: import('solid-js').JSX.Element;
}> = (props) => {
  let viewport: HTMLDivElement | undefined;
  let content: HTMLDivElement | undefined;
  const [overflow, setOverflow] = createSignal(0);

  const measure = () => {
    if (!viewport || !content) {
      setOverflow(0);
      return;
    }
    if (props.vertical) {
      setOverflow(Math.max(0, content.scrollHeight - viewport.clientHeight));
    } else {
      setOverflow(Math.max(0, content.scrollWidth - viewport.clientWidth));
    }
  };

  createEffect(() => {
    void props.active;
    void props.enabled;
    void props.positionMs;
    queueMicrotask(measure);
  });

  onMount(() => {
    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measure()) : null;
    if (viewport) ro?.observe(viewport);
    if (content) ro?.observe(content);
    onCleanup(() => ro?.disconnect());
  });

  const progress = () => {
    if (!props.enabled || !props.active || overflow() <= 0) return 0;
    const span = Math.max(1, props.lineEndMs - props.lineStartMs);
    return Math.max(0, Math.min(1, (props.positionMs - props.lineStartMs) / span));
  };

  const shift = () => -overflow() * progress();

  return (
    <Show when={props.enabled} fallback={props.children}>
      <div
        ref={(el) => {
          viewport = el;
        }}
        class={cn('overflow-hidden', props.class ?? 'max-w-full w-full')}
      >
        <div
          ref={(el) => {
            content = el;
          }}
          class="inline-block whitespace-nowrap will-change-transform"
          style={{
            transform: props.vertical
              ? `translateY(${shift()}px)`
              : `translateX(${shift()}px)`,
          }}
        >
          {props.children}
        </div>
      </div>
    </Show>
  );
};

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
    // 每个逐字块内部保留空白：英文单词间的空格常单独成字或位于词尾，
    // inline-block 默认会折叠首尾空白导致单词粘连，用 pre 保留。
    'white-space': 'pre',
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
  /**
   * 翻译/罗马音相对主歌词位置（桌面歌词）：
   * both-below / both-above 时由 secondaryOrder 决定二者先后。
   */
  secondaryPlacement?:
    | 'both-below'
    | 'both-above'
    | 'roma-above-trans-below'
    | 'trans-above-roma-below';
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

  /**
   * 副歌词（翻译/罗马音）按布局区分观感：
   * - default：主行旁附带，略小略淡，不抢滚动焦点
   * - single：当前句唯一焦点，副歌词稍大
   * - dual：每槽附带，更紧凑以免两槽撑破窗口
   */
  const extendedLineClass = (side: 'above' | 'below') => {
    const layout = lyricLayout();
    const gap =
      side === 'above'
        ? layout === 'single'
          ? 'mb-1'
          : 'mb-0.5'
        : layout === 'single'
          ? 'mt-1'
          : 'mt-0.5';
    if (layout === 'single') {
      return `${gap} text-[0.9em] leading-snug opacity-75`;
    }
    if (layout === 'dual') {
      return `${gap} text-[0.78em] leading-snug opacity-65`;
    }
    return `${gap} text-[0.85em] leading-snug opacity-70`;
  };

  /** 按 secondaryPlacement / secondaryOrder 拆成主歌词上下两侧 */
  const secondarySides = (line: MergedLine): { above: string[]; below: string[] } => {
    const placement = props.secondaryPlacement ?? 'both-below';
    const order =
      props.secondaryOrder === 'translation-first'
        ? (['translation', 'roma'] as const)
        : (['roma', 'translation'] as const);
    const pick = (which: 'translation' | 'roma') =>
      which === 'translation' ? line.translation : line.roma;
    const orderedBoth = () => {
      const out: string[] = [];
      // 主轨为翻译/罗马音时，原文跟副歌词同侧、靠主歌词
      for (const which of order) {
        const text = pick(which);
        if (text) out.push(text);
      }
      return out;
    };

    let above: string[] = [];
    let below: string[] = [];
    switch (placement) {
      case 'both-above':
        above = orderedBoth();
        break;
      case 'roma-above-trans-below':
        if (line.roma) above = [line.roma];
        if (line.translation) below = [line.translation];
        break;
      case 'trans-above-roma-below':
        if (line.translation) above = [line.translation];
        if (line.roma) below = [line.roma];
        break;
      case 'both-below':
      default:
        below = orderedBoth();
        break;
    }
    if (line.original) {
      // 原文紧贴主歌词：有上侧则垫在上侧最靠近主歌词处，否则垫在下侧最前
      if (above.length > 0) above = [...above, line.original];
      else below = [line.original, ...below];
    }
    return { above, below };
  };

  const renderSecondaryList = (
    texts: string[],
    side: 'above' | 'below',
    isActive: boolean,
  ) => {
    if (texts.length === 0) return null;
    return (
      <For each={texts}>
        {(ext) => (
          <p
            class={extendedLineClass(side)}
            style={{
              'font-weight': weightExtended(),
              ...(lineEffectStyle(isActive) ?? {}),
            }}
          >
            {ext}
          </p>
        )}
      </For>
    );
  };

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

    return primary.map((line) => {
      let original: string | null = null;
      // 主轨为翻译/罗马音时，副轨优先显示原文（且须与主句实质不同）
      if (kind === 'tlyric' || kind === 'rlyric') {
        original = props.bundle?.lyric?.trim()
          ? usableSecondaryText(
              nearestLineText(parseTimedLines(props.bundle.lyric, false), line.timeMs),
              line.text,
            )
          : null;
      }
      const translationRaw =
        kind === 'tlyric' ? null : nearestLineText(tLines, line.timeMs);
      const romaRaw = kind === 'rlyric' ? null : nearestLineText(rLines, line.timeMs);
      // 先各自相对主句去重，再互相去重（避免 tlyric===rlyric 时双行相同）
      const translation = usableSecondaryText(translationRaw, line.text);
      const roma = usableSecondaryText(romaRaw, line.text, translation);
      return {
        timeMs: line.timeMs,
        text: line.text,
        words: line.words,
        translation,
        roma,
        original,
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
   *
   * 全高滚动：渲染完整列表，靠 scrollTop 缓动跟唱（裁窗换行会把动画盖成硬切）。
   * 仅 reduceMotion + maxLines，或歌词极长时才裁窗。
   */
  const [followIndex, setFollowIndex] = createSignal(-1);

  const useFullScrollLayout = () => {
    if (lyricLayout() === 'single' || lyricLayout() === 'dual') return false;
    if (props.singleLine) return false;
    // 仅 reduceMotion + maxLines 时放弃滚动动画，改硬裁窗
    return !(reduceMotion() && props.maxLines != null && props.maxLines > 0);
  };

  const visibleIndices = createMemo(() => {
    const lines = mergedLines();
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
    const windowCenter = Math.max(
      0,
      followIndex() >= 0 ? followIndex() : activeIndex(),
    );

    // 全高滚动：完整列表（超长歌词软裁，窗口足够大以免跟滚时硬切）
    if (useFullScrollLayout()) {
      const HARD_CAP = 240;
      if (lines.length > HARD_CAP) {
        const win = Math.min(HARD_CAP, Math.max(64, maxLines > 0 ? maxLines * 12 : 96));
        const start = Math.max(
          0,
          Math.min(lines.length - win, windowCenter - Math.floor(win / 2)),
        );
        const out: number[] = [];
        for (let i = 0; i < win && start + i < lines.length; i++) out.push(start + i);
        return out;
      }
      return lines.map((_, i) => i);
    }

    // reduceMotion：按 maxLines 硬裁窗
    if (maxLines > 0 && lines.length > maxLines) {
      const start = Math.max(
        0,
        Math.min(lines.length - maxLines, windowCenter - Math.floor(maxLines / 2)),
      );
      const out: number[] = [];
      for (let i = 0; i < maxLines && start + i < lines.length; i++) out.push(start + i);
      return out;
    }
    return lines.map((_, i) => i);
  });

  /**
   * 双行轮换：偶数行固定在上槽、奇数行固定在下槽。
   * 唱到某一槽时，另一槽换成下一句；若下一句不存在，该槽保持上一句不变。
   */
  const dualLineIndices = createMemo(() => {
    if (lyricLayout() !== 'dual') return null;
    const lines = mergedLines();
    if (lines.length === 0) return null;
    const active = Math.max(0, activeIndex());
    const last = lines.length - 1;
    if (active % 2 === 0) {
      return {
        top: active,
        bottom: active < last ? active + 1 : active > 0 ? active - 1 : null,
      };
    }
    return {
      top: active < last ? active + 1 : active > 0 ? active - 1 : null,
      bottom: active,
    };
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

  /** 自定义缓动滚动（约 520ms，比浏览器默认 smooth 更明显） */
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
      // ease-in-out cubic：起停更顺，避免尾段突兀
      const eased =
        t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
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
      // 用相对滚动容器的内容坐标，勿用 offsetTop（裁窗/留白/未定位父级会算错，动画 delta≈0）
      const activeTop =
        active.getBoundingClientRect().top -
        container.getBoundingClientRect().top +
        container.scrollTop;
      // 对齐 LX：行垂直中心对准视口锚点；并按 scrollPosition 微调锚点
      const anchor =
        props.scrollPosition === 'top'
          ? 0.2
          : props.scrollPosition === 'bottom'
            ? 0.8
            : LYRIC_SCROLL_ANCHOR;
      const target = computeLyricScrollTop(
        activeTop,
        container.clientHeight,
        active.offsetHeight,
        anchor,
      );
      if (behavior === 'auto' || reduceMotion()) {
        cancelScrollAnim();
        container.scrollTop = target;
      } else {
        animateScrollTop(container, target, 520);
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
    const targetIndex = activeIndex();
    scrollTimer = setTimeout(() => {
      scrollTimer = undefined;
      // 硬裁窗路径才需要挪窗口中心；全量列表只做 scrollTop 缓动，避免 DOM 换行硬切
      if (!useFullScrollLayout()) {
        setFollowIndex(targetIndex);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            scrollActiveIntoView(followScrollBehavior());
          });
        });
        return;
      }
      setFollowIndex(targetIndex);
      scrollActiveIntoView(followScrollBehavior());
    }, Math.max(0, props.scrollDelayMs ?? 0));
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
      setFollowIndex(activeIndex());
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
      setFollowIndex(activeIndex());
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
        <div class="flex min-h-0 flex-1 items-center justify-center px-3">
          <p class="text-center text-sm text-muted-foreground">歌词加载中…</p>
        </div>
      </Show>
      <Show when={!props.loading && props.errorText}>
        <div class="flex min-h-0 flex-1 items-center justify-center px-3">
          <p class="text-center text-sm text-destructive">{props.errorText}</p>
        </div>
      </Show>
      <Show when={!props.loading && !props.errorText && !plainText()}>
        <div class="flex min-h-0 flex-1 items-center justify-center px-3">
          <p class="text-center text-sm text-muted-foreground">
            {props.emptyText ?? '暂无歌词'}
          </p>
        </div>
      </Show>
      <Show when={!props.loading && !props.errorText && plainText()}>
        <div
          ref={(el) => {
            container = el;
            setContainerEl(el);
          }}
          data-lyric-container=""
          class={cn(
            'px-3 select-none',
            // 默认布局：overflow hidden + 自定义拖拽/滚轮，避免原生滚动条抢交互
            // 单/双行：overflow-visible + 按内容撑开，避免矮窗 flex 压扁裁切副歌词
            lyricLayout() === 'single' || lyricLayout() === 'dual'
              ? 'flex shrink-0 flex-col justify-center overflow-visible py-1'
              : 'min-h-0 flex-1 overflow-hidden py-8',
            // 垂直书写：保证块轴可伸展，避免矮窗把字形压扁
            props.direction === 'vertical' && 'min-h-[12em]',
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
            'text-orientation':
              props.direction === 'vertical' ? 'mixed' : undefined,
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
            <div
              class="shrink-0"
              style={{ height: `${LYRIC_SCROLL_ANCHOR * 100}%` }}
              data-lyric-space="pre"
              aria-hidden="true"
            />
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
                gap: (() => {
                  const base = lyricLineGap() != null ? lyricLineGap()! : 12;
                  // 开启副歌词时加大行距，避免缩放主行与邻行副歌词贴死
                  const extra =
                    (props.showTranslation === true ? 6 : 0) +
                    (props.showRoma === true ? 4 : 0);
                  return `${base + extra}px`;
                })(),
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
                  const sides = () => secondarySides(line()!);
                  const zoomPadEm = () =>
                    zoom() ? Math.max(0, (zoomScale() - 1) * 0.55) : 0;
                  return (
                    <li
                      data-lyric-active={isActive() ? 'true' : undefined}
                      data-lyric-time={String(line()?.timeMs ?? 0)}
                      class={cn(
                        // 桌面歌词透明底也必须可见：scale 与副歌词不能被 overflow 裁切
                        'shrink-0 overflow-visible',
                        (props.doubleClickSeek ||
                          (props.onSeek && !props.allowProgressPreview)) &&
                          'cursor-pointer hover:opacity-90',
                        isActive()
                          ? 'font-medium text-foreground'
                          : 'text-muted-foreground/70',
                        !reduceMotion() &&
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
                      {renderSecondaryList(sides().above, 'above', isActive())}
                      {/*
                        仅主歌词 transform 放大；副歌词在缩放层外，避免叠行与裁切。
                        padding 预留 scale 视觉溢出，防止与邻行重叠。
                      */}
                      <div
                        class={cn(
                          'inline-block',
                          props.wrap !== false && 'max-w-full',
                          props.wrap === false && 'w-full max-w-full',
                        )}
                        style={
                          props.direction === 'vertical'
                            ? {
                                'padding-inline': zoom()
                                  ? `${zoomPadEm()}em`
                                  : undefined,
                              }
                            : {
                                'padding-top': zoom()
                                  ? `${zoomPadEm()}em`
                                  : undefined,
                                'padding-bottom': zoom()
                                  ? `${zoomPadEm()}em`
                                  : undefined,
                              }
                        }
                      >
                        <div
                          class={cn(
                            'inline-block',
                            props.wrap !== false && 'max-w-full',
                            props.wrap === false && 'w-full max-w-full',
                            !reduceMotion() &&
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
                          <KaraokeOverflowHost
                            active={isActive()}
                            enabled={
                              props.wrap === false &&
                              karaokeMode() &&
                              isActive()
                            }
                            vertical={props.direction === 'vertical'}
                            lineStartMs={line()?.timeMs ?? 0}
                            lineEndMs={lineEndTimeMs(
                              mergedLines(),
                              originalIndex,
                            )}
                            positionMs={positionMs()}
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
                                <span
                                  class={
                                    props.wrap === false
                                      ? 'whitespace-nowrap'
                                      : undefined
                                  }
                                  style={{ 'font-weight': weightLine() }}
                                >
                                  {line()?.text}
                                </span>
                              }
                            >
                              {(words) => (
                                <span
                                  class={cn(
                                    'relative inline-block',
                                    props.wrap !== false && 'max-w-full',
                                    props.wrap === false && 'whitespace-nowrap',
                                  )}
                                >
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
                          </KaraokeOverflowHost>
                        </div>
                      </div>
                      {renderSecondaryList(sides().below, 'below', isActive())}
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
                  const sides = () => secondarySides(line()!);
                  return (
                    <div
                      data-lyric-line=""
                      class={cn(
                        // shrink-0：矮窗时禁止被 flex 压扁；overflow-visible：副歌词不被裁切
                        'w-full shrink-0 overflow-visible',
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
                        'white-space':
                          props.wrap === false ? 'nowrap' : 'normal',
                      }}
                    >
                      {renderSecondaryList(sides().above, 'above', isActive())}
                      <KaraokeOverflowHost
                        active={isActive()}
                        enabled={
                          props.wrap === false && karaokeMode() && isActive()
                        }
                        vertical={props.direction === 'vertical'}
                        lineStartMs={line()?.timeMs ?? 0}
                        lineEndMs={lineEndTimeMs(mergedLines(), index)}
                        positionMs={positionMs()}
                      >
                        <Show
                          when={
                            lineUsesKaraokeWords() &&
                            line()?.words &&
                            line()!.words!.length > 0
                              ? line()!.words!
                              : false
                          }
                          fallback={
                            <span
                              class={
                                props.wrap === false
                                  ? 'whitespace-nowrap'
                                  : undefined
                              }
                              style={{ 'font-weight': weightLine() }}
                            >
                              {line()?.text}
                            </span>
                          }
                        >
                          {(words) => (
                            <span
                              class={cn(
                                'inline-block',
                                props.wrap !== false && 'max-w-full',
                                props.wrap === false && 'whitespace-nowrap',
                              )}
                            >
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
                      </KaraokeOverflowHost>
                      {renderSecondaryList(sides().below, 'below', isActive())}
                    </div>
                  );
                };
                return (
                  <div
                    class="flex w-full shrink-0 flex-col px-1"
                    style={{ gap: lyricLineGap() != null ? `${lyricLineGap()}px` : '0.75rem' }}
                  >
                    {renderDualLine(pair().top, 'top')}
                    {renderDualLine(pair().bottom, 'bottom')}
                  </div>
                );
              }}
            </Show>
          </Show>
          <Show when={useFullScrollLayout()}>
            <div
              class="shrink-0"
              style={{ height: `${LYRIC_SCROLL_ANCHOR * 100}%` }}
              data-lyric-space="post"
              aria-hidden="true"
            />
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
