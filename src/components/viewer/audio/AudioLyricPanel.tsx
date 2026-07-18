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

/** 对齐 lx：自动滚动锚点与预览线均在容器高度约 38% 处 */
const LYRIC_SCROLL_ANCHOR = 0.38;

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

/** 对齐 lx line-player：小数部分按原始整数毫秒解析（勿 padEnd） */
function parseTimeTag(tag: string): number | null {
  const m = tag.match(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/);
  if (!m) return null;
  const min = Number(m[1]);
  const sec = Number(m[2]);
  const frac = m[3] ? parseInt(m[3], 10) : 0;
  return min * 60_000 + sec * 1000 + (Number.isFinite(frac) ? frac : 0);
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
  const timeRe = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
  for (const line of lines) {
    const matches = [...line.matchAll(timeRe)];
    if (matches.length === 0) continue;
    const body = line.replace(timeRe, '');
    const text = body.replace(/<\d+(?:\.\d+)?,\d+(?:\.\d+)?>/g, '').trim();
    if (!text && !asLx) continue;
    for (const m of matches) {
      const timeMs = parseTimeTag(m[0]);
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
  align?: 'left' | 'center' | 'right';
  /** 字号（rem，默认约 0.875 ≈ 14px @16px 根字号） */
  fontSize?: number;
  zoomActiveLyric?: boolean;
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
  maxLines?: number;
  playedColor?: string;
  unplayedColor?: string;
  scrollDelayMs?: number;
  scrollPosition?: 'top' | 'center' | 'bottom';
  fontFamily?: string;
  lineHeight?: number;
  textShadow?: boolean;
  bold?: boolean;
  wrap?: boolean;
  direction?: 'horizontal' | 'vertical';
  emptyText?: string;
  loading?: boolean;
  errorText?: string | null;
  active?: boolean;
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

  const primaryKind = () => props.lyricTrack ?? 'lyric';

  const primaryRaw = createMemo(() => {
    if (props.lyric?.trim()) return props.lyric;
    return pickLyricText(props.bundle, primaryKind()) ?? '';
  });

  const karaokeMode = () => props.karaokeMode === true;
  /** 开启卡拉 OK 时即启用扫光插值（含无逐字时的均分降级） */
  const useKaraoke = createMemo(() => karaokeMode());

  // timeupdate 约 4Hz，卡拉 OK 需更密采样：播放中用墙钟插值
  createEffect(() => {
    const base = props.positionSec;
    setSmoothPositionSec(base);
    if (props.playing !== true || !useKaraoke()) return;
    const baseAt = performance.now();
    let raf = 0;
    const tick = () => {
      setSmoothPositionSec(base + (performance.now() - baseAt) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    onCleanup(() => cancelAnimationFrame(raf));
  });

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

  const karaokePlayedColor = () => props.playedColor || 'hsl(var(--primary))';
  const karaokeUnplayedColor = () =>
    props.unplayedColor || 'hsl(var(--muted-foreground) / 0.45)';
  const karaokeVertical = () => props.direction === 'vertical';

  const visibleLines = createMemo(() => {
    const lines = mergedLines();
    const active = Math.max(0, activeIndex());
    if (props.singleLine) {
      const idx = activeIndex();
      if (idx < 0 || !lines[idx]) return [] as Array<{ line: MergedLine; originalIndex: number }>;
      return [{ line: lines[idx]!, originalIndex: idx }];
    }
    const maxLines = Math.max(0, Math.floor(props.maxLines ?? 0));
    if (maxLines > 0 && lines.length > maxLines) {
      const start = Math.max(
        0,
        Math.min(lines.length - maxLines, active - Math.floor(maxLines / 2)),
      );
      return lines
        .slice(start, start + maxLines)
        .map((line, index) => ({ line, originalIndex: start + index }));
    }
    return lines.map((line, originalIndex) => ({ line, originalIndex }));
  });

  const useFullScrollLayout = () =>
    !props.singleLine && !(props.maxLines && props.maxLines > 0);

  const scrollActiveIntoView = () => {
    if (!container || userBrowsing()) return;
    const active = container.querySelector<HTMLElement>('[data-lyric-active="true"]');
    if (!active) {
      container.scrollTop = 0;
      return;
    }
    if (useFullScrollLayout()) {
      // 对齐 lx：scrollTop = offsetTop - clientHeight * 0.38
      const target = Math.max(
        0,
        active.offsetTop - container.clientHeight * LYRIC_SCROLL_ANCHOR,
      );
      container.scrollTo({ top: target, behavior: 'smooth' });
      return;
    }
    active.scrollIntoView({
      behavior: 'smooth',
      block:
        props.scrollPosition === 'top'
          ? 'start'
          : props.scrollPosition === 'bottom'
            ? 'end'
            : 'center',
    });
  };

  createEffect(() => {
    void activeIndex();
    void props.active;
    if (props.active === false) return;
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(scrollActiveIntoView, Math.max(0, props.scrollDelayMs ?? 0));
  });

  const clearResumeTimer = () => {
    if (!resumeTimer) return;
    clearTimeout(resumeTimer);
    resumeTimer = undefined;
  };

  const startResumeTimer = () => {
    clearResumeTimer();
    if (skipHover) return;
    resumeTimer = setTimeout(() => {
      resumeTimer = undefined;
      setUserBrowsing(false);
      setPreviewTimeSec(null);
      lastPreviewEl = null;
      if (props.playing === false) return;
      scrollActiveIntoView();
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
          ref={container}
          class={cn(
            // 对齐 lx：overflow hidden + 自定义拖拽/滚轮，避免原生滚动条抢交互
            'min-h-0 flex-1 overflow-hidden px-3 py-8 mask-[linear-gradient(transparent,black_12%,black_88%,transparent)] select-none',
            dragging() ? 'cursor-grabbing' : 'cursor-grab',
            props.align === 'left' && 'text-left',
            props.align === 'right' && 'text-right',
            (!props.align || props.align === 'center') && 'text-center',
          )}
          style={{
            'font-size': `${props.fontSize ?? 0.875}rem`,
            'font-family': props.fontFamily || undefined,
            'line-height': String(props.lineHeight ?? 1.6),
            'text-shadow': props.textShadow ? '0 1px 4px rgba(0,0,0,.35)' : undefined,
            'font-weight': props.bold ? '700' : undefined,
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
            <ul class="space-y-3">
              <For each={visibleLines()}>
                {(entry) => (
                  <li
                    data-lyric-active={entry.originalIndex === activeIndex() ? 'true' : undefined}
                    data-lyric-time={String(entry.line.timeMs)}
                    class={cn(
                      'transition-all duration-200',
                      (props.doubleClickSeek ||
                        (props.onSeek && !props.allowProgressPreview)) &&
                      'cursor-pointer hover:opacity-90',
                      entry.originalIndex === activeIndex()
                        ? cn(
                          'font-medium text-foreground',
                          // 有逐字时避免 transform:scale 破坏 background-clip 扫光
                          props.zoomActiveLyric !== false &&
                          !(entry.line.words && entry.line.words.length > 0) &&
                          'scale-[1.04]',
                          props.zoomActiveLyric !== false &&
                          entry.line.words &&
                          entry.line.words.length > 0 &&
                          'text-[1.04em]',
                        )
                        : 'text-muted-foreground/70',
                    )}
                    style={{
                      color:
                        entry.originalIndex === activeIndex()
                          ? props.playedColor
                          : props.unplayedColor,
                      'white-space': props.wrap === false ? 'nowrap' : 'normal',
                    }}
                    onClick={() => {
                      // 开启进度预览时单击不跳转（需点播放按钮或松手自动播放）
                      if (!props.onSeek || props.allowProgressPreview || props.doubleClickSeek)
                        return;
                      seekToLine(entry.line.timeMs);
                    }}
                    onDblClick={(e) => {
                      if (!props.doubleClickSeek || !props.onSeek) return;
                      e.preventDefault();
                      e.stopPropagation();
                      seekToLine(entry.line.timeMs);
                    }}
                  >
                    <Show
                      when={entry.originalIndex === activeIndex() && entry.line.words}
                      fallback={<span>{entry.line.text}</span>}
                    >
                      {(words) => (
                        <span>
                          <For each={words()}>
                            {(w) => (
                              <span
                                style={karaokeWordStyle(
                                  wordFillPercent(w, positionMs()),
                                  karaokePlayedColor(),
                                  karaokeUnplayedColor(),
                                  karaokeVertical(),
                                )}
                              >
                                {w.text}
                              </span>
                            )}
                          </For>
                        </span>
                      )}
                    </Show>
                    <For each={entry.line.extended}>
                      {(ext) => (
                        <p class="mt-0.5 text-[0.85em] leading-snug opacity-70">{ext}</p>
                      )}
                    </For>
                  </li>
                )}
              </For>
            </ul>
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
