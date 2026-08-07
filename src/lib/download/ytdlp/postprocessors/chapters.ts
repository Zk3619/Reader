/**
 * Chapters / Concat postprocessors.
 */

import type { PostProcessorContext, PostProcessorResult } from '../types';
import { PostProcessorBase } from './base';
import { remux } from './remux';

/** Split media by chapters via ffmpeg (best-effort). */
export class FFmpegSplitChaptersPP extends PostProcessorBase {
  name = 'FFmpegSplitChapters';
  async run(ctx: PostProcessorContext): Promise<PostProcessorResult> {
    const chapters = ctx.info.chapters || ctx.info.sponsorblock_chapters;
    const path = ctx.filename || ctx.info._filename;
    if (!path || !Array.isArray(chapters) || chapters.length < 2) {
      return { info: ctx.info, filename: ctx.filename };
    }
    const result = await remux({
      operation: 'split_chapters',
      outputPath: path,
      extra: {
        inputPath: path,
        chapters,
        duration: ctx.info.duration ?? undefined,
      },
    });
    if (result.warning) console.warn(`[${this.name}] ${result.warning}`);
    return { info: ctx.info, filename: result.outputPath || ctx.filename };
  }
}

/** Concat multiple local files listed in info._concat_files. */
export class FFmpegConcatPP extends PostProcessorBase {
  name = 'FFmpegConcat';
  async run(ctx: PostProcessorContext): Promise<PostProcessorResult> {
    const files = (ctx.info._concat_files as string[] | undefined) || ctx.options.paths?.concat;
    const list = Array.isArray(files) ? files.filter(Boolean) : [];
    if (list.length < 2 || !ctx.filename) {
      return { info: ctx.info, filename: ctx.filename };
    }
    const result = await remux({
      operation: 'merge',
      inputPaths: list,
      outputPath: ctx.filename,
    });
    if (result.warning) console.warn(`[${this.name}] ${result.warning}`);
    return { info: ctx.info, filename: result.outputPath || ctx.filename };
  }
}

/** Write .info.json beside the media file. */
export class WriteInfoJsonPP extends PostProcessorBase {
  name = 'WriteInfoJson';
  async run(ctx: PostProcessorContext): Promise<PostProcessorResult> {
    const path = ctx.filename || ctx.info._filename;
    if (!path) return { info: ctx.info, filename: ctx.filename };
    const jsonPath = path.replace(/\.[^.\\/]+$/, '') + '.info.json';
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const payload = JSON.stringify(ctx.info, null, 2);
      await invoke('write_binary_file', {
        path: jsonPath,
        data: Array.from(new TextEncoder().encode(payload)),
      });
      ctx.info._infojson_filename = jsonPath;
    } catch (e) {
      console.warn(`[${this.name}] ${(e as Error).message || e}`);
    }
    return { info: ctx.info, filename: ctx.filename };
  }
}
