/**
 * NFHSNetworkIE — ported from yt-dlp nfhsnetwork.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { try_get, unified_strdate, unified_timestamp } from '../../utils';

export class NFHSNetworkIE extends InfoExtractor {
  static IE_NAME = 'NFHSNetwork';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?nfhsnetwork\.com\/events\/[\w-]+\/(?<id>(?:gam|evt|dd|)?[\w\d]{0,10})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const data = await this._download_json<Record<string, unknown>>(
      `https://cfunity.nfhsnetwork.com/v2/game_or_event/${videoId}`,
      videoId,
    );

    const publisher = ((data.publishers as Array<Record<string, unknown>>) || [])[0] || {};
    const broadcast = ((publisher.broadcasts || publisher.vods) as Array<Record<string, unknown>>)?.[0] || {};
    const uploader = (publisher.formatted_name as string) || (publisher.name as string);
    const uploaderId = publisher.publisher_key as string | undefined;
    const pubType = publisher.type as string | undefined;
    const uploaderPrefix =
      pubType === 'school'
        ? 'schools'
        : pubType && pubType.includes('association')
          ? 'associations'
          : pubType === 'publisher' || pubType === 'affiliate'
            ? 'affiliates'
            : 'schools';
    const uploaderPage = `https://www.nfhsnetwork.com/${uploaderPrefix}/${publisher.slug}`;
    const location = `${data.city}, ${data.state_name}`;
    const isLive = Boolean(broadcast.on_air || broadcast.status === 'on_air');

    let title =
      this._og_search_title(webpage) ||
      this._html_search_regex(/<h1 class="sr-hidden">(.*?)<\/h1>/, webpage, 'title', undefined, false) ||
      videoId;
    title = title.split('|')[0]!.trim();

    const videoType = isLive ? 'broadcasts' : 'vods';
    const key = isLive
      ? (broadcast.key as string)
      : try_get(publisher, (x) => (x as Record<string, Array<Record<string, unknown>>>).vods?.[0]?.key);
    const m3u8Resp = await this._download_json<{ video_url?: string }>(
      `https://cfunity.nfhsnetwork.com/v2/${videoType}/${key}/url`,
      videoId,
    );

    return {
      id: videoId,
      title,
      formats: m3u8Resp.video_url
        ? await this._extract_m3u8_formats(m3u8Resp.video_url, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, isLive)
        : [],
      description: broadcast.description as string | undefined,
      timestamp: unified_timestamp(data.local_start_time) ?? undefined,
      uploader,
      uploader_id: uploaderId,
      uploader_url: uploaderPage,
      location,
      upload_date: unified_strdate(data.local_start_time) ?? undefined,
      is_live: isLive,
    };
  }
}
