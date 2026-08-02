/**
 * TvwIE / TvwNewsIE / TvwTvChannelsIE — ported from yt-dlp tvw.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { clean_html, extract_attributes, remove_end, traverse_obj, unified_timestamp, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles, playlistFromMatches } from './_helpers';

export class TvwIE extends InfoExtractor {
  static IE_NAME = 'tvw';
  static _VALID_URL = [
    /https?:\/\/(?:www\.)?tvw\.org\/video\/(?<id>[^/?#]+)/,
    /https?:\/\/(?:www\.)?tvw\.org\/watch\/?\?(?:[^#]+&)?eventID=(?<id>\d+)/,
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const clientId = this._html_search_meta('clientID', webpage, undefined, true);
    const videoId = this._html_search_meta('eventID', webpage, undefined, true);
    if (!clientId || !videoId) throw new ExtractorError('Missing TVW client/event id', { expected: true });

    const videoData = (
      await this._download_json<{ data: Record<string, unknown> }>(
        'https://api.v3.invintus.com/v2/Event/getDetailed',
        videoId,
        undefined,
        {
          method: 'POST',
          headers: {
            authorization: 'embedder',
            'wsc-api-key': '7WhiEBzijpritypp8bqcU7pfU9uicDR',
            'Content-Type': 'application/json',
          },
          data: JSON.stringify({ clientID: clientId, eventID: videoId, showStreams: true }),
        },
      )
    ).data;

    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    const streamUrls = traverse_obj(videoData, ['streamingURIs'], { get_all: true }) as string[];
    for (const streamUrl of streamUrls) {
      const u = url_or_none(streamUrl);
      if (!u) continue;
      const res = await extractM3u8FormatsAndSubtitles(this, u, videoId, 'hls');
      formats.push(...res.formats);
      mergeSubtitles(subtitles, res.subtitles);
    }
    const captionUrl = url_or_none(videoData.captionPath);
    if (captionUrl) (subtitles.en ||= []).push({ url: captionUrl, ext: 'vtt' });

    return {
      id: videoId,
      display_id: displayId,
      formats,
      subtitles,
      title:
        (videoData.title != null ? String(videoData.title) : undefined) ||
        remove_end(this._og_search_title(webpage, false) || '', ' - TVW') ||
        undefined,
      description:
        (videoData.description != null ? clean_html(String(videoData.description)) : undefined) ||
        this._og_search_description(webpage) ||
        undefined,
      categories: Array.isArray(videoData.categories)
        ? videoData.categories.map((c) => String(c))
        : undefined,
      thumbnail: url_or_none(videoData.videoThumbnail) || undefined,
      timestamp: unified_timestamp(videoData.startDateTime) ?? undefined,
      location: videoData.locationName != null ? String(videoData.locationName) : undefined,
      is_live: videoData.eventStatus === 'live',
    };
  }
}

export class TvwNewsIE extends InfoExtractor {
  static IE_NAME = 'tvw:news';
  static _VALID_URL = /https?:\/\/(?:www\.)?tvw\.org\/\d{4}\/\d{2}\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);
    const videoIds: string[] = [];
    for (const m of webpage.matchAll(/class="invintus-player"[^>]*data-eventid="([^"]+)"/gi)) {
      videoIds.push(m[1]!);
    }
    for (const m of webpage.matchAll(/<[^>]*class=["'][^"']*invintus-player[^"']*["'][^>]*>/gi)) {
      const attrs = extract_attributes(m[0]!);
      if (attrs['data-eventid']) videoIds.push(attrs['data-eventid']);
    }
    return playlistFromMatches(this, [...new Set(videoIds)], playlistId, {
      title: remove_end(this._og_search_title(webpage, false) || '', ' - TVW'),
      description: this._og_search_description(webpage),
      ie: 'Tvw',
      video_kwargs: {},
    });
  }
}

export class TvwTvChannelsIE extends InfoExtractor {
  static IE_NAME = 'tvw:tvchannels';
  static _VALID_URL = /https?:\/\/(?:www\.)?tvw\.org\/tvchannels\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const frameMatch = webpage.match(/id=["']invintus-persistent-stream-frame["'][^>]*>/i);
    const attrs = extract_attributes(frameMatch?.[0] || '');
    const src = attrs.src || '';
    const encoder = new URLSearchParams(src.split('?')[1] || '').get('encoder');
    if (!encoder) throw new ExtractorError('TVW stream URL not found', { expected: true });
    const parsed = JSON.parse(decodeURIComponent(encoder)) as Record<string, unknown>;
    const m3u8Url = String(parsed.live247URI || '');
    if (!m3u8Url) throw new ExtractorError('TVW live stream URL missing', { expected: true });

    return {
      id: videoId,
      formats: await this._extract_m3u8_formats(m3u8Url, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false),
      title: remove_end(this._og_search_title(webpage, false) || '', ' - TVW') || undefined,
      thumbnail: this._og_search_thumbnail(webpage) || undefined,
      is_live: true,
    };
  }
}
