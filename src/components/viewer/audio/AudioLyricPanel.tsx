/**
 * 歌词展示（LRC / 多轨 / lxlyric 逐字，对齐 lx）
 */

import { createEffect, createMemo, For, onCleanup, Show } from 'solid-js';
import { cn } from '@/lib/utils';
import type { LyricBundle, LyricTrackKind } from '@/lib/media/audio/lyric-types';
import { pickLyricText } from '@/lib/media/audio/lyric-types';

interface LrcLine {
  timeMs: number;
  text: string;
}

interface LxWord {
  timeMs: number;
  text: string;
}

function parseLrc(lyric: string): LrcLine[] | null {
  const lines = lyric.split(/\r?\n/);
  const parsed: LrcLine[] = [];
  const re = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
  for (const line of lines) {
    const matches = [...line.matchAll(re)];
    if (matches.length === 0) continue;
    const text = line.replace(re, '').trim();
    if (!text) continue;
    for (const m of matches) {
      const min = Number(m[1]);
      const sec = Number(m[2]);
      const frac = m[3] ? Number(m[3].padEnd(3, '0').slice(0, 3)) : 0;
      parsed.push({ timeMs: min * 60_000 + sec * 1000 + frac, text });
    }
  }
  if (parsed.length === 0) return null;
  parsed.sort((a, b) => a.timeMs - b.timeMs);
  return parsed;
}

function parseLxLyric(lyric: string): LrcLine[] | null {
  const lines = lyric.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return null;
  const parsed: LrcLine[] = [];
  const lineRe = /^\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/;
  for (const line of lines) {
    const m = line.match(lineRe);
    if (!m) continue;
    const min = Number(m[1]);
    const sec = Number(m[2]);
    const frac = m[3] ? Number(m[3].padEnd(3, '0').slice(0, 3)) : 0;
    const text = line.replace(lineRe, '').replace(/<\d+,\d+>/g, '').trim();
    if (text) parsed.push({ timeMs: min * 60_000 + sec * 1000 + frac, text });
  }
  return parsed.length ? parsed : null;
}

function parseLxWords(line: string, lineStartMs: number): LxWord[] {
  const words: LxWord[] = [];
  // 对齐 lx：`<相对行起点ms,持续ms>字`
  const re = /<(\d+),(\d+)>([^<]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    words.push({
      timeMs: lineStartMs + Number(m[1]),
      text: m[3] ?? '',
    });
  }
  if (words.length === 0 && line.trim()) {
    words.push({
      timeMs: lineStartMs,
      text: line.replace(/<\d+,\d+>/g, '').trim(),
    });
  }
  return words;
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
}

export function AudioLyricPanel(props: AudioLyricPanelProps) {
  let container: HTMLDivElement | undefined;
  let scrollTimer: ReturnType<typeof setTimeout> | undefined;
  const primaryText = createMemo(() => {
    if (props.lyric?.trim()) return props.lyric;
    return pickLyricText(props.bundle, props.lyricTrack ?? 'lyric');
  });

  const secondaryText = createMemo(() => {
    const kind = props.lyricTrack ?? 'lyric';
    if (!props.bundle) return null;
    const showT = props.showTranslation !== false;
    const showR = props.showRoma !== false;
    if (kind === 'lyric') {
      const candidates =
        props.secondaryOrder === 'roma-first'
          ? [
              showR ? props.bundle.rlyric : null,
              showT ? props.bundle.tlyric : null,
            ]
          : [
              showT ? props.bundle.tlyric : null,
              showR ? props.bundle.rlyric : null,
            ];
      return candidates.find((text) => text?.trim()) ?? null;
    }
    if (kind === 'tlyric' && props.bundle.lyric?.trim()) return props.bundle.lyric;
    if (kind === 'rlyric' && props.bundle.lyric?.trim()) return props.bundle.lyric;
    if (showT && props.bundle.tlyric?.trim()) return props.bundle.tlyric;
    return null;
  });

  const isLxLyric = createMemo(() => {
    const raw = primaryText();
    return !!raw && (props.lyricTrack === 'lxlyric' || !!props.bundle?.lxlyric?.trim());
  });

  const lrcLines = createMemo(() => {
    const raw = primaryText()?.trim();
    if (!raw) return null;
    if (isLxLyric()) return parseLxLyric(raw) ?? parseLrc(raw);
    return parseLrc(raw);
  });

  const activeIndex = createMemo(() => {
    const lines = lrcLines();
    if (!lines) return -1;
    const posMs = (props.positionSec + (props.lyricOffset ?? 0)) * 1000;
    let idx = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.timeMs <= posMs) idx = i;
      else break;
    }
    return idx;
  });

  const activeWords = createMemo(() => {
    const raw = primaryText()?.trim();
    const lines = lrcLines();
    const idx = activeIndex();
    if (!raw || !lines || idx < 0 || !isLxLyric()) return null;
    const line = lines[idx];
    if (!line) return null;
    const rawLines = raw.split(/\r?\n/);
    const rawLine = rawLines.find((l) => l.includes(line.text.slice(0, 4))) ?? '';
    return parseLxWords(rawLine, line.timeMs);
  });

  const activeWordIndex = createMemo(() => {
    const words = activeWords();
    if (!words) return -1;
    const posMs = (props.positionSec + (props.lyricOffset ?? 0)) * 1000;
    let idx = 0;
    for (let i = 0; i < words.length; i++) {
      if (words[i]!.timeMs <= posMs) idx = i;
      else break;
    }
    return idx;
  });

  const visibleLines = createMemo(() => {
    const lines = lrcLines() ?? [];
    const active = activeIndex();
    if (props.singleLine && lines[active]) {
      return [{ line: lines[active]!, originalIndex: active }];
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

  createEffect(() => {
    void activeIndex();
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const active = container?.querySelector<HTMLElement>('[data-lyric-active="true"]');
      active?.scrollIntoView({
        behavior: 'smooth',
        block:
          props.scrollPosition === 'top'
            ? 'start'
            : props.scrollPosition === 'bottom'
              ? 'end'
              : 'center',
      });
    }, Math.max(0, props.scrollDelayMs ?? 0));
  });
  onCleanup(() => {
    if (scrollTimer) clearTimeout(scrollTimer);
  });

  return (
    <Show when={primaryText()?.trim()}>
      <div
        ref={container}
        class={cn(
          'max-h-32 w-full max-w-md overflow-y-auto rounded-lg bg-black/20 px-3 py-2 text-center text-sm text-white/90',
          props.class,
        )}
        style={{
          'font-size': `${props.fontSize ?? 14}px`,
          'text-align': props.align ?? 'center',
          'font-family': props.fontFamily || undefined,
          'line-height': String(props.lineHeight ?? 1.5),
          'text-shadow': props.textShadow ? '0 1px 4px rgba(0,0,0,.9)' : undefined,
          'font-weight': props.bold ? '700' : undefined,
          'writing-mode': props.direction === 'vertical' ? 'vertical-rl' : undefined,
        }}
      >
        <Show
          when={lrcLines()}
          fallback={<p class={props.wrap === false ? 'whitespace-nowrap' : 'whitespace-pre-wrap'}>{primaryText()}</p>}
        >
          {(_lines) => (
            <ul class="space-y-1">
              <For each={visibleLines()}>
                {(entry) => (
                  <li
                    data-lyric-active={entry.originalIndex === activeIndex() ? 'true' : undefined}
                    class={cn(
                      'transition-colors',
                      props.onSeek && 'cursor-pointer hover:text-white/80',
                      entry.originalIndex === activeIndex()
                        ? cn(
                            'text-white font-medium',
                            props.zoomActiveLyric !== false && 'scale-105',
                          )
                        : 'text-white/50',
                    )}
                    style={{
                      color:
                        entry.originalIndex === activeIndex()
                          ? props.playedColor
                          : props.unplayedColor,
                      'white-space': props.wrap === false ? 'nowrap' : 'normal',
                    }}
                    onClick={() => props.onSeek?.(entry.line.timeMs / 1000)}
                  >
                    <Show
                      when={entry.originalIndex === activeIndex() && activeWords()}
                      fallback={entry.line.text}
                    >
                      {(words) => (
                        <span>
                          <For each={words()}>
                            {(w, wi) => (
                              <span
                                class={cn(
                                  wi() <= activeWordIndex() ? 'text-white' : 'text-white/40',
                                )}
                              >
                                {w.text}
                              </span>
                            )}
                          </For>
                        </span>
                      )}
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          )}
        </Show>
        <Show when={secondaryText()?.trim()}>
          <p class="mt-2 text-xs text-white/60 leading-relaxed">{secondaryText()}</p>
        </Show>
      </div>
    </Show>
  );
}
