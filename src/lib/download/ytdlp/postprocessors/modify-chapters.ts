/**
 * ModifyChaptersPP — remove chapter/sponsor ranges and rewrite chapter table (yt-dlp).
 */

import type { PostProcessorContext, PostProcessorResult } from '../types';
import { PostProcessorBase } from './base';
import { remux } from './remux';
import { mergeRanges, removeRangesToKeepRanges, type TimeRange } from './cut-ranges';

type ChapterLike = {
  start_time?: number;
  end_time?: number;
  title?: string;
  category?: string;
  _remove?: boolean;
};

export class ModifyChaptersPP extends PostProcessorBase {
  name = 'ModifyChapters';
  constructor(
    private opts: {
      remove_chapters_patterns?: Array<string | RegExp>;
      remove_sponsor_segments?: string[];
      remove_ranges?: Array<[number, number]>;
      force_keyframes?: boolean;
    } = {},
  ) {
    super();
  }

  async run(ctx: PostProcessorContext): Promise<PostProcessorResult> {
    const path = ctx.filename || ctx.info._filename;
    if (!path) return { info: ctx.info, filename: ctx.filename };

    const chapters = [...(ctx.info.chapters || [])] as ChapterLike[];
    const sponsor = [...(ctx.info.sponsorblock_chapters || [])] as ChapterLike[];
    const patterns = this.opts.remove_chapters_patterns || [];
    const sponsorCats = new Set(
      (this.opts.remove_sponsor_segments || []).map((s) => s.toLowerCase()),
    );
    const explicit =
      this.opts.remove_ranges ||
      (Array.isArray(ctx.options.remove_chapters)
        ? []
        : ((ctx.options as { remove_ranges?: Array<[number, number]> }).remove_ranges || []));

    const cuts: TimeRange[] = [];
    for (const [a, b] of explicit) {
      if (b > a) cuts.push({ start: a, end: b });
    }

    for (const ch of chapters) {
      const title = String(ch.title || '');
      const hit = patterns.some((p) =>
        typeof p === 'string' ? title.includes(p) : p.test(title),
      );
      if (hit && ch.end_time != null && ch.end_time > (ch.start_time || 0)) {
        cuts.push({ start: ch.start_time || 0, end: ch.end_time });
        (ch as ChapterLike)._remove = true;
      }
    }
    for (const ch of sponsor) {
      const cat = String(ch.category || ch.title || '').toLowerCase();
      if (
        (sponsorCats.size === 0 || [...sponsorCats].some((c) => cat.includes(c))) &&
        ch.end_time != null &&
        ch.end_time > (ch.start_time || 0)
      ) {
        // If remove_sponsor_segments empty but sponsorblock_remove set, use that
        const sb = ctx.options.sponsorblock_remove;
        const want =
          sponsorCats.size > 0 ||
          sb === true ||
          (Array.isArray(sb) && sb.length > 0) ||
          !!ctx.options.postprocessors?.some((p) =>
            String(p.key || p).includes('ModifyChapters'),
          );
        if (want) {
          cuts.push({ start: ch.start_time || 0, end: ch.end_time });
        }
      }
    }

    // Also honor remove_chapters option as regex strings
    const rmOpt = ctx.options.remove_chapters;
    if (typeof rmOpt === 'string' && rmOpt) {
      const re = new RegExp(rmOpt, 'i');
      for (const ch of chapters) {
        if (re.test(String(ch.title || '')) && ch.end_time != null) {
          cuts.push({ start: ch.start_time || 0, end: ch.end_time });
        }
      }
    } else if (Array.isArray(rmOpt)) {
      for (const pat of rmOpt) {
        const re = new RegExp(String(pat), 'i');
        for (const ch of chapters) {
          if (re.test(String(ch.title || '')) && ch.end_time != null) {
            cuts.push({ start: ch.start_time || 0, end: ch.end_time });
          }
        }
      }
    }

    const merged = mergeRanges(cuts);
    if (!merged.length) {
      return { info: ctx.info, filename: ctx.filename };
    }

    const duration = Number(ctx.info.duration) || merged[merged.length - 1]!.end;
    const keep = removeRangesToKeepRanges(
      merged.map((r) => [r.start, r.end] as [number, number]),
      duration,
    );
    if (!keep.length) {
      console.warn(`[${this.name}] refusing to remove entire video`);
      return { info: ctx.info, filename: ctx.filename };
    }

    const out = path.replace(/(\.[^.\\/]+)$/, '.mod$1');
    const forceKf =
      this.opts.force_keyframes || !!ctx.options.force_keyframes_at_cuts;
    const result = await remux({
      operation: 'sponsorblock_cut',
      outputPath: out,
      extra: {
        inputPath: path,
        keepRanges: keep,
        duration,
        force_keyframes: forceKf,
      },
    });
    if (result.warning) console.warn(`[${this.name}] ${result.warning}`);
    if (result.ok) {
      // Rebuild chapters relative to keep ranges
      ctx.info.chapters = rebuildChaptersAfterCuts(chapters, merged);
      ctx.info.duration = keep.reduce((s, r) => s + (r.end - r.start), 0);
      ctx.info._filename = result.outputPath || out;
    }
    return { info: ctx.info, filename: result.outputPath || ctx.filename };
  }
}

function rebuildChaptersAfterCuts(chapters: ChapterLike[], cuts: TimeRange[]): ChapterLike[] {
  const out: ChapterLike[] = [];
  for (const ch of chapters) {
    const start = ch.start_time || 0;
    const end = ch.end_time ?? start;
    if (cuts.some((c) => start >= c.start && end <= c.end)) continue;
    let shift = 0;
    for (const c of cuts) {
      if (c.end <= start) shift += c.end - c.start;
    }
    out.push({
      ...ch,
      start_time: Math.max(0, start - shift),
      end_time: Math.max(0, end - shift),
    });
  }
  return out;
}
