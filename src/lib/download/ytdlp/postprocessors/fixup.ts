/**
 * EmbedThumbnail + FFmpeg Fixup postprocessors (yt-dlp family).
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
    const proto = String(ctx.info.protocol || '');
    if (
      !path ||
      (!/\.(ts|m3u8|mpegts)$/i.test(path) &&
        !/m3u8/i.test(proto) &&
        ctx.info.container !== 'mpegts')
    ) {
      return { info: ctx.info, filename: ctx.filename };
    }
    const out = /\.(ts|m3u8|mpegts)$/i.test(path)
      ? path.replace(/\.(ts|m3u8|mpegts)$/i, '.mp4')
      : `${path}.mp4`;
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

/** Ensure m4a container is correct (aac in m4a / m4a_dash). */
export class FFmpegFixupM4aPP extends PostProcessorBase {
  name = 'FFmpegFixupM4a';
  async run(ctx: PostProcessorContext): Promise<PostProcessorResult> {
    const path = ctx.filename || ctx.info._filename;
    if (!path || (!/\.m4a$/i.test(path) && ctx.info.container !== 'm4a_dash')) {
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

/** Correct stretched ratio (SAR) by scaling. */
export class FFmpegFixupStretchedPP extends PostProcessorBase {
  name = 'FFmpegFixupStretched';
  async run(ctx: PostProcessorContext): Promise<PostProcessorResult> {
    const path = ctx.filename || ctx.info._filename;
    const ratio = Number(
      (ctx.info as { stretched_ratio?: number }).stretched_ratio ??
        (ctx.info.requested_formats?.[0] as { stretched_ratio?: number } | undefined)
          ?.stretched_ratio,
    );
    if (!path || !Number.isFinite(ratio) || ratio === 1 || ratio <= 0) {
      return { info: ctx.info, filename: ctx.filename };
    }
    const out = path.replace(/(\.[^.\\/]+)$/, '.fixup$1');
    const result = await remux({
      operation: 'fixup_stretched',
      inputPaths: [path],
      outputPath: out,
      extra: { inputPath: path, stretched_ratio: ratio },
    });
    if (result.warning) console.warn(`[${this.name}] ${result.warning}`);
    if (result.ok) ctx.info._filename = result.outputPath || out;
    return { info: ctx.info, filename: result.outputPath || ctx.filename };
  }
}

/** Reset timestamps (websocket_frag / live). */
export class FFmpegFixupTimestampPP extends PostProcessorBase {
  name = 'FFmpegFixupTimestamp';
  async run(ctx: PostProcessorContext): Promise<PostProcessorResult> {
    const path = ctx.filename || ctx.info._filename;
    const proto = String(ctx.info.protocol || '');
    const need =
      /websocket/i.test(proto) ||
      ctx.info.__real_download === true ||
      !!ctx.options.postprocessors?.some((p) =>
        String(p.key || p).includes('FixupTimestamp'),
      );
    if (!path || !need) return { info: ctx.info, filename: ctx.filename };
    const out = path.replace(/(\.[^.\\/]+)$/, '.tsfix$1');
    const result = await remux({
      operation: 'fixup_copy',
      inputPaths: [path],
      outputPath: out,
      extra: { inputPath: path, resetTimestamps: true },
    });
    if (result.warning) console.warn(`[${this.name}] ${result.warning}`);
    if (result.ok) ctx.info._filename = result.outputPath || out;
    return { info: ctx.info, filename: result.outputPath || ctx.filename };
  }
}

/** Re-mux to fix declared duration mismatch. */
export class FFmpegFixupDurationPP extends PostProcessorBase {
  name = 'FFmpegFixupDuration';
  async run(ctx: PostProcessorContext): Promise<PostProcessorResult> {
    const path = ctx.filename || ctx.info._filename;
    if (!path) return { info: ctx.info, filename: ctx.filename };
    const out = path.replace(/(\.[^.\\/]+)$/, '.dur$1');
    const result = await remux({
      operation: 'fixup_copy',
      inputPaths: [path],
      outputPath: out,
      extra: { inputPath: path, resetTimestamps: true },
    });
    if (result.warning) console.warn(`[${this.name}] ${result.warning}`);
    if (result.ok) ctx.info._filename = result.outputPath || out;
    return { info: ctx.info, filename: result.outputPath || ctx.filename };
  }
}

/** Drop duplicate moov atoms (DASH multi-period leftovers). */
export class FFmpegFixupDuplicateMoovPP extends PostProcessorBase {
  name = 'FFmpegFixupDuplicateMoov';
  async run(ctx: PostProcessorContext): Promise<PostProcessorResult> {
    const path = ctx.filename || ctx.info._filename;
    const proto = String(ctx.info.protocol || '');
    if (
      !path ||
      (!/dash|ism|f4m/i.test(proto) &&
        !(ctx.info as { is_dash_periods?: boolean }).is_dash_periods)
    ) {
      return { info: ctx.info, filename: ctx.filename };
    }
    const out = path.replace(/(\.[^.\\/]+)$/, '.moov$1');
    const result = await remux({
      operation: 'fixup_copy',
      inputPaths: [path],
      outputPath: out,
      extra: { inputPath: path },
    });
    if (result.warning) console.warn(`[${this.name}] ${result.warning}`);
    if (result.ok) ctx.info._filename = result.outputPath || out;
    return { info: ctx.info, filename: result.outputPath || ctx.filename };
  }
}

/** Alias for Duration stream-copy base. */
export class FFmpegCopyStreamPP extends FFmpegFixupDurationPP {
  name = 'FFmpegCopyStream';
}
