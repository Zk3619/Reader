/** StreamableIE — ported from yt-dlp streamable.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { float_or_none, int_or_none, parse_codecs, try_get } from '../../utils';
import { protoRelative } from './_helpers';

export class StreamableIE extends InfoExtractor {
  static IE_NAME = 'streamable';
  static _VALID_URL = /https?:\/\/streamable\.com\/(?:[es]\/)?(?<id>\w+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const video = await this._download_json<Record<string, unknown>>(
      `https://ajax.streamable.com/videos/${videoId}`,
      videoId,
    );
    const status = video.status;
    if (status !== 2) {
      throw new ExtractorError(
        'This video is currently unavailable. It may still be uploading or processing.',
        { expected: true },
      );
    }
    const title = String(video.reddit_title || video.title || videoId);
    const formats: Format[] = [];
    const files = (video.files as Record<string, Record<string, unknown>>) || {};
    for (const [key, info] of Object.entries(files)) {
      if (!info.url) continue;
      const src = protoRelative(String(info.url));
      const vcodec = parse_codecs(
        try_get(info, (x: Record<string, unknown>) =>
          String((x.input_metadata as Record<string, unknown>)?.video_codec_name || ''),
        ),
      ).vcodec;
      const acodec = parse_codecs(
        try_get(info, (x: Record<string, unknown>) =>
          String((x.input_metadata as Record<string, unknown>)?.audio_codec_name || ''),
        ),
      ).acodec;
      formats.push({
        format_id: key,
        url: src,
        width: int_or_none(info.width) ?? undefined,
        height: int_or_none(info.height) ?? undefined,
        filesize: int_or_none(info.size) ?? undefined,
        fps: int_or_none(info.framerate) ?? undefined,
        vbr: float_or_none(info.bitrate, 1000) ?? undefined,
        vcodec,
        acodec,
      });
    }
    const owner = video.owner as Record<string, unknown> | undefined;
    return {
      id: videoId,
      title,
      description: (video.description as string) || undefined,
      thumbnail: protoRelative(String(video.thumbnail_url || '')) || undefined,
      uploader: (owner?.user_name as string) || undefined,
      timestamp: float_or_none(video.date_added) ?? undefined,
      duration: float_or_none(video.duration) ?? undefined,
      view_count: int_or_none(video.plays) ?? undefined,
      formats,
    };
  }
}
