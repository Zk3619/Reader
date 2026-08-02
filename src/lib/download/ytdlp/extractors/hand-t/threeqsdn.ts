/** ThreeQSDNIE — ported from yt-dlp threeqsdn.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { determine_ext, float_or_none, int_or_none, join_nonempty, url_or_none } from '../../utils';
import {
  extractM3u8FormatsAndSubtitles,
  extractMpdFormatsAndSubtitles,
  mergeSubtitles,
  parseIso8601,
} from './_helpers';

export class ThreeQSDNIE extends InfoExtractor {
  static IE_NAME = '3qsdn';
  static _VALID_URL =
    /https?:\/\/playout\.3qsdn\.com\/(?<id>[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    let config: Record<string, unknown>;
    try {
      config = await this._download_json(
        url.replace('://playout.3qsdn.com/', '://playout.3qsdn.com/config/'),
        videoId,
      );
    } catch (e) {
      if (e instanceof ExtractorError) {
        const cause = (e as ExtractorError & { cause?: { status?: number } }).cause;
        if (cause?.status === 401) this.raise_geo_restricted();
      }
      throw e;
    }

    const live = config.streamContent === 'live';
    const aspect = float_or_none(config.aspect);

    const formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};

    for (const [sourceType, source] of Object.entries(
      (config.sources as Record<string, unknown>) || {},
    )) {
      if (!source) continue;
      if (sourceType === 'dash') {
        const res = await extractMpdFormatsAndSubtitles(this, String(source), videoId, 'mpd');
        formats.push(...res.formats);
        mergeSubtitles(subtitles, res.subtitles);
      } else if (sourceType === 'hls') {
        const res = await extractM3u8FormatsAndSubtitles(this, String(source), videoId, 'hls');
        formats.push(...res.formats);
        mergeSubtitles(subtitles, res.subtitles);
      } else if (sourceType === 'progressive' && Array.isArray(source)) {
        for (const s of source as Array<Record<string, unknown>>) {
          const src = url_or_none(s.src);
          if (!src) continue;
          const ext = determine_ext(src);
          const height = int_or_none(s.height);
          formats.push({
            ext,
            format_id: join_nonempty('http', ext, height != null ? `${height}p` : null) || 'http',
            height: height ?? undefined,
            source_preference: 0,
            url: src,
            vcodec: height === 0 ? 'none' : undefined,
            width: height && aspect ? Math.round(height * aspect) : undefined,
          });
        }
      }
    }

    for (const subtitle of (config.subtitles as Array<Record<string, unknown>>) || []) {
      const src = url_or_none(subtitle.src);
      if (!src) continue;
      const label = String(subtitle.label || 'eng');
      if (!subtitles[label]) subtitles[label] = [];
      subtitles[label]!.push({ url: src, ext: determine_ext(src) || 'vtt' });
    }

    return {
      id: videoId,
      title: String(config.title || videoId),
      thumbnail: config.poster ? String(config.poster) : undefined,
      description: config.description ? String(config.description) : undefined,
      timestamp: parseIso8601(config.upload_date as string) ?? undefined,
      duration: float_or_none(config.vlength) ?? undefined,
      is_live: live,
      formats,
      subtitles: Object.keys(subtitles).length ? subtitles : undefined,
    };
  }
}
