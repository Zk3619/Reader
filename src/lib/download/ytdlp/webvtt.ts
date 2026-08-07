/**
 * Minimal WebVTT helpers (yt-dlp webvtt.py subset).
 */

export type VttCue = {
  start: number;
  end: number;
  text: string;
  id?: string;
};

/** Parse HH:MM:SS.mmm or MM:SS.mmm → seconds. */
export function parseVttTimestamp(ts: string): number {
  const s = String(ts || '').trim().replace(',', '.');
  const parts = s.split(':').map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  return parts[0] || 0;
}

export function formatVttTimestamp(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s - h * 3600 - m * 60;
  const whole = Math.floor(rest);
  const ms = Math.round((rest - whole) * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(whole)}.${pad(ms, 3)}`;
}

/** Parse a WebVTT document into cues (best-effort). */
export function parseWebVtt(body: string): VttCue[] {
  const text = String(body || '').replace(/^\uFEFF/, '');
  if (!/^WEBVTT/i.test(text.trimStart())) {
    // Still try if it's cue-only
  }
  const blocks = text.split(/\r?\n\r?\n+/);
  const cues: VttCue[] = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.length);
    if (!lines.length) continue;
    if (/^WEBVTT/i.test(lines[0]!) || /^NOTE\b/i.test(lines[0]!)) continue;
    let id: string | undefined;
    let timingIdx = 0;
    if (!/-->/.test(lines[0]!)) {
      id = lines[0];
      timingIdx = 1;
    }
    const timing = lines[timingIdx];
    if (!timing || !/-->/.test(timing)) continue;
    const [startRaw, endRaw] = timing.split('-->').map((x) => x.trim().split(/\s+/)[0]!);
    const start = parseVttTimestamp(startRaw || '');
    const end = parseVttTimestamp(endRaw || '');
    const cueText = lines.slice(timingIdx + 1).join('\n');
    if (!cueText) continue;
    cues.push({ start, end, text: cueText, id });
  }
  return cues;
}

/** Serialize cues to WebVTT. */
export function serializeWebVtt(cues: VttCue[], header = 'WEBVTT\n'): string {
  const parts = [header.endsWith('\n') ? header : `${header}\n`];
  for (const c of cues) {
    if (c.id) parts.push(`${c.id}\n`);
    parts.push(`${formatVttTimestamp(c.start)} --> ${formatVttTimestamp(c.end)}\n`);
    parts.push(`${c.text}\n\n`);
  }
  return parts.join('');
}

/** Very light SRT → VTT. */
export function srtToVtt(srt: string): string {
  const body = String(srt || '')
    .replace(/^\uFEFF/, '')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  const cues: VttCue[] = [];
  for (const block of body.split(/\r?\n\r?\n+/)) {
    const lines = block.split(/\r?\n/).filter((l) => l.trim().length);
    if (lines.length < 2) continue;
    let i = 0;
    if (/^\d+$/.test(lines[0]!)) i = 1;
    const timing = lines[i];
    if (!timing || !/-->/.test(timing)) continue;
    const [a, b] = timing.split('-->').map((x) => x.trim());
    cues.push({
      start: parseVttTimestamp(a || ''),
      end: parseVttTimestamp(b || ''),
      text: lines.slice(i + 1).join('\n'),
    });
  }
  return serializeWebVtt(cues);
}
