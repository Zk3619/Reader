/**
 * FFmpeg Video/Subtitles/Thumbnails Convertor + Remuxer (yt-dlp P5-5).
 */

import type { PostProcessorContext, PostProcessorResult } from '../types';
import { PostProcessorBase } from './base';
import { remux } from './remux';

function replaceExt(path: string, ext: string): string {
  return path.replace(/\.[^.\\/]+$/, '') + '.' + ext.replace(/^\./, '');
}

function resolveTargetExt(sourceExt: string, mapping?: string | null): string | null {
  if (!mapping) return null;
  const m = mapping.trim().toLowerCase();
  if (!m) return null;
  // "mp4" or "webm>mp4/mkv>mkv" style
  if (!m.includes('>') && !m.includes('/')) {
    return m === sourceExt ? null : m;
  }
  for (const part of m.split('/')) {
    const [from, to] = part.split('>').map((s) => s.trim().toLowerCase());
    if (!to) continue;
    if (!from || from === 'all' || from === sourceExt) {
      return to === sourceExt ? null : to;
    }
  }
  return null;
}

export class FFmpegVideoConvertorPP extends PostProcessorBase {
  name = 'FFmpegVideoConvertor';
  constructor(private preferredformat: string | null = null) {
    super();
  }
  async run(ctx: PostProcessorContext): Promise<PostProcessorResult> {
    const path = ctx.filename || ctx.info._filename;
    if (!path) return { info: ctx.info, filename: ctx.filename };
    const sourceExt = (ctx.info.ext || path.split('.').pop() || 'mp4').toLowerCase();
    const mapping =
      this.preferredformat ||
      (ctx.options.recodevideo as string | undefined) ||
      null;
    const target = resolveTargetExt(sourceExt, mapping);
    if (!target) return { info: ctx.info, filename: ctx.filename };
    const out = replaceExt(path, target);
    const result = await remux({
      operation: 'video_convert',
      inputPaths: [path],
      outputPath: out,
      extra: { inputPath: path, targetExt: target },
    });
    if (result.warning) console.warn(`[${this.name}] ${result.warning}`);
    if (result.ok) {
      ctx.info.ext = target;
      ctx.info._filename = result.outputPath || out;
    }
    return { info: ctx.info, filename: result.outputPath || ctx.filename };
  }
}

export class FFmpegVideoRemuxerPP extends PostProcessorBase {
  name = 'FFmpegVideoRemuxer';
  constructor(private preferredformat: string | null = null) {
    super();
  }
  async run(ctx: PostProcessorContext): Promise<PostProcessorResult> {
    const path = ctx.filename || ctx.info._filename;
    if (!path) return { info: ctx.info, filename: ctx.filename };
    const sourceExt = (ctx.info.ext || path.split('.').pop() || 'mp4').toLowerCase();
    const mapping =
      this.preferredformat ||
      (ctx.options.remuxvideo as string | undefined) ||
      null;
    const target = resolveTargetExt(sourceExt, mapping);
    if (!target) return { info: ctx.info, filename: ctx.filename };
    const out = replaceExt(path, target);
    const result = await remux({
      operation: 'video_remux',
      inputPaths: [path],
      outputPath: out,
      extra: { inputPath: path, targetExt: target },
    });
    if (result.warning) console.warn(`[${this.name}] ${result.warning}`);
    if (result.ok) {
      ctx.info.ext = target;
      ctx.info._filename = result.outputPath || out;
    }
    return { info: ctx.info, filename: result.outputPath || ctx.filename };
  }
}

export class FFmpegSubtitlesConvertorPP extends PostProcessorBase {
  name = 'FFmpegSubtitlesConvertor';
  constructor(private preferredformat = 'srt') {
    super();
  }
  async run(ctx: PostProcessorContext): Promise<PostProcessorResult> {
    const target =
      (ctx.options.convertsubtitles as string | undefined) || this.preferredformat;
    const subs = ctx.info.requested_subtitles || ctx.info.subtitles;
    if (!subs || typeof subs !== 'object') {
      return { info: ctx.info, filename: ctx.filename };
    }
    for (const [lang, list] of Object.entries(subs)) {
      const tracks = Array.isArray(list) ? list : [];
      for (const t of tracks) {
        const filepath = (t as { filepath?: string; url?: string }).filepath;
        const url = (t as { url?: string }).url;
        const src = filepath || url;
        if (!src) continue;
        const srcExt = (src.split('.').pop() || '').toLowerCase();
        if (srcExt === target) continue;
        const out = filepath
          ? replaceExt(filepath, target)
          : `${ctx.filename || 'sub'}.${lang}.${target}`;
        const result = await remux({
          operation: 'convert_subs',
          inputPaths: [src],
          outputPath: out,
          extra: { inputPath: src, targetExt: target },
        });
        if (result.ok) {
          (t as { filepath?: string; ext?: string }).filepath = result.outputPath || out;
          (t as { ext?: string }).ext = target;
        } else if (result.warning) {
          console.warn(`[${this.name}] ${lang}: ${result.warning}`);
        }
      }
    }
    return { info: ctx.info, filename: ctx.filename };
  }
}

export class FFmpegThumbnailsConvertorPP extends PostProcessorBase {
  name = 'FFmpegThumbnailsConvertor';
  constructor(private preferredformat = 'jpg') {
    super();
  }
  async run(ctx: PostProcessorContext): Promise<PostProcessorResult> {
    const target =
      (ctx.options.convertthumbnails as string | undefined) || this.preferredformat;
    const thumbs = Array.isArray(ctx.info.thumbnails) ? ctx.info.thumbnails : [];
    const single = ctx.info.thumbnail ? [{ url: ctx.info.thumbnail }] : [];
    const list = thumbs.length ? thumbs : single;
    for (const th of list) {
      const src = (th as { filepath?: string; url?: string }).filepath || th.url;
      if (!src) continue;
      const srcExt = (src.split('.').pop() || '').toLowerCase();
      if (srcExt === target || (srcExt === 'jpeg' && target === 'jpg')) continue;
      // Fix webp→jpg common case
      const outBase = (th as { filepath?: string }).filepath || `${ctx.filename || 'thumb'}.${target}`;
      const out = replaceExt(outBase.replace(/\.(webp|png|gif)$/i, `.${target}`), target);
      const result = await remux({
        operation: 'convert_thumb',
        inputPaths: [src],
        outputPath: out,
        extra: { inputPath: src, targetExt: target },
      });
      if (result.ok) {
        (th as { filepath?: string }).filepath = result.outputPath || out;
        if (ctx.info.thumbnail === src) ctx.info.thumbnail = result.outputPath || out;
      } else if (result.warning) {
        console.warn(`[${this.name}] ${result.warning}`);
      }
    }
    return { info: ctx.info, filename: ctx.filename };
  }
}
