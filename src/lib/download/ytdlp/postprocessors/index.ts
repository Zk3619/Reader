/**
 * PostProcessor stubs — FFmpegMerge, ExtractAudio, EmbedSubtitle, EmbedMetadata, SponsorBlock.
 */

import type { PostProcessorContext, PostProcessorResult, VideoInfo, YoutubeDLOptions } from '../types';
import { remux } from './remux';
import { PostProcessorBase, type PostProcessor } from './base';
import { XAttrMetadataPP } from './xattr';
import { MoveFilesAfterDownloadPP } from './movefiles';
import { ExecPP } from './exec';

export type { PostProcessor } from './base';
export { PostProcessorBase } from './base';

export class FFmpegMergerPP extends PostProcessorBase {
  name = 'FFmpegMerger';
  async run(ctx: PostProcessorContext): Promise<PostProcessorResult> {
    const formats = ctx.info.requested_formats;
    if (!formats || formats.length < 2) return { info: ctx.info, filename: ctx.filename };
    const result = await remux({
      operation: 'merge',
      inputPaths: formats.map((f) => (f.url as string) || '').filter(Boolean),
      outputPath: ctx.filename,
      extra: { format_ids: formats.map((f) => f.format_id) },
    });
    if (result.warning) {
      console.warn(`[${this.name}] ${result.warning}`);
    }
    return { info: ctx.info, filename: result.outputPath || ctx.filename };
  }
}

export class FFmpegExtractAudioPP extends PostProcessorBase {
  name = 'FFmpegExtractAudio';
  constructor(private preferredcodec = 'm4a') {
    super();
  }
  async run(ctx: PostProcessorContext): Promise<PostProcessorResult> {
    const result = await remux({
      operation: 'extract_audio',
      outputPath: ctx.filename,
      audioFormat: (ctx.options.audioformat as string) || this.preferredcodec,
      extra: { keepvideo: ctx.options.keepvideo },
    });
    if (result.warning) console.warn(`[${this.name}] ${result.warning}`);
    if (result.ok) {
      ctx.info.ext = this.preferredcodec;
      ctx.info.acodec = this.preferredcodec;
      ctx.info.vcodec = 'none';
    }
    return { info: ctx.info, filename: result.outputPath || ctx.filename };
  }
}

export class FFmpegEmbedSubtitlePP extends PostProcessorBase {
  name = 'FFmpegEmbedSubtitle';
  async run(ctx: PostProcessorContext): Promise<PostProcessorResult> {
    const result = await remux({
      operation: 'embed_subs',
      outputPath: ctx.filename,
      extra: { subtitles: ctx.info.requested_subtitles || ctx.info.subtitles },
    });
    if (result.warning) console.warn(`[${this.name}] ${result.warning}`);
    return { info: ctx.info, filename: result.outputPath || ctx.filename };
  }
}

export class FFmpegMetadataPP extends PostProcessorBase {
  name = 'FFmpegMetadata';
  async run(ctx: PostProcessorContext): Promise<PostProcessorResult> {
    const result = await remux({
      operation: 'embed_metadata',
      outputPath: ctx.filename,
      extra: {
        title: ctx.info.title,
        description: ctx.info.description,
        uploader: ctx.info.uploader,
        timestamp: ctx.info.timestamp,
      },
    });
    if (result.warning) console.warn(`[${this.name}] ${result.warning}`);
    return { info: ctx.info, filename: result.outputPath || ctx.filename };
  }
}

export class SponsorBlockPP extends PostProcessorBase {
  name = 'SponsorBlock';
  async run(ctx: PostProcessorContext): Promise<PostProcessorResult> {
    // Stub: would query sponsor.ajay.app and cut segments via remux
    const result = await remux({
      operation: 'sponsorblock',
      outputPath: ctx.filename,
      extra: { video_id: ctx.info.id, extractor: ctx.info.extractor },
    });
    if (result.warning) console.warn(`[${this.name}] ${result.warning}`);
    return { info: ctx.info, filename: result.outputPath || ctx.filename };
  }
}

export { XAttrMetadataPP } from './xattr';
export { MoveFilesAfterDownloadPP } from './movefiles';
export { ExecPP } from './exec';

export function defaultPostProcessors(options: YoutubeDLOptions): PostProcessor[] {
  const pps: PostProcessor[] = [];
  // Merge is implied when requested_formats length > 1
  pps.push(new FFmpegMergerPP());
  if (options.extractaudio) {
    pps.push(new FFmpegExtractAudioPP(String(options.audioformat || 'm4a')));
  }
  if (options.embedsubtitles) {
    pps.push(new FFmpegEmbedSubtitlePP());
  }
  if (options.addmetadata) {
    pps.push(new FFmpegMetadataPP());
  }
  if (options.postprocessors?.some((p) => String(p.key || p).includes('SponsorBlock'))) {
    pps.push(new SponsorBlockPP());
  }
  if (options.xattrs) {
    pps.push(new XAttrMetadataPP());
  }
  if (options.paths?.home) {
    pps.push(new MoveFilesAfterDownloadPP());
  }
  if (options.exec) {
    const cmds = Array.isArray(options.exec) ? options.exec : [options.exec];
    pps.push(new ExecPP(cmds.map(String)));
  }
  for (const pp of options.postprocessors || []) {
    const key = String(pp.key || pp);
    if (key.includes('XAttrMetadata')) pps.push(new XAttrMetadataPP());
    if (key.includes('MoveFiles')) pps.push(new MoveFilesAfterDownloadPP());
    if (key.includes('Exec')) {
      const cmd = pp.exec_cmd || pp.exec;
      if (cmd) pps.push(new ExecPP(Array.isArray(cmd) ? cmd.map(String) : [String(cmd)]));
    }
  }
  return pps;
}

export async function runPostProcessors(
  info: VideoInfo,
  options: YoutubeDLOptions,
  extra: PostProcessor[] = [],
): Promise<VideoInfo> {
  const pps = [...defaultPostProcessors(options), ...extra];
  let filename = info._filename;
  let current = info;
  for (const pp of pps) {
    // Only run merge when needed
    if (pp.name === 'FFmpegMerger' && !(current.requested_formats && current.requested_formats.length > 1)) {
      continue;
    }
    const result = await pp.run({ info: current, filename, options });
    current = result.info;
    filename = result.filename ?? filename;
  }
  if (filename) current._filename = filename;
  return current;
}

export * from './remux';
