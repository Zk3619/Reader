/**
 * DailyMailIE — ported from yt-dlp dailymail.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, int_or_none, join_nonempty, try_get, unescapeHTML } from '../../utils';

function determineProtocol(url: string): string {
  const ext = determine_ext(url);
  if (ext === 'm3u8') return 'm3u8_native';
  return /^https:/i.test(url) ? 'https' : 'http';
}

export class DailyMailIE extends InfoExtractor {
  static IE_NAME = 'dailymail';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?dailymail\.co\.uk\/(?:video\/[^/]+\/video-|embed\/video\/)(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const videoData = this._parse_json<Record<string, unknown>>(
      this._search_regex(/data-opts='({.+?})'/, webpage, 'video data')!,
      videoId,
    )!;
    const title = unescapeHTML(String(videoData.title ?? ''));

    const sourcesUrl =
      try_get(
        videoData,
        [
          (x: Record<string, unknown>) => (x.plugins as Record<string, unknown>)?.sources as Record<string, unknown>,
          (x: Record<string, unknown>) => x.sources as Record<string, unknown>,
        ],
        (v) => typeof v === 'object',
      )?.url ??
      `http://www.dailymail.co.uk/api/player/${videoId}/video-sources.json`;

    let videoSources = await this._download_json<Record<string, unknown>>(String(sourcesUrl), videoId);
    const body = videoSources.body as Record<string, unknown> | undefined;
    if (body) videoSources = body;

    const formats: Format[] = [];
    const renditions = Array.isArray(videoSources.renditions)
      ? (videoSources.renditions as Record<string, unknown>[])
      : [];
    for (const rendition of renditions) {
      const renditionUrl = rendition.url as string | undefined;
      if (!renditionUrl) continue;
      const tbr = int_or_none(rendition.encodingRate, 1000) ?? undefined;
      const container = rendition.videoContainer as string | undefined;
      const isHls = container === 'M2TS';
      const protocol = isHls ? 'm3u8_native' : determineProtocol(renditionUrl);
      formats.push({
        format_id: join_nonempty(isHls ? 'hls' : protocol, tbr != null ? String(tbr) : null),
        url: renditionUrl,
        width: int_or_none(rendition.frameWidth) ?? undefined,
        height: int_or_none(rendition.frameHeight) ?? undefined,
        tbr,
        vcodec: (rendition.videoCodec as string) ?? undefined,
        container,
        protocol,
        ext: isHls ? 'mp4' : undefined,
      });
    }

    return {
      id: videoId,
      title,
      description: unescapeHTML(String(videoData.descr ?? '')) || undefined,
      thumbnail: (videoData.poster as string) || (videoData.thumbnail as string) || undefined,
      formats,
    };
  }
}
