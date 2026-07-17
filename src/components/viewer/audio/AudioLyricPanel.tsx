/**
 * 歌词展示（LRC / 多轨 / lxlyric 逐字，对齐 lx）
 * - 原文/翻译/罗马音按时间戳合并到同一行
 * - 手动滚动暂停自动跟随，约 3s 后恢复
 * - 可选进度预览线 + 确认跳转
 */

import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  Show,
  type Component,
} from 'solid-js';
import { Play } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { LyricBundle, LyricTrackKind } from '@/lib/media/audio/lyric-types';
import { pickLyricText } from '@/lib/media/audio/lyric-types';

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

function parseTimeTag(tag: string): number | null {
  const m = tag.match(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/);
  if (!m) return null;
  const min = Number(m[1]);
  const sec = Number(m[2]);
  const frac = m[3] ? Number(m[3].padEnd(3, '0').slice(0, 3)) : 0;
  return min * 60_000 + sec * 1000 + frac;
}

function parseLxWords(lineBody: string, lineStartMs: number): LxWord[] {
  const words: LxWord[] = [];
  const re = /<(\d+),(\d+)>([^<]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(lineBody)) !== null) {
    words.push({
      timeMs: lineStartMs + Number(m[1]),
      durationMs: Number(m[2]),
      text: m[3] ?? '',
    });
  }
  if (words.length === 0) {
    const plain = lineBody.replace(/<\d+,\d+>/g, '').trim();
    if (plain) words.push({ timeMs: lineStartMs, durationMs: 0, text: plain });
  }
  return words;
}

function parseTimedLines(lyric: string, asLx: boolean): ParsedLine[] {
  const lines = lyric.split(/\r?\n/);
  const parsed: ParsedLine[] = [];
  const timeRe = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
  for (const line of lines) {
    const matches = [...line.matchAll(timeRe)];
    if (matches.length === 0) continue;
    const body = line.replace(timeRe, '');
    const text = body.replace(/<\d+,\d+>/g, '').trim();
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

export interface AudioLyricPanelProps {
  lyric?: string | null;
  bundle?: LyricBundle | null;
  lyricTrack?: LyricTrackKind;
  positionSec: number;
  lyricOffset?: number;
  class?: string;
  showTranslation?: boolean;
  showRoma?: boolean;
  secondaryOrder?: 'translation-first' | 'roma-first';
  align?: 'left' | 'center' | 'right';
  fontSize?: number;
  zoomActiveLyric?: boolean;
  onSeek?: (positionSec: number) => void;
  /** 开启后：手动浏览显示时间预览线并可确认跳转 */
  allowProgressPreview?: boolean;
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
}

export const AudioLyricPanel: Component<AudioLyricPanelProps> = (props) => {
  let container: HTMLDivElement | undefined;
  let scrollTimer: ReturnType<typeof setTimeout> | undefined;
  let resumeTimer: ReturnType<typeof setTimeout> | undefined;
  const [userBrowsing, setUserBrowsing] = createSignal(false);
  const [previewTimeSec, setPreviewTimeSec] = createSignal<number | null>(null);

  const primaryKind = () => props.lyricTrack ?? 'lyric';

  const primaryRaw = createMemo(() => {
    if (props.lyric?.trim()) return props.lyric;
    return pickLyricText(props.bundle, primaryKind()) ?? '';
  });

  const useLx = createMemo(() => {
    const kind = primaryKind();
    const raw = primaryRaw();
    if (kind === 'lxlyric') return true;
    // 仅当当前主轨文本本身含逐字标记时按逐字处理，避免有 lxlyric 却选中原文时误判
    return /<\d+,\d+>/.test(raw);
  });

  const primaryLines = createMemo(() => {
    const raw = primaryRaw().trim();
    if (!raw) return [] as ParsedLine[];
    return parseTimedLines(raw, useLx());
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
    const posMs = (props.positionSec + (props.lyricOffset ?? 0)) * 1000;
    if (posMs < lines[0]!.timeMs) return -1;
    let idx = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.timeMs <= posMs) idx = i;
      else break;
    }
    return idx;
  });

  const activeWords = createMemo(() => {
    const lines = mergedLines();
    const idx = activeIndex();
    if (idx < 0) return null;
    return lines[idx]?.words ?? null;
  });

  const activeWordIndex = createMemo(() => {
    const words = activeWords();
    if (!words || words.length === 0) return -1;
    const posMs = (props.positionSec + (props.lyricOffset ?? 0)) * 1000;
    let idx = -1;
    for (let i = 0; i < words.length; i++) {
      const word = words[i]!;
      const end = word.durationMs > 0 ? word.timeMs + word.durationMs : undefined;
      if (posMs >= word.timeMs && (end == null || posMs < end || i === words.length - 1)) {
        idx = i;
      } else if (posMs >= word.timeMs) {
        idx = i;
      }
    }
    return idx;
  });

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

  const scrollActiveIntoView = () => {
    if (!container || userBrowsing()) return;
    const active = container.querySelector<HTMLElement>('[data-lyric-active="true"]');
    active?.scrollIntoView({
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

  const updatePreviewFromScroll = () => {
    if (!container || !props.allowProgressPreview || !props.onSeek) {
      setPreviewTimeSec(null);
      return;
    }
    const centerY = container.scrollTop + container.clientHeight * 0.42;
    const items = Array.from(
      container.querySelectorAll<HTMLElement>('[data-lyric-time]'),
    );
    let bestEl: HTMLElement | undefined;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const el of items) {
      const mid = el.offsetTop + el.offsetHeight / 2;
      const delta = Math.abs(mid - centerY);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestEl = el;
      }
    }
    if (!bestEl) {
      setPreviewTimeSec(null);
      return;
    }
    const timeMs = Number(bestEl.dataset.lyricTime);
    if (Number.isFinite(timeMs)) setPreviewTimeSec(timeMs / 1000);
  };

  const markBrowsing = () => {
    setUserBrowsing(true);
    updatePreviewFromScroll();
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      setUserBrowsing(false);
      setPreviewTimeSec(null);
      scrollActiveIntoView();
    }, 3000);
  };

  onCleanup(() => {
    if (scrollTimer) clearTimeout(scrollTimer);
    if (resumeTimer) clearTimeout(resumeTimer);
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
            'min-h-0 flex-1 overflow-y-auto px-3 py-8 mask-[linear-gradient(transparent,black_12%,black_88%,transparent)]',
            props.align === 'left' && 'text-left',
            props.align === 'right' && 'text-right',
            (!props.align || props.align === 'center') && 'text-center',
          )}
          style={{
            'font-size': `${props.fontSize ?? 16}px`,
            'font-family': props.fontFamily || undefined,
            'line-height': String(props.lineHeight ?? 1.6),
            'text-shadow': props.textShadow ? '0 1px 4px rgba(0,0,0,.35)' : undefined,
            'font-weight': props.bold ? '700' : undefined,
            'writing-mode': props.direction === 'vertical' ? 'vertical-rl' : undefined,
          }}
          onWheel={markBrowsing}
          onTouchStart={markBrowsing}
          onScroll={() => {
            if (userBrowsing()) updatePreviewFromScroll();
          }}
        >
          <Show when={!props.singleLine && !(props.maxLines && props.maxLines > 0)}>
            <div class="h-[38%]" aria-hidden="true" />
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
                      props.onSeek && 'cursor-pointer hover:opacity-90',
                      entry.originalIndex === activeIndex()
                        ? cn(
                            'font-medium text-foreground',
                            props.zoomActiveLyric !== false && 'scale-[1.04]',
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
                      if (!props.onSeek || props.allowProgressPreview) return;
                      props.onSeek(entry.line.timeMs / 1000);
                    }}
                  >
                    <Show
                      when={entry.originalIndex === activeIndex() && entry.line.words}
                      fallback={<span>{entry.line.text}</span>}
                    >
                      {(words) => (
                        <span>
                          <For each={words()}>
                            {(w, wi) => (
                              <span
                                class={cn(
                                  wi() <= activeWordIndex()
                                    ? 'text-primary'
                                    : 'text-muted-foreground/50',
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
          <Show when={!props.singleLine && !(props.maxLines && props.maxLines > 0)}>
            <div class="h-[38%]" aria-hidden="true" />
          </Show>
        </div>
      </Show>

      <Show when={userBrowsing() && props.allowProgressPreview && previewTimeSec() != null && props.onSeek}>
        <div class="pointer-events-none absolute inset-x-3 top-[42%] z-10 flex -translate-y-1/2 items-center gap-2">
          <div class="h-px flex-1 border-t border-dashed border-primary/70" />
          <span class="rounded bg-background/90 px-2 py-0.5 text-xs tabular-nums text-primary shadow">
            {formatPreviewTime(previewTimeSec() ?? 0)}
          </span>
          <Button
            type="button"
            size="icon"
            variant="secondary"
            class="pointer-events-auto h-8 w-8 shadow"
            aria-label="跳转到此处播放"
            onClick={() => {
              const t = previewTimeSec();
              if (t == null) return;
              props.onSeek?.(t);
              setUserBrowsing(false);
              setPreviewTimeSec(null);
            }}
          >
            <Play class="h-4 w-4" />
          </Button>
          <div class="h-px flex-1 border-t border-dashed border-primary/70" />
        </div>
      </Show>
    </div>
  );
};
