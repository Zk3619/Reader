/**
 * PostProcessor registry — FFmpeg merge/audio/subs/metadata, Convertors, Fixups, Chapters.
 */

import type { PostProcessorContext, PostProcessorResult, VideoInfo, YoutubeDLOptions } from '../types';
import { remux } from './remux';
import { PostProcessorBase, type PostProcessor } from './base';
import { XAttrMetadataPP } from './xattr';
import { MoveFilesAfterDownloadPP } from './movefiles';
import { ExecPP } from './exec';
import {
  EmbedThumbnailPP,
  FFmpegCopyStreamPP,
  FFmpegFixupDuplicateMoovPP,
  FFmpegFixupDurationPP,
  FFmpegFixupM3u8PP,
  FFmpegFixupM4aPP,
  FFmpegFixupStretchedPP,
  FFmpegFixupTimestampPP,
} from './fixup';
import { SponsorBlockPP } from './sponsorblock';
import { FFmpegSplitChaptersPP, FFmpegConcatPP, WriteInfoJsonPP } from './chapters';
import {
  FFmpegSubtitlesConvertorPP,
  FFmpegThumbnailsConvertorPP,
  FFmpegVideoConvertorPP,
  FFmpegVideoRemuxerPP,
} from './convertors';
import { ModifyChaptersPP } from './modify-chapters';
import { MetadataFromFieldPP, MetadataParserPP } from './metadataparser';

export type { PostProcessor } from './base';
export { PostProcessorBase } from './base';
export {
  EmbedThumbnailPP,
  FFmpegCopyStreamPP,
  FFmpegFixupDuplicateMoovPP,
  FFmpegFixupDurationPP,
  FFmpegFixupM3u8PP,
  FFmpegFixupM4aPP,
  FFmpegFixupStretchedPP,
  FFmpegFixupTimestampPP,
} from './fixup';
export { SponsorBlockPP, fetchSponsorBlockSegments, segmentsToChapters } from './sponsorblock';
export { FFmpegSplitChaptersPP, FFmpegConcatPP, WriteInfoJsonPP } from './chapters';
export {
  FFmpegSubtitlesConvertorPP,
  FFmpegThumbnailsConvertorPP,
  FFmpegVideoConvertorPP,
  FFmpegVideoRemuxerPP,
} from './convertors';
export { ModifyChaptersPP } from './modify-chapters';
export { MetadataFromFieldPP, MetadataParserPP } from './metadataparser';
export {
  WriteDescriptionPP,
  WriteThumbnailPP,
  WriteSubtitlesPP,
  writeSidecars,
} from './sidecar';
export {
  removeRangesToKeepRanges,
  mergeRanges,
  chaptersToSplitRanges,
  type TimeRange,
} from './cut-ranges';

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
    const path = ctx.filename || ctx.info._filename;
    const codec = String(ctx.options.audioformat || this.preferredcodec);
    const out = path
      ? path.replace(/\.[^.\\/]+$/, '') + '.' + codec.replace(/^\./, '')
      : ctx.filename;
    const result = await remux({
      operation: 'video_convert',
      inputPaths: path ? [path] : undefined,
      outputPath: out || ctx.filename,
      audioFormat: codec,
      extra: {
        inputPath: path,
        targetExt: codec,
        keepvideo: ctx.options.keepvideo,
      },
    });
    if (result.warning) console.warn(`[${this.name}] ${result.warning}`);
    if (result.ok) {
      ctx.info.ext = codec;
      ctx.info.acodec = codec;
      ctx.info.vcodec = 'none';
      if (result.outputPath) ctx.info._filename = result.outputPath;
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
        chapters: ctx.info.chapters,
      },
    });
    // 无 ffmpeg 时的跳过属于预期，降为 info，避免误当成下载失败
    if (result.warning) {
      const skip = /跳过写入元数据|成片可正常播放/i.test(result.warning);
      if (skip) console.info(`[${this.name}] ${result.warning}`);
      else console.warn(`[${this.name}] ${result.warning}`);
    }
    return { info: ctx.info, filename: result.outputPath || ctx.filename };
  }
}

export { XAttrMetadataPP } from './xattr';
export { MoveFilesAfterDownloadPP } from './movefiles';
export { ExecPP } from './exec';

function ppKeyIncludes(
  options: YoutubeDLOptions,
  ...needles: string[]
): boolean {
  return !!options.postprocessors?.some((p) => {
    const key = String(p.key || p);
    return needles.some((n) => key.includes(n));
  });
}

export function defaultPostProcessors(options: YoutubeDLOptions): PostProcessor[] {
  const pps: PostProcessor[] = [];
  pps.push(new FFmpegMergerPP());

  if (options.parse_metadata || ppKeyIncludes(options, 'MetadataParser', 'MetadataFromField')) {
    if (ppKeyIncludes(options, 'MetadataFromField')) {
      const fields =
        options.postprocessors
          ?.filter((p) => String(p.key || p).includes('MetadataFromField'))
          .flatMap((p) => {
            const f = p.formats || p.fields;
            return Array.isArray(f) ? f.map(String) : [];
          }) || [];
      pps.push(new MetadataFromFieldPP(fields));
    } else {
      pps.push(new MetadataParserPP());
    }
  }

  if (options.extractaudio) {
    pps.push(new FFmpegExtractAudioPP(String(options.audioformat || 'm4a')));
  }
  if (options.remuxvideo || ppKeyIncludes(options, 'FFmpegVideoRemuxer', 'VideoRemuxer')) {
    pps.push(new FFmpegVideoRemuxerPP(options.remuxvideo ? String(options.remuxvideo) : null));
  }
  if (options.recodevideo || ppKeyIncludes(options, 'FFmpegVideoConvertor', 'VideoConvertor')) {
    pps.push(new FFmpegVideoConvertorPP(options.recodevideo ? String(options.recodevideo) : null));
  }
  if (options.convertsubtitles || ppKeyIncludes(options, 'SubtitlesConvertor')) {
    pps.push(
      new FFmpegSubtitlesConvertorPP(String(options.convertsubtitles || 'srt')),
    );
  }
  if (options.convertthumbnails || ppKeyIncludes(options, 'ThumbnailsConvertor')) {
    pps.push(
      new FFmpegThumbnailsConvertorPP(String(options.convertthumbnails || 'jpg')),
    );
  }
  if (options.embedsubtitles) {
    pps.push(new FFmpegEmbedSubtitlePP());
  }
  if (options.addmetadata) {
    pps.push(new FFmpegMetadataPP());
  }
  if (options.embedthumbnail) {
    pps.push(new EmbedThumbnailPP());
  }

  // Fixup family (always eligible; each PP no-ops when not needed)
  pps.push(new FFmpegFixupM3u8PP());
  pps.push(new FFmpegFixupM4aPP());
  pps.push(new FFmpegFixupStretchedPP());
  pps.push(new FFmpegFixupTimestampPP());
  if (ppKeyIncludes(options, 'FixupDuration')) pps.push(new FFmpegFixupDurationPP());
  if (ppKeyIncludes(options, 'FixupDuplicateMoov') || options.fixup === 'force') {
    pps.push(new FFmpegFixupDuplicateMoovPP());
  } else {
    pps.push(new FFmpegFixupDuplicateMoovPP());
  }
  if (ppKeyIncludes(options, 'FFmpegCopyStream')) pps.push(new FFmpegCopyStreamPP());

  const wantsSb =
    !!options.sponsorblock_remove ||
    ppKeyIncludes(options, 'SponsorBlock');
  if (wantsSb) {
    const remove = !!options.sponsorblock_remove;
    const cats = Array.isArray(options.sponsorblock_remove)
      ? options.sponsorblock_remove.map(String)
      : undefined;
    pps.push(new SponsorBlockPP(cats, 'https://sponsor.ajay.app', remove));
  }

  if (
    options.remove_chapters ||
    ppKeyIncludes(options, 'ModifyChapters') ||
    (wantsSb && options.sponsorblock_remove)
  ) {
    const cats = Array.isArray(options.sponsorblock_remove)
      ? options.sponsorblock_remove.map(String)
      : undefined;
    pps.push(
      new ModifyChaptersPP({
        remove_sponsor_segments: cats,
        force_keyframes: !!options.force_keyframes_at_cuts,
      }),
    );
  }

  if (ppKeyIncludes(options, 'SplitChapters')) {
    pps.push(new FFmpegSplitChaptersPP());
  }
  if (ppKeyIncludes(options, 'FFmpegConcat')) {
    pps.push(new FFmpegConcatPP());
  }
  if (options.writeinfojson || ppKeyIncludes(options, 'WriteInfoJson')) {
    pps.push(new WriteInfoJsonPP());
  }

  if (options.xattrs || ppKeyIncludes(options, 'XAttrMetadata')) {
    pps.push(new XAttrMetadataPP());
  }
  if (options.paths?.home || ppKeyIncludes(options, 'MoveFiles')) {
    pps.push(new MoveFilesAfterDownloadPP());
  }
  if (options.exec || ppKeyIncludes(options, 'Exec')) {
    const cmds = Array.isArray(options.exec)
      ? options.exec
      : options.exec
        ? [options.exec]
        : [];
    for (const pp of options.postprocessors || []) {
      if (String(pp.key || pp).includes('Exec')) {
        const cmd = pp.exec_cmd || pp.exec;
        if (cmd) cmds.push(...(Array.isArray(cmd) ? cmd.map(String) : [String(cmd)]));
      }
    }
    if (cmds.length) pps.push(new ExecPP(cmds.map(String)));
  }

  for (const pp of options.postprocessors || []) {
    const key = String(pp.key || pp);
    if (key.includes('EmbedThumbnail')) pps.push(new EmbedThumbnailPP());
    if (key.includes('WriteInfoJson')) pps.push(new WriteInfoJsonPP());
  }
  return pps;
}

export async function runPostProcessors(
  info: VideoInfo,
  options: YoutubeDLOptions,
  extra: PostProcessor[] = [],
): Promise<VideoInfo> {
  const pps = [...defaultPostProcessors(options), ...extra];
  let filename: string | undefined =
    typeof info._filename === 'string'
      ? info._filename
      : typeof info.filepath === 'string'
        ? info.filepath
        : undefined;
  let current: VideoInfo = { ...info, __real_download: info.__real_download ?? true };
  // de-dupe by name while preserving order
  const seen = new Set<string>();
  const unique = pps.filter((pp) => {
    if (seen.has(pp.name)) return false;
    seen.add(pp.name);
    return true;
  });
  for (const pp of unique) {
    if (
      pp.name === 'FFmpegMerger' &&
      !(current.requested_formats && current.requested_formats.length > 1)
    ) {
      continue;
    }
    const result = await pp.run({ info: current, filename, options });
    current = result.info;
    filename = result.filename ?? filename;
  }
  if (filename) {
    current._filename = filename;
    current.filepath = filename;
  }
  return current;
}

export * from './remux';
