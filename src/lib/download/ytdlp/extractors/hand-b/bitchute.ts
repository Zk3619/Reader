/**
 * BitChuteIE / BitChuteChannelIE — aligned with yt-dlp bitchute.py
 *
 * BitChute seed CDN 常对多连接 Range 返回 404/416；直链需探测可用 seed，并强制单连接下载。
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
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

/** yt-dlp BitChuteIE._check_format seed host list */
const BITCHUTE_SEED_HOSTS = [
  '\\g<2>', // keep original seedN
  'seed122',
  'seed125',
  'seed126',
  'seed128',
  'seed132',
  'seed150',
  'seed151',
  'seed152',
  'seed153',
  'seed167',
  'seed171',
  'seed177',
  'seed305',
  'seed307',
  'seedp29xb',
  'zb10-7gsop1v78',
] as const;

const MEDIA_HEADERS: Record<string, string> = {
  Referer: 'https://www.bitchute.com/',
  Origin: 'https://www.bitchute.com',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

function orderedUnique(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

/** Expand media URL across known BitChute seed hosts. */
export function bitchuteSeedCandidates(mediaUrl: string): string[] {
  const re = /^(https?:\/\/)(seed\d+)(?=\.bitchute\.com)/i;
  return orderedUnique(
    BITCHUTE_SEED_HOSTS.map((host) => {
      if (host === '\\g<2>') return mediaUrl;
      return mediaUrl.replace(re, `$1${host}`);
    }),
  );
}

function parseIso8601(dateStr: unknown): number | null {
  if (dateStr == null) return null;
  const t = Date.parse(String(dateStr));
  return Number.isFinite(t) ? Math.trunc(t / 1000) : null;
}

export class BitChuteIE extends InfoExtractor {
  static IE_NAME = 'bitchute';
  static IE_DESC = 'BitChute';
  static _VALID_URL =
    /https?:\/\/(?:(?:www|old)\.)?bitchute\.com\/(?:video|embed|torrent\/[^/?#]+)\/(?<id>[^/?#&]+)/;
  static _GEO_BYPASS = false;
  static _TESTS = [
    { url: 'https://www.bitchute.com/video/UGlrF9o9b-Q/', only_matching: true },
    { url: 'https://www.bitchute.com/embed/lbb5G1hjPhw/', only_matching: true },
  ];

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
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Referer: 'https://www.bitchute.com/',
          },
        },
      );
    } catch (e) {
      const msg = (e as Error).message || String(e);
      if (/403|geo|location/i.test(msg)) {
        try {
          this.raise_geo_restricted(msg);
        } catch (geo) {
          if (fatal) throw geo;
        }
      }
      if (fatal) throw e;
      this.report_warning(msg);
      return {};
    }
  }

  /** Probe seed hosts until HEAD succeeds (yt-dlp `_check_format`). */
  protected async _checkFormat(
    videoUrl: string,
    videoId: string,
  ): Promise<(Format & { filesize?: number | null }) | null> {
    for (const url of bitchuteSeedCandidates(videoUrl)) {
      try {
        const resp = await this._request_webpage(url, videoId, `Checking ${url}`, {
          method: 'HEAD',
          fatal: false,
          headers: MEDIA_HEADERS,
        });
        if (!resp || (resp.status != null && resp.status >= 400)) {
          this.to_screen(`${videoId}: URL is invalid, skipping: HTTP ${resp?.status ?? '?'}`);
          continue;
        }
        const len =
          resp.headers['content-length'] ||
          resp.headers['Content-Length'] ||
          '';
        return {
          format_id: 'http',
          url,
          ext: determine_ext(url) || 'mp4',
          protocol: 'https',
          filesize: int_or_none(len),
          http_headers: { ...MEDIA_HEADERS },
        };
      } catch (e) {
        this.to_screen(`${videoId}: URL is invalid, skipping: ${(e as Error).message || e}`);
      }
    }
    return null;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const data = { video_id: videoId };
    const mediaJson = await this._callApi('video/media', data, videoId);
    const mediaUrl = String(mediaJson.media_url || '');

    let formats: Format[] = [];
    if (!mediaUrl) {
      /* fall through to raise_no_formats */
    } else if (determine_ext(mediaUrl) === 'm3u8') {
      formats = await this._extract_m3u8_formats(
        mediaUrl,
        videoId,
        'mp4',
        'm3u8_native',
        undefined,
        undefined,
        'hls',
        undefined,
        true,
        { headers: MEDIA_HEADERS },
      );
      formats = formats.map((f) => ({
        ...f,
        http_headers: { ...(f.http_headers || {}), ...MEDIA_HEADERS },
      }));
    } else {
      // Default: probe seeds (BitChute seeds rot frequently)
      const checkFormats = this.params.check_formats;
      if (checkFormats !== false) {
        const fmt = await this._checkFormat(mediaUrl, videoId);
        if (fmt) formats.push(fmt);
      } else {
        formats.push({
          format_id: 'http',
          url: mediaUrl,
          ext: determine_ext(mediaUrl) || 'mp4',
          protocol: 'https',
          http_headers: { ...MEDIA_HEADERS },
        });
      }
      // Soft fallback: still offer original URL if all HEADs failed
      if (!formats.length && mediaUrl) {
        this.report_warning('BitChute seed probe failed; trying original media URL');
        formats.push({
          format_id: 'http',
          url: mediaUrl,
          ext: determine_ext(mediaUrl) || 'mp4',
          protocol: 'https',
          http_headers: { ...MEDIA_HEADERS },
        });
      }
    }

    if (!formats.length) {
      this.raise_no_formats(
        'Video is unavailable. Please make sure this video is playable in the browser before reporting this issue.',
        true,
      );
    }

    const video = await this._callApi('video', data, videoId, false);
    const channelId = traverse_obj(video, ['channel', 'channel_id']) as string | undefined;
    const channel = channelId
      ? await this._callApi('channel', { channel_id: channelId }, videoId, false)
      : undefined;

    const profileId = video.profile_id != null ? String(video.profile_id) : undefined;
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
      timestamp: parseIso8601(video.date_published) ?? undefined,
      duration: parse_duration(video.duration) ?? undefined,
      tags: Array.isArray(video.hashtags) ? (video.hashtags as string[]).filter(Boolean) : undefined,
      view_count: int_or_none(video.view_count) ?? undefined,
      is_live: video.state_id === 'live',
      formats,
      webpage_url: `https://www.bitchute.com/video/${videoId}/`,
      original_url: url,
      extractor: 'bitchute',
      extractor_key: 'BitChute',
      http_headers: MEDIA_HEADERS,
    };

    if (channel && Object.keys(channel).length) {
      result.channel = (channel.channel_name as string) || result.channel;
      result.channel_id = (channel.channel_id as string) || result.channel_id;
      const slug = channel.url_slug as string | undefined;
      if (slug) result.channel_url = CHANNEL_URL_TMPL(slug);
      result.uploader = (channel.profile_name as string) || undefined;
      const chProfileId = channel.profile_id != null ? String(channel.profile_id) : undefined;
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
  static _VALID_URL =
    /https?:\/\/(?:(?:www|old)\.)?bitchute\.com\/(?<type>channel|playlist)\/(?<id>[^/?#&]+)/;

  static _TOKEN = 'zyG6tQcGPE5swyAEFLqKUwMuMMuF6IO2DZ6ZDQjGfsL0e4dcTLwqkTTul05Jdve7';
  static PAGE_SIZE = 25;
  static HTML_CLASS_NAMES: Record<string, { container: string; title: string; description: string }> =
    {
      channel: {
        container: 'channel-videos-container',
        title: 'channel-videos-title',
        description: 'channel-videos-text',
      },
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
