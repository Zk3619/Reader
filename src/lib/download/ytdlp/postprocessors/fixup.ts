/**
 * EmbedThumbnail + FFmpeg Fixup postprocessors (yt-dlp subset).
 */

import type { PostProcessorContext, PostProcessorResult } from '../types';
import { PostProcessorBase } from './base';
import { remux } from './remux';

/** Download thumbnail URL and embed via ffmpeg when available. */
export class EmbedThumbnailPP extends PostProcessorBase {
  name = 'EmbedThumbnail';
  async run(ctx: PostProcessorContext): Promise<PostProcessorResult> {
    const thumb =
      ctx.info.thumbnail ||
      (Array.isArray(ctx.info.thumbnails) && ctx.info.thumbnails.length
        ? [...ctx.info.thumbnails].sort(
            (a, b) => (Number(b.preference) || 0) - (Number(a.preference) || 0),
          )[0]?.url
        : undefined);
    if (!thumb || !ctx.filename) {
      return { info: ctx.info, filename: ctx.filename };
    }
    const result = await remux({
      operation: 'embed_thumbnail',
      outputPath: ctx.filename,
      extra: { thumbnailUrl: thumb, inputPath: ctx.filename },
    });
    if (result.warning) console.warn(`[${this.name}] ${result.warning}`);
    return { info: ctx.info, filename: result.outputPath || ctx.filename };
  }
}

/** Remux m3u8/ts leftovers into mp4 (fixup). */
export class FFmpegFixupM3u8PP extends PostProcessorBase {
  name = 'FFmpegFixupM3u8';
  async run(ctx: PostProcessorContext): Promise<PostProcessorResult> {
    const path = ctx.filename || ctx.info._filename;
    if (!path || !/\.(ts|m3u8|mpegts)$/i.test(path)) {
      return { info: ctx.info, filename: ctx.filename };
    }
    const out = path.replace(/\.(ts|m3u8|mpegts)$/i, '.mp4');
    const result = await remux({
      operation: 'fixup_m3u8',
      inputPaths: [path],
      outputPath: out,
    });
    if (result.warning) console.warn(`[${this.name}] ${result.warning}`);
    if (result.ok) {
      ctx.info.ext = 'mp4';
      ctx.info._filename = result.outputPath || out;
    }
    return { info: ctx.info, filename: result.outputPath || ctx.filename };
  }
}

/** Ensure m4a container is correct (aac in m4a). */
export class FFmpegFixupM4aPP extends PostProcessorBase {
  name = 'FFmpegFixupM4a';
  async run(ctx: PostProcessorContext): Promise<PostProcessorResult> {
    const path = ctx.filename || ctx.info._filename;
    if (!path || !/\.m4a$/i.test(path)) {
      return { info: ctx.info, filename: ctx.filename };
    }
    const result = await remux({
      operation: 'fixup_m4a',
      inputPaths: [path],
      outputPath: path,
    });
    if (result.warning) console.warn(`[${this.name}] ${result.warning}`);
    return { info: ctx.info, filename: result.outputPath || ctx.filename };
  }
}
