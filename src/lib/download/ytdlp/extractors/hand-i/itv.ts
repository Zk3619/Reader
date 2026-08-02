/**
 * ITVIE / ITVBTCCIE — ported from yt-dlp itv.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, Thumbnail, VideoInfo } from '../../types';
import {
  clean_html,
  determine_ext,
  extract_attributes,
  get_element_by_class,
  merge_dicts,
  parse_duration,
  smuggle_url,
  str_or_none,
  traverse_obj,
  url_or_none,
} from '../../utils';
import { base_url, searchNextjsData, url_basename } from './_helpers';

export class ITVIE extends InfoExtractor {
  static IE_NAME = 'itv';
  static _VALID_URL = /https?:\/\/(?:www\.)?itv\.com\/hub\/[^/]+\/(?<id>[0-9a-zA-Z]+)/;

  protected _generateApiHeaders(hmac: string): Record<string, string> {
    return merge_dicts(
      {
        Accept: 'application/vnd.itv.vod.playlist.v2+json',
        'Content-Type': 'application/json',
        hmac: hmac.toUpperCase(),
      },
      this.geo_verification_headers(),
    ) as Record<string, string>;
  }

  protected async _callApi(
    videoId: string,
    playlistUrl: string,
    headers: Record<string, string>,
    platformTag: string,
    featureset: unknown,
    fatal = true,
  ): Promise<Record<string, unknown>> {
    return (
      (await this._download_json<Record<string, unknown>>(playlistUrl, videoId, undefined, {
        data: JSON.stringify({
          user: { itvUserId: '', entitlements: [], token: '' },
          device: {
            manufacturer: 'Safari',
            model: '5',
            os: { name: 'Windows NT', version: '6.1', type: 'desktop' },
          },
          client: { version: '4.1', id: 'browser' },
          variantAvailability: {
            featureset: { min: featureset, max: featureset },
            platformTag,
          },
        }),
        headers,
        fatal,
      })) || {}
    );
  }

  protected async _getSubtitles(
    videoId: string,
    variants: Record<string, unknown[]>,
    iosPlaylistUrl: string,
    headers: Record<string, string>,
  ): Promise<Record<string, Subtitle[]>> {
    const subtitles: Record<string, Subtitle[]> = {};
    const variantEntries = Object.entries(variants).reverse();
    let platformTagSubs: string | undefined;
    let featuresetSubs: unknown;

    for (const [platformTag, featuresets] of variantEntries) {
      for (const featureset of featuresets as unknown[]) {
        const fs = featureset as unknown[];
        if (fs?.[2] === 'outband-webvtt') {
          platformTagSubs = platformTag;
          featuresetSubs = featureset;
          break;
        }
      }
      if (platformTagSubs) break;
    }

    if (platformTagSubs && featuresetSubs) {
      const subsPlaylist = await this._callApi(
        videoId,
        iosPlaylistUrl,
        headers,
        platformTagSubs,
        featuresetSubs,
        false,
      );
      const subs = (traverse_obj(subsPlaylist, ['Playlist', 'Video', 'Subtitles']) as unknown[]) || [];
      for (const sub of subs) {
        if (!sub || typeof sub !== 'object') continue;
        const href = url_or_none((sub as Record<string, unknown>).Href);
        if (!href) continue;
        (subtitles.en ||= []).push({ url: href, ext: 'vtt' });
      }
    }
    return subtitles;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const params = extract_attributes(
      this._search_regex(/(<[^>]+id="video"[^>]*>)/, webpage, 'params')!,
    );
    const variants = this._parse_json<Record<string, unknown[]>>(
      String(params['data-video-variants'] || '{}'),
      videoId,
      null,
      false,
    ) || {};

    let platformTagVideo: string | undefined;
    let featuresetVideo: unknown;
    for (const [platformTag, featuresets] of Object.entries(variants).reverse()) {
      for (const featureset of featuresets) {
        const fs = featureset as unknown[];
        if (new Set(fs?.slice(0, 2) || []).size === 2 && fs?.includes('aes') && fs?.includes('hls')) {
          platformTagVideo = platformTag;
          featuresetVideo = featureset;
          break;
        }
      }
      if (platformTagVideo) break;
    }

    if (!platformTagVideo || !featuresetVideo) {
      throw new ExtractorError('No downloads available', { expected: true });
    }

    const iosPlaylistUrl = String(params['data-video-playlist'] || params['data-video-id'] || '');
    const headers = this._generateApiHeaders(String(params['data-video-hmac'] || ''));
    const iosPlaylist = await this._callApi(videoId, iosPlaylistUrl, headers, platformTagVideo, featuresetVideo);
    const videoData = (traverse_obj(iosPlaylist, ['Playlist', 'Video']) as Record<string, unknown>) || {};
    const iosBaseUrl = videoData.Base != null ? String(videoData.Base) : '';

    const formats: Format[] = [];
    for (const mediaFile of (videoData.MediaFiles as Array<Record<string, unknown>>) || []) {
      let href = mediaFile.Href != null ? String(mediaFile.Href) : '';
      if (!href) continue;
      if (iosBaseUrl) href = iosBaseUrl + href;
      const ext = determine_ext(href);
      if (ext === 'm3u8') {
        formats.push(
          ...(await this._extract_m3u8_formats(
            href,
            videoId,
            'mp4',
            'm3u8_native',
            undefined,
            undefined,
            'hls',
            undefined,
            false,
          )),
        );
      } else {
        formats.push({ format_id: 'http', url: href });
      }
    }

    const info = (this._search_json_ld(webpage, videoId, { fatal: false }) || {}) as Partial<VideoInfo>;

    const thumbnails: Thumbnail[] = [];
    const thumbnailUrl = params['data-video-posterframe'] != null ? String(params['data-video-posterframe']) : '';
    if (thumbnailUrl) {
      thumbnails.push(
        {
          url: thumbnailUrl
            .replace('{width}', '1920')
            .replace('{height}', '1080')
            .replace('{quality}', '100')
            .replace('{blur}', '0')
            .replace('{bg}', 'false'),
          width: 1920,
          height: 1080,
        },
        {
          url: `${base_url(thumbnailUrl)}/${url_basename(thumbnailUrl)}`,
          preference: -2,
        },
      );
    }

    const ogThumb = this._html_search_meta(['og:image', 'twitter:image'], webpage, undefined, false);
    if (ogThumb) thumbnails.push({ url: ogThumb });

    const seen = new Set<string>();
    const uniqueThumbs = thumbnails.filter((t) => {
      if (seen.has(t.url)) return false;
      seen.add(t.url);
      return true;
    });

    return merge_dicts(
      {
        id: videoId,
        title: this._html_search_meta(['og:title', 'twitter:title'], webpage, undefined, false) || videoId,
        formats,
        subtitles: await this._getSubtitles(videoId, variants, iosPlaylistUrl, headers),
        duration: parse_duration(videoData.Duration) ?? undefined,
        description: clean_html(get_element_by_class('episode-info__synopsis', webpage) || '') || undefined,
        thumbnails: uniqueThumbs,
      },
      info,
    ) as VideoInfo;
  }
}

export class ITVBTCCIE extends InfoExtractor {
  static IE_NAME = 'itv:btcc';
  static _VALID_URL = /https?:\/\/(?:www\.)?itv\.com\/(?:news|btcc)\/(?:[^/]+\/)*(?<id>[^/?#&]+)/;
  static BRIGHTCOVE_URL_TEMPLATE =
    'http://players.brightcove.net/%s/%s_default/index.html?videoId=%s';

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);
    const nextData = searchNextjsData(this, webpage, playlistId);
    const jsonMap =
      traverse_obj(nextData, ['pageProps', 'article', 'body', 'content']) ||
      traverse_obj(nextData, ['initialProps', 'pageProps', 'article', 'body', 'content']) ||
      [];

    const entries: VideoInfo[] = [];
    for (const video of (jsonMap as Array<Record<string, unknown>>) || []) {
      const data = video.data as Record<string, unknown> | undefined;
      if (!data) continue;
      if (data.name !== 'Brightcove' && data.type !== 'Brightcove') continue;
      const videoId = str_or_none(data.id);
      const accountId = data.accountId;
      const playerId = data.playerId;
      if (!videoId || !accountId || !playerId) continue;
      const bcUrl = smuggle_url(
        ITVBTCCIE.BRIGHTCOVE_URL_TEMPLATE.replace('%s', String(accountId))
          .replace('%s', String(playerId))
          .replace('%s', videoId),
        {
          geo_ip_blocks: ['193.113.0.0/16', '54.36.162.0/23', '159.65.16.0/21'],
          referrer: url,
        },
      );
      entries.push(this.url_result(bcUrl, 'BrightcoveNew', videoId));
    }

    return this.playlist_result(entries, playlistId, this._og_search_title(webpage) || playlistId);
  }
}
