/**
 * TheChosenIE / TheChosenGroupIE — ported from yt-dlp thechosen.py
 */

import { InfoExtractor } from '../../common';
import type { Thumbnail, VideoInfo } from '../../types';
import { determine_ext, int_or_none, traverse_obj, url_or_none } from '../../utils';
import { FrontroGroupBaseIE } from '../hand-f/frontro';
import {
  extractM3u8FormatsAndSubtitles,
  extractMpdFormatsAndSubtitles,
  mergeSubtitles,
} from './_helpers';

export class TheChosenIE extends InfoExtractor {
  static IE_NAME = 'thechosen';
  static _VALID_URL = /https?:\/\/(?:www\.)?watch\.thechosen\.tv\/(?:video|watch)\/(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const metadata = await this._download_json<Record<string, unknown>>(
      `https://api.watch.thechosen.tv/v1/videos/${videoId}`,
      videoId,
    );

    const formats: VideoInfo['formats'] = [];
    let subtitles: VideoInfo['subtitles'] = {};

    const details = metadata.details as Record<string, unknown> | undefined;
    const videos = (details?.video as Array<Record<string, unknown>>) || [];
    for (const block of videos) {
      const fmtUrl = url_or_none(block.url);
      if (!fmtUrl) continue;
      const ext = determine_ext(fmtUrl);
      if (ext === 'm3u8') {
        const { formats: fmts, subtitles: subs } = await extractM3u8FormatsAndSubtitles(
          this,
          fmtUrl,
          videoId,
        );
        formats?.push(...(fmts || []));
        mergeSubtitles(subtitles as Record<string, import('../../types').Subtitle[]>, subs);
      } else if (ext === 'mpd') {
        const { formats: fmts, subtitles: subs } = await extractMpdFormatsAndSubtitles(
          this,
          fmtUrl,
          videoId,
        );
        formats?.push(...(fmts || []));
        mergeSubtitles(subtitles as Record<string, import('../../types').Subtitle[]>, subs);
      } else {
        this.report_warning(`Skipping unsupported format extension "${ext}"`);
      }
    }

    const thumbnails: Thumbnail[] = [];
    for (const key of ['thumbs', 'thumbnails'] as const) {
      const block = metadata[key] as Record<string, unknown> | undefined;
      if (!block) continue;
      for (const [thumbId, thumbUrl] of Object.entries(block)) {
        const u = url_or_none(thumbUrl);
        if (u) thumbnails.push({ id: thumbId, url: u });
      }
    }

    return {
      id: videoId,
      title: traverse_obj(metadata, ['title', String]) as string | undefined,
      description: traverse_obj(metadata, ['description', String]) as string | undefined,
      duration: int_or_none(traverse_obj(metadata, ['duration'])) ?? undefined,
      thumbnails,
      formats,
      subtitles,
    };
  }
}

export class TheChosenGroupIE extends FrontroGroupBaseIE {
  static IE_NAME = 'thechosen:group';
  static _VALID_URL = /https?:\/\/(?:www\.)?watch\.thechosen\.tv\/group\/(?<id>[0-9]+)/;
  static _CHANNEL_ID = '12884901895';
  static _VIDEO_EXTRACTOR = 'TheChosen';
  static _VIDEO_URL_TMPL = 'https://watch.thechosen.tv/watch/%s';
}
