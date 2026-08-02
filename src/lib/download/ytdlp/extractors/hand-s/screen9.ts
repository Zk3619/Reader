/** Screen9IE — ported from yt-dlp screen9.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { traverse_obj } from '../../utils';
import { extractM3u8FormatsAndSubtitles } from './_helpers';

export class Screen9IE extends InfoExtractor {
  static IE_NAME = 'screen9';
  static _VALID_URL =
    /https?:\/\/(?:\w+\.screen9\.(?:tv|com)|play\.su\.se)\/(?:embed|media)\/(?<id>[^?#/]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(`https://api.screen9.com/embed/${videoId}`, videoId);
    const config = this._search_json<Record<string, unknown>>(/var\s+config\s*=/, webpage, 'config', videoId)!;

    const srcList = (config.src as Array<Record<string, unknown>>) || [];
    const hlsSrc = srcList.find((s) => s.type === 'application/x-mpegURL')?.src as string | undefined;
    const mp4Src = srcList.find((s) => s.type === 'video/mp4')?.src as string | undefined;

    const { formats: hlsFormats, subtitles } = hlsSrc
      ? await extractM3u8FormatsAndSubtitles(this, hlsSrc, videoId, 'hls')
      : { formats: [] as Format[], subtitles: {} };

    const formats = [...hlsFormats];
    if (mp4Src) {
      formats.push({ url: mp4Src, ext: 'mp4', format_id: 'mp4' });
    }

    const title =
      traverse_obj(config, ['plugins', 'title', 'title']) ||
      traverse_obj(config, ['plugins', 'googleAnalytics', 'title']) ||
      traverse_obj(config, ['plugins', 'share', 'mediaTitle']) ||
      videoId;

    return {
      id: videoId,
      title: String(title),
      description: traverse_obj(config, ['plugins', 'title', 'description']) as string | undefined,
      thumbnail: config.poster as string | undefined,
      formats,
      subtitles,
    };
  }
}
