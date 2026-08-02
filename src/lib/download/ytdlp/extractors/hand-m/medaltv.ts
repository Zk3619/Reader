/** MedalTVIE — ported from yt-dlp medaltv.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, str_or_none, traverse_obj, url_or_none } from '../../utils';

export class MedalTVIE extends InfoExtractor {
  static IE_NAME = 'medaltv';
  static _VALID_URL = /https?:\/\/(?:www\.)?medal\.tv\/games\/[^/?#&]+\/clips\/(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const contentData = await this._download_json<Record<string, unknown>>(`https://medal.tv/api/content/${videoId}`, videoId, undefined, {
      headers: { Accept: 'application/json' },
    });

    const formats: Format[] = [];
    const m3u8Url = url_or_none(contentData.contentUrlHls);
    if (m3u8Url) {
      formats.push(
        ...(await this._extract_m3u8_formats(m3u8Url, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls')),
      );
    }
    const httpUrl = url_or_none(contentData.contentUrl);
    if (httpUrl) {
      formats.push({ url: httpUrl, format_id: 'http-source', ext: 'mp4', quality: 1 });
    }
    const filtered = formats.filter((f) => !String(f.url).includes('video/privacy-protected-guest'));
    if (!filtered.length) {
      this.report_warning('Video formats are not available through API, falling back to social video URL');
      const urlh = await this._request_webpage(`https://medal.tv/api/content/${videoId}/socialVideoUrl`, videoId, 'Checking social video URL');
      if (urlh) {
        filtered.push({ url: urlh.url, format_id: 'social-video', ext: 'mp4', quality: -1 });
      }
    }

    const uploaderId = str_or_none(traverse_obj(contentData, ['poster', 'userId']));
    return {
      id: videoId,
      formats: filtered,
      title: str_or_none(contentData.contentTitle) ?? undefined,
      description: str_or_none(contentData.contentDescription) ?? undefined,
      timestamp: int_or_none(contentData.created, 1000) ?? undefined,
      duration: int_or_none(contentData.videoLengthSeconds) ?? undefined,
      view_count: int_or_none(contentData.views) ?? undefined,
      like_count: int_or_none(contentData.likes) ?? undefined,
      comment_count: int_or_none(contentData.comments) ?? undefined,
      uploader: str_or_none(traverse_obj(contentData, ['poster', 'displayName'])) ?? undefined,
      uploader_id: uploaderId ?? undefined,
      uploader_url: uploaderId ? `https://medal.tv/users/${uploaderId}` : undefined,
      tags: (traverse_obj(contentData, ['tags'], { get_all: true }) as string[] | undefined) || undefined,
      thumbnail: url_or_none(contentData.thumbnailUrl) ?? undefined,
    };
  }
}
