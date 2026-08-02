/**
 * IndavideoEmbedIE — ported from yt-dlp indavideo.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import { int_or_none, update_url_query } from '../../utils';
import { parse_age_limit, parseIso8601, protoRelative } from './_helpers';

function timeSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export class IndavideoEmbedIE extends InfoExtractor {
  static IE_NAME = 'indavideo';
  static _VALID_URL =
    /https?:\/\/(?:(?:embed\.)?indavideo\.hu\/player\/video\/|assets\.indavideo\.hu\/swf\/player\.swf\?.*\b(?:v(?:ID|id))=)(?<id>[\da-f]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);

    const response = await this._download_json<{ data: Record<string, unknown> }>(
      `https://amfphp.indavideo.hu/SYm0json.php/player.playerHandler.getVideoData/${videoId}/`,
      videoId,
      undefined,
      { query: { _: String(timeSeconds()) } },
    );
    const video = response.data || {};

    const videoUrls: string[] = [];
    const videoFiles = video.video_files;
    if (Array.isArray(videoFiles)) {
      videoUrls.push(...videoFiles.map(String));
    } else if (videoFiles && typeof videoFiles === 'object') {
      videoUrls.push(...Object.values(videoFiles as Record<string, string>).map(String));
    }
    const uniqueUrls = [...new Set(videoUrls)];

    const filesh = (video.filesh as Record<string, string>) || {};
    const formats: Format[] = [];

    for (const videoUrl of uniqueUrls) {
      const heightMatch = videoUrl.match(/\.(\d{3,4})\.mp4(?:\?|$)/);
      let height = int_or_none(heightMatch?.[1]);
      if (!height && Object.keys(filesh).length === 1) {
        height = int_or_none(Object.keys(filesh)[0]);
      }
      const token = height != null ? filesh[String(height)] : undefined;
      if (token == null) continue;
      formats.push({
        format_id: height != null ? `${height}p` : 'source',
        url: update_url_query(videoUrl, { token }),
        height: height ?? undefined,
      });
    }

    let timestamp: number | undefined;
    const dateStr = video.date as string | undefined;
    if (dateStr) {
      timestamp = parseIso8601(`${dateStr.replace(' ', 'T')}+02:00`) ?? undefined;
    }

    const thumbnails: Thumbnail[] = ((video.thumbnails as string[]) || []).map((thumbnail) => ({
      url: protoRelative(thumbnail) || thumbnail,
    }));

    const tags = ((video.tags as Array<{ title?: string }>) || []).map((tag) => tag.title).filter(Boolean) as string[];

    return {
      id: String(video.id ?? videoId),
      title: video.title as string | undefined,
      description: video.description as string | undefined,
      thumbnails,
      uploader: video.user_name as string | undefined,
      uploader_id: video.user_id != null ? String(video.user_id) : undefined,
      timestamp,
      duration: int_or_none(video.length) ?? undefined,
      age_limit: parse_age_limit(video.age_limit as string | undefined),
      tags,
      formats,
    };
  }
}
