/**
 * SponsorBlock — fetch segments from sponsor.ajay.app and attach as chapters.
 * Cutting via ffmpeg is best-effort (remux operation sponsorblock_cut).
 */

import type { PostProcessorContext, PostProcessorResult, VideoInfo } from '../types';
import { PostProcessorBase } from './base';
import { remux } from './remux';

export const SPONSORBLOCK_CATEGORIES: Record<string, string> = {
  sponsor: 'Sponsor',
  intro: 'Intermission/Intro Animation',
  outro: 'Endcards/Credits',
  selfpromo: 'Unpaid/Self Promotion',
  preview: 'Preview/Recap',
  filler: 'Filler Tangent',
  interaction: 'Interaction Reminder',
  music_offtopic: 'Non-Music Section',
  hook: 'Hook/Greetings',
  poi_highlight: 'Highlight',
  chapter: 'Chapter',
};

const EXTRACTOR_MAP: Record<string, string> = {
  Youtube: 'YouTube',
  youtube: 'YouTube',
  YoutubeTab: 'YouTube',
};

export type SponsorSegment = {
  category: string;
  segment: [number, number];
  UUID?: string;
  videoDuration?: number;
  description?: string;
};

export async function fetchSponsorBlockSegments(
  videoId: string,
  service = 'YouTube',
  apiBase = 'https://sponsor.ajay.app',
  categories?: string[],
): Promise<SponsorSegment[]> {
  const cats = categories?.length ? categories : Object.keys(SPONSORBLOCK_CATEGORIES);
  const base = apiBase.replace(/\/$/, '');
  const url =
    `${base}/api/skipSegments?videoID=${encodeURIComponent(videoId)}` +
    `&categories=${encodeURIComponent(JSON.stringify(cats))}` +
    `&service=${encodeURIComponent(service)}`;
  try {
    const http = await import('@/lib/http');
    const res = await http.request(url, {
      method: 'GET',
      useBackendHttp: true,
      allowNon2xx: true,
      ignorePageNavigationAbort: true,
    });
    if (res.status === 404) return [];
    if (res.status >= 400) throw new Error(`SponsorBlock HTTP ${res.status}`);
    const data = (await res.json()) as SponsorSegment[];
    return Array.isArray(data) ? data : [];
  } catch (primary) {
    if (typeof fetch === 'function') {
      const res = await fetch(url);
      if (res.status === 404) return [];
      if (!res.ok) throw new Error(`SponsorBlock HTTP ${res.status}`);
      const data = (await res.json()) as SponsorSegment[];
      return Array.isArray(data) ? data : [];
    }
    throw primary;
  }
}

export function segmentsToChapters(
  segments: SponsorSegment[],
  duration?: number | null,
): Array<{ start_time: number; end_time?: number; title: string; category?: string }> {
  const out: Array<{ start_time: number; end_time?: number; title: string; category?: string }> = [];
  for (const s of segments) {
    let [start, end] = s.segment || [0, 0];
    if (start === 0 && end === 0) continue;
    if (start <= 1) start = 0;
    if (duration && duration - end <= 1) end = duration;
    if (s.category === 'poi_highlight') end = start + 1;
    const title =
      s.category === 'chapter' && s.description
        ? s.description
        : SPONSORBLOCK_CATEGORIES[s.category] || s.category;
    out.push({ start_time: start, end_time: end, title, category: s.category });
  }
  return out.sort((a, b) => a.start_time - b.start_time);
}

/** Ranges to remove (skippable categories). */
export function skipRangesFromSegments(
  segments: SponsorSegment[],
  skipCategories: string[],
): Array<[number, number]> {
  const skip = new Set(skipCategories);
  const ranges: Array<[number, number]> = [];
  for (const s of segments) {
    if (!skip.has(s.category)) continue;
    if (s.category === 'poi_highlight' || s.category === 'chapter') continue;
    const [a, b] = s.segment || [0, 0];
    if (b > a) ranges.push([a, b]);
  }
  return ranges;
}

export class SponsorBlockPP extends PostProcessorBase {
  name = 'SponsorBlock';
  constructor(
    private categories: string[] = Object.keys(SPONSORBLOCK_CATEGORIES),
    private api = 'https://sponsor.ajay.app',
    private remove = false,
  ) {
    super();
  }

  async run(ctx: PostProcessorContext): Promise<PostProcessorResult> {
    const key = String(ctx.info.extractor_key || ctx.info.extractor || '');
    const service = EXTRACTOR_MAP[key];
    if (!service) {
      console.info(`[${this.name}] not supported for ${key || 'unknown'}`);
      return { info: ctx.info, filename: ctx.filename };
    }
    if (!ctx.info.id) return { info: ctx.info, filename: ctx.filename };

    try {
      const segments = await fetchSponsorBlockSegments(
        ctx.info.id,
        service,
        this.api,
        this.categories,
      );
      const chapters = segmentsToChapters(segments, ctx.info.duration);
      (ctx.info as VideoInfo & { sponsorblock_chapters?: unknown }).sponsorblock_chapters =
        chapters;
      if (!ctx.info.chapters?.length && chapters.length) {
        ctx.info.chapters = chapters.map((c) => ({
          start_time: c.start_time,
          title: c.title,
        }));
      }

      if (this.remove && ctx.filename && chapters.length) {
        const ranges = skipRangesFromSegments(segments, this.categories);
        if (ranges.length) {
          const result = await remux({
            operation: 'sponsorblock_cut',
            outputPath: ctx.filename,
            extra: {
              inputPath: ctx.filename,
              removeRanges: ranges,
              duration: ctx.info.duration ?? undefined,
            },
          });
          if (result.warning) console.warn(`[${this.name}] ${result.warning}`);
          return { info: ctx.info, filename: result.outputPath || ctx.filename };
        }
      }
    } catch (e) {
      console.warn(`[${this.name}] ${(e as Error).message || e}`);
    }
    return { info: ctx.info, filename: ctx.filename };
  }
}
