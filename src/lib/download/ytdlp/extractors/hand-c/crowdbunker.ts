/**
 * CrowdBunkerIE / CrowdBunkerChannelIE — ported from yt-dlp crowdbunker.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, Thumbnail, VideoInfo } from '../../types';
import { int_or_none, unified_strdate, url_or_none } from '../../utils';

export class CrowdBunkerIE extends InfoExtractor {
  static IE_NAME = 'CrowdBunker';
  static _VALID_URL = /https?:\/\/(?:www\.)?crowdbunker\.com\/v\/(?<id>[^/?#$&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const dataJson = await this._download_json<Record<string, unknown>>(
      `https://api.divulg.org/post/${videoId}/details`,
      videoId,
      undefined,
      { headers: { accept: 'application/json, text/plain, */*' } },
    );
    const videoJson = (dataJson.video as Record<string, unknown>) || {};
    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};

    const captions = Array.isArray(videoJson.captions) ? (videoJson.captions as Record<string, unknown>[]) : [];
    for (const sub of captions) {
      const file = (sub.file as Record<string, unknown>) || {};
      const subUrl = url_or_none(file.url);
      if (!subUrl) continue;
      const lang = (sub.languageCode as string) || 'fr';
      (subtitles[lang] ||= []).push({ url: subUrl, ext: 'vtt' });
    }

    const dashManifest = (videoJson.dashManifest as Record<string, unknown>) || {};
    const mpdUrl = url_or_none(dashManifest.url);
    if (mpdUrl) {
      formats.push(...(await this._extract_mpd_formats(mpdUrl, videoId, 'dash', undefined, false)));
    }

    const hlsManifest = (videoJson.hlsManifest as Record<string, unknown>) || {};
    const m3u8Url = url_or_none(hlsManifest.url);
    if (m3u8Url) {
      formats.push(
        ...(await this._extract_m3u8_formats(m3u8Url, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
      );
    }

    const thumbnailsRaw = Array.isArray(videoJson.thumbnails) ? (videoJson.thumbnails as Record<string, unknown>[]) : [];
    const thumbnails: Thumbnail[] = thumbnailsRaw
      .filter((img) => img?.url)
      .map((img) => ({
        url: img.url as string,
        height: int_or_none(img.height) ?? undefined,
        width: int_or_none(img.width) ?? undefined,
      }));

    const channel = (dataJson.channel as Record<string, unknown>) || {};

    return {
      id: videoId,
      title: (videoJson.title as string) ?? undefined,
      description: (videoJson.description as string) ?? undefined,
      view_count: int_or_none(videoJson.viewCount) ?? undefined,
      duration: int_or_none(videoJson.duration) ?? undefined,
      uploader: (channel.name as string) ?? undefined,
      uploader_id: (channel.id as string) ?? undefined,
      like_count: int_or_none(dataJson.likesCount) ?? undefined,
      upload_date: unified_strdate(videoJson.publishedAt ?? videoJson.createdAt) ?? undefined,
      thumbnails,
      formats,
      subtitles,
    };
  }
}

export class CrowdBunkerChannelIE extends InfoExtractor {
  static IE_NAME = 'CrowdBunkerChannel';
  static _VALID_URL = /https?:\/\/(?:www\.)?crowdbunker\.com\/@(?<id>[^/?#$&]+)/;

  private async *_entries(playlistId: string): AsyncGenerator<VideoInfo> {
    let last: string | undefined;
    for (let page = 0; ; page++) {
      const channelJson = await this._download_json<Record<string, unknown>>(
        `https://api.divulg.org/organization/${playlistId}/posts`,
        playlistId,
        `Downloading Page ${page}`,
        {
          headers: { accept: 'application/json, text/plain, */*' },
          query: last ? { after: last } : {},
        },
      );
      const items = Array.isArray(channelJson.items) ? (channelJson.items as Record<string, unknown>[]) : [];
      for (const item of items) {
        const vId = item.uid as string | undefined;
        if (!vId) continue;
        yield this.url_result(`https://crowdbunker.com/v/${vId}`, 'CrowdBunker', vId);
      }
      last = channelJson.last as string | undefined;
      if (!last) break;
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const entries: VideoInfo[] = [];
    for await (const entry of this._entries(playlistId)) entries.push(entry);
    return this.playlist_result(entries, playlistId);
  }
}
