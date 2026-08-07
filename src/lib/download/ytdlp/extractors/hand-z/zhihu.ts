// @ts-nocheck
/** ZhihuIE â€?ported from yt-dlp zhihu.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { float_or_none, int_or_none } from '../../utils';
import { format_field } from './_helpers';

export class ZhihuIE extends InfoExtractor {
  static IE_NAME = 'zhihu';
  static _VALID_URL = /https?:\/\/(?:www\.)?zhihu\.com\/zvideo\/(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const headers = {
      Referer: 'https://www.zhihu.com/',
      Origin: 'https://www.zhihu.com',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
    const zvideo = await this._download_json<Record<string, any>>(
      `https://www.zhihu.com/api/v4/zvideos/${videoId}`,
      videoId,
      'Downloading zvideo JSON',
      { headers },
    );
    const video = (zvideo.video || {}) as Record<string, any>;
    const playlist = (video.playlist || {}) as Record<string, Record<string, any>>;

    const formats: Format[] = [];
    for (const [formatId, q] of Object.entries(playlist)) {
      const playUrl = q.url || q.play_url;
      if (!playUrl) continue;
      formats.push({
        asr: int_or_none(q.sample_rate) ?? undefined,
        filesize: int_or_none(q.size) ?? undefined,
        format_id: formatId,
        fps: int_or_none(q.fps) ?? undefined,
        height: int_or_none(q.height) ?? undefined,
        tbr: float_or_none(q.bitrate) ?? undefined,
        url: String(playUrl),
        width: int_or_none(q.width) ?? undefined,
        ext: 'mp4',
        protocol: 'https',
        vcodec: 'unknown',
        acodec: 'unknown',
        http_headers: headers,
      });
    }

    const author = (zvideo.author || {}) as Record<string, any>;
    return {
      id: videoId,
      title: String(zvideo.title || videoId),
      formats,
      thumbnail: String(video.thumbnail || zvideo.image_url || '') || undefined,
      uploader: String(author.name || '') || undefined,
      timestamp: int_or_none(zvideo.published_at) ?? undefined,
      uploader_id: String(author.id || '') || undefined,
      uploader_url: format_field(author.url_token, null, 'https://www.zhihu.com/people/%s') || undefined,
      duration: float_or_none(video.duration) ?? undefined,
      view_count: int_or_none(zvideo.play_count) ?? undefined,
      like_count: int_or_none(zvideo.liked_count) ?? undefined,
      comment_count: int_or_none(zvideo.comment_count) ?? undefined,
      webpage_url: url,
      original_url: url,
      http_headers: headers,
      extractor: 'zhihu',
      extractor_key: 'Zhihu',
    };
  }
}
