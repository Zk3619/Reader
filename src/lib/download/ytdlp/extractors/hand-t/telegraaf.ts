/** TelegraafIE — ported from yt-dlp telegraaf.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, int_or_none, str_or_none, try_get } from '../../utils';
import { extractM3u8FormatsAndSubtitles, parseIso8601 } from './_helpers';

export class TelegraafIE extends InfoExtractor {
  static IE_NAME = 'telegraaf';
  static _VALID_URL = /https?:\/\/(?:www\.)?telegraaf\.nl\/video\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const articleId = this._match_id(url);
    const gql = await this._download_json<{ data?: { article?: { videos?: Array<{ videoId?: string }> } } }>(
      'https://app.telegraaf.nl/graphql',
      articleId,
      undefined,
      {
        headers: { 'User-Agent': 'De Telegraaf/6.8.11 (Android 11; en_US)' },
        query: {
          query: `{\n  article(uid: ${articleId}) {\n    videos {\n      videoId\n    }\n  }\n}`,
        },
      },
    );
    const videoId = gql.data?.article?.videos?.[0]?.videoId!;
    const item = (
      await this._download_json<{ items?: Array<Record<string, unknown>> }>(
        `https://content.tmgvideo.nl/playlist/item=${videoId}/playlist.json`,
        videoId,
      )
    ).items?.[0]!;

    const formats: Format[] = [];
    const locations = (item.locations as Record<string, unknown[]>) || {};
    for (const location of locations.adaptive || []) {
      const manifestUrl = (location as { src?: string }).src;
      if (!manifestUrl) continue;
      const ext = determine_ext(manifestUrl);
      if (ext === 'm3u8') {
        formats.push(...(await extractM3u8FormatsAndSubtitles(this, manifestUrl, videoId, 'hls')).formats);
      } else if (ext === 'mpd') {
        formats.push(...(await this._extract_mpd_formats(manifestUrl, videoId, 'dash', undefined, false)));
      } else {
        this.report_warning(`Unknown adaptive format ${ext}`);
      }
    }
    for (const location of locations.progressive || []) {
      const loc = location as { sources?: Array<{ src?: string }>; label?: string; width?: number; height?: number };
      const src = try_get(loc, (x) => x.sources?.[0]?.src);
      if (!src) continue;
      formats.push({
        url: src,
        width: int_or_none(loc.width) ?? undefined,
        height: int_or_none(loc.height) ?? undefined,
        format_id: `http${loc.label ? `-${loc.label}` : ''}`,
      });
    }

    return {
      id: videoId,
      title: String(item.title ?? videoId),
      description: str_or_none(item.description) ?? undefined,
      formats,
      duration: int_or_none(item.duration) ?? undefined,
      thumbnail: str_or_none(item.poster) ?? undefined,
      timestamp:
        parseIso8601(typeof item.datecreated === 'string' ? item.datecreated.replace(' ', 'T') : item.datecreated) ??
        undefined,
    };
  }
}
