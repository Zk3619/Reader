/**
 * 简单歌词展示（LRC 或纯文本，对齐 Legado lyric 变量）
 */

import { createMemo, For, Show } from 'solid-js';
import { cn } from '@/lib/utils';

interface LrcLine {
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

export interface AudioLyricPanelProps {
  lyric: string | null;
  positionSec: number;
  class?: string;
}

export function AudioLyricPanel(props: AudioLyricPanelProps) {
  const lrcLines = createMemo(() => {
    const raw = props.lyric?.trim();
    if (!raw) return null;
    return parseLrc(raw);
  });

  const activeIndex = createMemo(() => {
    const lines = lrcLines();
    if (!lines) return -1;
    const posMs = props.positionSec * 1000;
    let idx = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.timeMs <= posMs) idx = i;
      else break;
    }
    return idx;
  });

  return (
    <Show when={props.lyric?.trim()}>
      <div
        class={cn(
          'max-h-32 w-full max-w-md overflow-y-auto rounded-lg bg-black/20 px-3 py-2 text-center text-sm text-white/90',
          props.class,
        )}
      >
        <Show
          when={lrcLines()}
          fallback={<p class="whitespace-pre-wrap leading-relaxed">{props.lyric}</p>}
        >
          {(lines) => (
            <ul class="space-y-1">
              <For each={lines()}>
                {(line, i) => (
                  <li
                    class={cn(
                      'transition-colors',
                      i() === activeIndex() ? 'text-white font-medium scale-105' : 'text-white/50',
                    )}
                  >
                    {line.text}
                  </li>
                )}
              </For>
            </ul>
          )}
        </Show>
      </div>
    </Show>
  );
}
