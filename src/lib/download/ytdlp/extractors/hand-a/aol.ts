/**
 * AolIE — aligned with yt-dlp aol.py (main API + Yahoo UUID fallback)
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, parse_qs, url_or_none } from '../../utils';

async function extractYahooVideo(
  ie: InfoExtractor,
  videoId: string,
  country = 'us',
): Promise<VideoInfo> {
  const mediaObj = await ie._download_json<Record<string, unknown>>(
    `https://video-api.yql.yahoo.com/v1/video/sapi/streams/${videoId}`,
    videoId,
    'Downloading Yahoo video JSON metadata',
  );
  const meta = (mediaObj as { query?: { results?: { mediaObj?: Record<string, unknown>[] } } })
    ?.query?.results?.mediaObj?.[0]?.meta as Record<string, unknown> | undefined;
  if (!meta) throw new ExtractorError('Unable to extract Yahoo video metadata', { expected: true });

  const isLive = meta.uplynk_live === true;
  const fmts = isLive ? (['m3u8'] as const) : (['webm', 'mp4'] as const);
  const formats: Format[] = [];

  for (const fmt of fmts) {
    const streamData = await ie._download_json<Record<string, unknown>>(
      `https://video-api.yql.yahoo.com/v1/video/sapi/streams/${videoId}`,
      videoId,
      undefined,
      { query: { format: fmt, region: country === 'malaysia' ? 'my' : country, lang: 'en-US' } },
    );
    const streams =
      (streamData as { query?: { results?: { streams?: Record<string, unknown>[] } } })?.query
        ?.results?.streams || [];
    for (const s of streams) {
      const u = url_or_none(s.host);
      if (!u) continue;
      if (String(s.format).includes('m3u8')) {
        formats.push(...(await ie._extract_m3u8_formats(u, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)));
      } else {
        formats.push({ url: u, format_id: String(s.quality || fmt), ext: fmt === 'webm' ? 'webm' : 'mp4' });
      }
    }
  }

  return {
    id: videoId,
    title: String(meta.title || videoId),
    description: meta.description != null ? String(meta.description) : null,
    duration: int_or_none(meta.duration),
    timestamp: int_or_none(meta.publish_time),
    uploader: meta.provider_name != null ? String(meta.provider_name) : undefined,
    formats,
    extractor: 'aol.com',
    extractor_key: 'Aol',
  };
}

export class AolIE extends InfoExtractor {
  static IE_NAME = 'aol.com';
  static _VALID_URL =
    /(?:aol-video:|https?:\/\/(?:www\.)?aol\.(?:com|ca|co\.uk|de|jp)\/video\/(?:[^/]+\/)*)(?<id>\d{9}|[0-9a-f]{24}|[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    if (videoId.includes('-')) {
      return extractYahooVideo(this, videoId, 'us');
    }

    const response = await this._download_json<{ response?: Record<string, unknown> }>(
      `https://feedapi.b2c.on.aol.com/v1.0/app/videos/aolon/${videoId}/details`,
      videoId,
    );
    const resp = response.response;
    if (!resp || resp.statusText !== 'Ok') {
      throw new ExtractorError(`${AolIE.IE_NAME} said: ${resp?.statusText || 'error'}`, { expected: true });
    }

    const videoData = resp.data as Record<string, unknown>;
    const formats: Format[] = [];
    const m3u8Url = url_or_none(videoData.videoMasterPlaylist);
    if (m3u8Url) {
      formats.push(
        ...(await this._extract_m3u8_formats(m3u8Url, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
      );
    }
    for (const rendition of (videoData.renditions as Record<string, unknown>[]) || []) {
      const videoUrl = url_or_none(rendition.url);
      if (!videoUrl) continue;
      const ext = rendition.format != null ? String(rendition.format) : '';
      if (ext === 'm3u8') {
        formats.push(
          ...(await this._extract_m3u8_formats(videoUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
        );
      } else {
        const f: Format = { url: videoUrl, format_id: String(rendition.quality || ext || 'http') };
        const mobj = videoUrl.match(/(\d+)x(\d+)/);
        if (mobj) {
          f.width = Number(mobj[1]);
          f.height = Number(mobj[2]);
        } else {
          const qs = parse_qs(videoUrl);
          f.width = int_or_none(qs.w?.[0]);
          f.height = int_or_none(qs.h?.[0]);
        }
        formats.push(f);
      }
    }

    return {
      id: videoId,
      title: String(videoData.title || videoId),
      duration: int_or_none(videoData.duration),
      timestamp: int_or_none(videoData.publishDate),
      view_count: int_or_none(videoData.views),
      description: videoData.description != null ? String(videoData.description) : null,
      uploader: videoData.videoOwner != null ? String(videoData.videoOwner) : undefined,
      formats,
      webpage_url: url,
      original_url: url,
      extractor: 'aol.com',
      extractor_key: 'Aol',
    };
  }
}
