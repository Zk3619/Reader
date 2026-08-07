/**
 * process_subtitles — yt-dlp YoutubeDL.process_subtitles subset.
 */

import type { Subtitle, VideoInfo, YoutubeDLOptions } from './types';

function pickLangs(
  available: Record<string, Subtitle[]>,
  normalKeys: string[],
  options: YoutubeDLOptions,
): string[] {
  const all = Object.keys(available);
  if (!all.length) return [];

  if (options.allsubtitles) return all;

  const wanted = options.subtitleslangs;
  if (wanted?.length) {
    const out: string[] = [];
    for (const spec of wanted) {
      const s = String(spec);
      if (s === 'all') {
        for (const lang of all) if (!out.includes(lang)) out.push(lang);
        continue;
      }
      if (s.startsWith('-')) {
        const re = new RegExp(s.slice(1), 'i');
        for (const lang of all) if (re.test(lang) && !out.includes(lang)) out.push(lang);
        continue;
      }
      try {
        const re = new RegExp(`^${s}$`, 'i');
        for (const lang of all) if (re.test(lang) && !out.includes(lang)) out.push(lang);
      } catch {
        if (available[s] && !out.includes(s)) out.push(s);
      }
    }
    return out;
  }

  // Default: prefer en / first available
  for (const lang of normalKeys) {
    if (lang === 'en' || lang.startsWith('en')) return [lang];
  }
  for (const lang of all) {
    if (lang === 'en' || lang.startsWith('en')) return [lang];
  }
  return all.slice(0, 1);
}

function pickFormat(formats: Subtitle[], preference: string[]): Subtitle {
  for (const ext of preference) {
    if (ext === 'best') return formats[formats.length - 1]!;
    const matches = formats.filter((f) => (f.ext || '') === ext);
    if (matches.length) return matches[matches.length - 1]!;
  }
  return formats[formats.length - 1]!;
}

/**
 * Select requested_subtitles dict (lang → single Subtitle), or null.
 */
export function processSubtitles(
  videoId: string,
  info: VideoInfo,
  options: YoutubeDLOptions,
  reportWarning?: (msg: string) => void,
): Record<string, Subtitle> | null {
  const writesub = !!options.writesubtitles;
  const writeauto = !!options.writeautomaticsub;
  if (!writesub && !writeauto) return null;

  const available: Record<string, Subtitle[]> = {};
  const normalKeys: string[] = [];
  if (writesub && info.subtitles) {
    for (const [lang, list] of Object.entries(info.subtitles)) {
      if (list?.length) {
        available[lang] = list;
        normalKeys.push(lang);
      }
    }
  }
  if (writeauto && info.automatic_captions) {
    for (const [lang, list] of Object.entries(info.automatic_captions)) {
      if (list?.length && !available[lang]) available[lang] = list;
    }
  }
  if (!Object.keys(available).length) return null;

  const langs = pickLangs(available, normalKeys, options);
  const pref = String(options.subtitlesformat || 'best').split('/');
  const subs: Record<string, Subtitle> = {};
  for (const lang of langs) {
    const formats = available[lang];
    if (!formats?.length) {
      reportWarning?.(`${lang} subtitles not available for ${videoId}`);
      continue;
    }
    subs[lang] = pickFormat(formats, pref);
  }
  return Object.keys(subs).length ? subs : null;
}
