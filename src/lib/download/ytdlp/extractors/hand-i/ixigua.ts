/**
 * IxiguaIE — ported from yt-dlp ixigua.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { get_element_by_id, int_or_none, js_to_json, str_or_none, traverse_obj } from '../../utils';

function pushMediaList(list: unknown, override: Partial<Format>, out: Format[]): void {
  if (!Array.isArray(list)) return;
  for (const media of list) {
    if (!media || typeof media !== 'object') continue;
    const rec = media as Record<string, unknown>;
    if (!rec.main_url) continue;
    let decoded: string;
    try {
      decoded = atob(String(rec.main_url));
    } catch {
      continue;
    }
    out.push({
      url: decoded,
      width: int_or_none(rec.vwidth) ?? undefined,
      height: int_or_none(rec.vheight) ?? undefined,
      fps: int_or_none(rec.fps) ?? undefined,
      vcodec: rec.codec_type != null ? String(rec.codec_type) : undefined,
      format_id: str_or_none(rec.quality_type) ?? `format-${out.length}`,
      filesize: int_or_none(rec.size) ?? undefined,
      ext: 'mp4',
      ...override,
    });
  }
}

function mediaSelector(jsonData: unknown): Format[] {
  const out: Format[] = [];
  if (!jsonData || typeof jsonData !== 'object') return out;
  const rec = jsonData as Record<string, unknown>;
  pushMediaList(rec.video_list, {}, out);
  const dynamic = rec.dynamic_video as Record<string, unknown> | undefined;
  pushMediaList(dynamic?.dynamic_video_list, { acodec: 'none' }, out);
  pushMediaList(dynamic?.dynamic_audio_list, { vcodec: 'none', ext: 'm4a' }, out);
  return out;
}

export class IxiguaIE extends InfoExtractor {
  static IE_NAME = 'ixigua';
  static _VALID_URL = /https?:\/\/(?:\w+\.)?ixigua\.com\/(?:video\/)?(?<id>\d+).+/;

  protected _getJsonData(webpage: string, videoId: string): Record<string, unknown> {
    const jsData = get_element_by_id('SSR_HYDRATED_DATA', webpage);
    if (!jsData) {
      const cookies = this._get_cookies('https://www.ixigua.com');
      if (Object.keys(cookies).length) {
        throw new ExtractorError('Failed to get SSR_HYDRATED_DATA');
      }
      throw new ExtractorError('Cookies (not necessarily logged in) are needed', { expected: true });
    }
    return (
      this._parse_json<Record<string, unknown>>(
        jsData.replace('window._SSR_HYDRATED_DATA=', ''),
        videoId,
        js_to_json,
      ) || {}
    );
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const jsonData = this._getJsonData(webpage, videoId);
    const video = traverse_obj(jsonData, [
      'anyVideo',
      'gidInformation',
      'packerData',
      'video',
    ]) as Record<string, unknown>;

    const formats = mediaSelector(video.videoResource);
    const tag = video.tag != null ? String(video.tag) : undefined;

    return {
      id: videoId,
      title: video.title != null ? String(video.title) : videoId,
      description: video.video_abstract != null ? String(video.video_abstract) : undefined,
      formats,
      like_count: int_or_none(video.video_like_count) ?? undefined,
      duration: int_or_none(video.duration) ?? undefined,
      tags: tag ? [tag] : undefined,
      uploader_id: traverse_obj(video, ['user_info', 'user_id']) as string | undefined,
      uploader: traverse_obj(video, ['user_info', 'name']) as string | undefined,
      view_count: int_or_none(video.video_watch_count) ?? undefined,
      dislike_count: int_or_none(video.video_unlike_count) ?? undefined,
      timestamp: int_or_none(video.video_publish_time) ?? undefined,
    };
  }
}
