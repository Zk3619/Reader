/**
 * BitChuteIE family — ported from yt-dlp bitchute.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import {
  clean_html,
  determine_ext,
  get_element_by_class,
  get_elements_by_class,
  int_or_none,
  parse_count,
  parse_duration,
  traverse_obj,
  url_or_none,
} from '../../utils';
import { htmlExtractTitle, urlencodePostdata } from './_helpers';

const UPLOADER_URL_TMPL = (id: string) => `https://www.bitchute.com/profile/${id}/`;
const CHANNEL_URL_TMPL = (id: string) => `https://www.bitchute.com/channel/${id}/`;

export class BitChuteIE extends InfoExtractor {
  static IE_NAME = 'bitchute';
  static _VALID_URL =
    /https?:\/\/(?:(?:www|old)\.)?bitchute\.com\/(?:video|embed|torrent\/[^/?#]+)\/(?<id>[^/?#&]+)/;

  protected async _callApi(
    endpoint: string,
    data: Record<string, unknown>,
    displayId: string,
    fatal = true,
  ): Promise<Record<string, unknown>> {
    try {
      return await this._download_json(
        `https://api.bitchute.com/api/beta/${endpoint}`,
        displayId,
        `Downloading ${endpoint.split('/').pop()} API JSON`,
        {
          data: JSON.stringify(data),
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        },
      );
    } catch (e) {
      if (fatal) throw e;
      this.report_warning((e as Error).message || String(e));
      return {};
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const data = { video_id: videoId };
    const mediaUrl = ((await this._callApi('video/media', data, videoId)).media_url as string) || '';

    let formats = [];
    if (determine_ext(mediaUrl) === 'm3u8') {
      formats = await this._extract_m3u8_formats(mediaUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls');
    } else {
      formats = mediaUrl ? [{ format_id: 'direct', url: mediaUrl }] : [];
    }

    if (!formats.length) {
      this.raise_no_formats(
        'Video is unavailable. Please make sure this video is playable in the browser before reporting this issue.',
      );
    }

    const video = await this._callApi('video', data, videoId, false);
    const channelId = traverse_obj(video, ['channel', 'channel_id']) as string | undefined;
    const channel = channelId ? await this._callApi('channel', { channel_id: channelId }, videoId, false) : undefined;

    const profileId = video.profile_id as string | undefined;
    const result: VideoInfo = {
      id: videoId,
      title: (video.video_name as string) || undefined,
      description: (video.description as string) || undefined,
      thumbnail: url_or_none(video.thumbnail_url) || undefined,
      channel: (traverse_obj(video, ['channel', 'channel_name']) as string) || undefined,
      channel_id: channelId,
      channel_url: channelId ? CHANNEL_URL_TMPL(channelId) : undefined,
      uploader_id: profileId,
      uploader_url: profileId ? UPLOADER_URL_TMPL(profileId) : undefined,
      timestamp: undefined,
      duration: parse_duration(video.duration) ?? undefined,
      tags: Array.isArray(video.hashtags) ? (video.hashtags as string[]).filter(Boolean) : undefined,
      view_count: int_or_none(video.view_count) ?? undefined,
      is_live: video.state_id === 'live',
      formats,
    };

    if (channel) {
      result.channel = (channel.channel_name as string) || result.channel;
      result.channel_id = (channel.channel_id as string) || result.channel_id;
      const slug = channel.url_slug as string | undefined;
      if (slug) result.channel_url = CHANNEL_URL_TMPL(slug);
      result.uploader = (channel.profile_name as string) || undefined;
      const chProfileId = channel.profile_id as string | undefined;
      if (chProfileId) {
        result.uploader_id = chProfileId;
        result.uploader_url = UPLOADER_URL_TMPL(chProfileId);
      }
    }

    return result;
  }
}

export class BitChuteChannelIE extends InfoExtractor {
  static IE_NAME = 'bitchute:channel';
  static _VALID_URL = /https?:\/\/(?:(?:www|old)\.)?bitchute\.com\/(?<type>channel|playlist)\/(?<id>[^/?#&]+)/;

  static _TOKEN = 'zyG6tQcGPE5swyAEFLqKUwMuMMuF6IO2DZ6ZDQjGfsL0e4dcTLwqkTTul05Jdve7';
  static PAGE_SIZE = 25;
  static HTML_CLASS_NAMES: Record<string, { container: string; title: string; description: string }> = {
    channel: { container: 'channel-videos-container', title: 'channel-videos-title', description: 'channel-videos-text' },
    playlist: { container: 'playlist-video', title: 'title', description: 'description' },
  };

  protected _makeUrl(playlistId: string, playlistType: string): string {
    return `https://old.bitchute.com/${playlistType}/${playlistId}/`;
  }

  protected async _fetchPage(
    playlistId: string,
    playlistType: string,
    pageNum: number,
  ): Promise<VideoInfo[]> {
    const playlistUrl = this._makeUrl(playlistId, playlistType);
    const data = await this._download_json<{ success?: boolean; html?: string }>(
      `${playlistUrl}extend/`,
      playlistId,
      `Downloading page ${pageNum}`,
      {
        data: urlencodePostdata({
          csrfmiddlewaretoken: BitChuteChannelIE._TOKEN,
          name: '',
          offset: pageNum * BitChuteChannelIE.PAGE_SIZE,
        }),
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Referer: playlistUrl,
          'X-Requested-With': 'XMLHttpRequest',
          Cookie: `csrftoken=${BitChuteChannelIE._TOKEN}`,
        },
      },
    );
    if (!data.success) return [];

    const classes = BitChuteChannelIE.HTML_CLASS_NAMES[playlistType]!;
    const entries: VideoInfo[] = [];
    for (const videoHtml of get_elements_by_class(classes.container, data.html || '')) {
      const videoId = this._search_regex(
        /<a\s[^>]*\bhref=["']\/video\/([^"'/]+)/,
        videoHtml,
        'video id',
        null,
        false,
      );
      if (!videoId) continue;
      entries.push({
        ...this.url_result(`https://www.bitchute.com/video/${videoId}`, 'BitChute', videoId),
        title: clean_html(get_element_by_class(classes.title, videoHtml)) || undefined,
        description: clean_html(get_element_by_class(classes.description, videoHtml)) || undefined,
        duration: parse_duration(get_element_by_class('video-duration', videoHtml)) ?? undefined,
        view_count: parse_count(clean_html(get_element_by_class('video-views', videoHtml))) ?? undefined,
      });
    }
    return entries;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url);
    const playlistType = m?.groups?.type || 'channel';
    const playlistId = m?.groups?.id || this._match_id(url);
    const webpage = await this._download_webpage(this._makeUrl(playlistId, playlistType), playlistId);

    const entries: VideoInfo[] = [];
    for (let page = 0; page < 200; page++) {
      const pageEntries = await this._fetchPage(playlistId, playlistType, page);
      entries.push(...pageEntries);
      if (pageEntries.length < BitChuteChannelIE.PAGE_SIZE) break;
    }

    return this.playlist_result(
      entries,
      playlistId,
      htmlExtractTitle(webpage) || undefined,
      this._html_search_meta(['description', 'og:description', 'twitter:description'], webpage),
    );
  }
}
