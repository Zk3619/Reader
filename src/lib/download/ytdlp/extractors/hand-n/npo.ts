/** NPO* — ported from yt-dlp npo.py (main path; playlist subclasses simplified) */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { determine_ext, int_or_none, str_or_none, unified_timestamp, url_or_none } from '../../utils';
import { orderedSet, urlencodePostdata } from './_helpers';

export class NPOIE extends InfoExtractor {
  static IE_NAME = 'npo';
  static IE_DESC = 'npo.nl, ntr.nl, omroepwnl.nl, zapp.nl and npo3.nl';
  static _VALID_URL: RegExp | string | false | null =
    /(?:npo:|https?:\/\/(?:www\.)?(?:npo\.nl\/(?:[^/]+\/)*|(?:ntr|npostart)\.nl\/(?:[^/]+\/){2,}|omroepwnl\.nl\/video\/fragment\/[^/]+__|(?:zapp|npo3)\.nl\/(?:[^/]+\/){2,}))(?<id>[^/?#]+)/;

  static suitable(url: string): boolean {
    if (NPOLiveIE.suitable(url) || NPORadioIE.suitable(url) || NPORadioFragmentIE.suitable(url)) return false;
    return InfoExtractor.suitable.call(this, url);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const host = new URL(url.startsWith('npo:') ? `https://www.npo.nl/${videoId}` : url).hostname;

    let player: Record<string, unknown>;
    if (host.includes('ntr.nl')) {
      player = await this._download_json<Record<string, unknown>>(
        `https://www.ntr.nl/ajax/player/embed/${videoId}`,
        videoId,
        undefined,
        {
          query: {
            'parameters[elementId]': `npo${Math.floor(Math.random() * 1000)}`,
            'parameters[sterReferralUrl]': url,
            'parameters[autoplay]': '0',
          },
        },
      );
    } else {
      await this._request_webpage('https://www.npostart.nl/api/token', videoId, undefined, {
        headers: { Referer: url, 'X-Requested-With': 'XMLHttpRequest' },
      });
      const xsrfCookie = this._get_cookies('https://www.npostart.nl')['XSRF-TOKEN'];
      const xsrf = xsrfCookie ? decodeURIComponent(String(xsrfCookie)) : '';
      player = await this._download_json<Record<string, unknown>>(
        `https://www.npostart.nl/player/${videoId}`,
        videoId,
        undefined,
        {
          method: 'POST',
          data: urlencodePostdata({ autoplay: '0', share: '1', pageUrl: url, hasAdConsent: '0' }),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'x-xsrf-token': xsrf },
        },
      );
    }

    const playerToken = String(player.token ?? '');
    const formatUrls = new Set<string>();
    const formats: Format[] = [];
    let drm = false;

    for (const profile of ['hls', 'dash-widevine', 'dash-playready', 'smooth']) {
      const streams = await this._download_json<Record<string, unknown>>(
        `https://start-player.npo.nl/video/${videoId}/streams`,
        videoId,
        undefined,
        {
          method: 'POST',
          data: '',
          query: { profile, quality: 'npoplus', tokenId: playerToken, streamType: 'broadcast' },
          fatal: false,
        },
      );
      const stream = streams?.stream as Record<string, unknown> | undefined;
      if (!stream) continue;
      const streamUrl = url_or_none(stream.src);
      if (!streamUrl || formatUrls.has(streamUrl)) continue;
      formatUrls.add(streamUrl);
      if (stream.protection != null || stream.keySystemOptions != null) {
        drm = true;
        continue;
      }
      const ext = determine_ext(streamUrl);
      if (stream.type === 'application/dash+xml' || ext === 'mpd') {
        formats.push(...(await this._extract_mpd_formats(streamUrl, videoId, 'dash', undefined, false)));
      } else if (stream.type === 'application/vnd.apple.mpegurl' || ext === 'm3u8') {
        formats.push(
          ...(await this._extract_m3u8_formats(streamUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
        );
      } else {
        formats.push({ url: streamUrl, format_id: profile });
      }
    }

    if (!formats.length && drm && !this.params.allow_unplayable_formats) this.report_warning(`DRM protected: ${videoId}`);

    const info: VideoInfo = { id: videoId, title: videoId, formats };
    const embedUrl = url_or_none(player.embedUrl);
    if (embedUrl) {
      const webpage = await this._download_webpage(embedUrl, videoId, undefined, { fatal: false });
      if (webpage) {
        const videoMatch = webpage.match(/\bvideo\s*=\s*(\{.+?\})\s*;/s);
        if (videoMatch) {
          const video = this._parse_json<Record<string, unknown>>(videoMatch[1]!, videoId)!;
          const subtitles: Record<string, Subtitle[]> = {};
          for (const cc of (video.subtitles as Array<Record<string, unknown>>) || []) {
            const ccUrl = url_or_none(cc.src);
            if (!ccUrl) continue;
            const lang = str_or_none(cc.language) || 'nl';
            (subtitles[lang] ||= []).push({ url: ccUrl, ext: determine_ext(ccUrl, 'vtt') });
          }
          return {
            ...info,
            title: str_or_none(video.episodeTitle) ?? videoId,
            description: str_or_none(video.description) ?? undefined,
            thumbnail: url_or_none(video.still_image_url) || url_or_none(video.orig_image_url) || undefined,
            duration: int_or_none(video.duration) ?? undefined,
            timestamp: unified_timestamp(video.broadcastDate) ?? undefined,
            creator: str_or_none(video.channel) ?? undefined,
            series: str_or_none(video.title) ?? undefined,
            episode: str_or_none(video.episodeTitle) ?? undefined,
            episode_number: int_or_none(video.episodeNumber) ?? undefined,
            subtitles,
          };
        }
      }
    }
    return info;
  }
}

export class NPOLiveIE extends InfoExtractor {
  static IE_NAME = 'npo.nl:live';
  static _VALID_URL = /https?:\/\/(?:www\.)?npo(?:start)?\.nl\/live(?:\/(?<id>[^/?#&]+))?/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url) || 'npo-1';
    const webpage = await this._download_webpage(url, displayId);
    const liveId =
      this._search_regex(/media-id="([^"]+)"|data-prid="([^"]+)"/, webpage, 'live id', null, false) || displayId;
    return {
      _type: 'url_transparent',
      url: `npo:${liveId}`,
      ie_key: 'NPO',
      id: liveId,
      display_id: displayId,
    };
  }
}

export class NPORadioIE extends InfoExtractor {
  static IE_NAME = 'npo.nl:radio';
  static _VALID_URL = /https?:\/\/(?:www\.)?npo\.nl\/radio\/(?<id>[^/]+)/;

  static suitable(url: string): boolean {
    return NPORadioFragmentIE.suitable(url) ? false : InfoExtractor.suitable.call(this, url);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const title = this._html_search_regex(/data-channel\s*=\s*'([^']+)'/, webpage, 'title');
    const stream = this._parse_json<{ url?: string; codec?: string }>(
      this._html_search_regex(/data-streams\s*=\s*'([^']+)'/, webpage, 'data-streams'),
      videoId,
    )!;
    return {
      id: videoId,
      url: String(stream.url ?? ''),
      title: title ?? undefined,
      acodec: stream.codec,
      ext: stream.codec,
      format_id: stream.codec || 'http',
      is_live: true,
    };
  }
}

export class NPORadioFragmentIE extends InfoExtractor {
  static IE_NAME = 'npo.nl:radio:fragment';
  static _VALID_URL = /https?:\/\/(?:www\.)?npo\.nl\/radio\/[^/]+\/fragment\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const audioId = this._match_id(url);
    const webpage = await this._download_webpage(url, audioId);
    const title = this._html_search_regex(
      new RegExp(`href="/radio/[^/]+/fragment/${audioId}" title="([^"]+)"`),
      webpage,
      'title',
    );
    const audioUrl = this._search_regex(/data-streams='([^']+)'/, webpage, 'audio url')!;
    return { id: audioId, url: audioUrl, title: title ?? undefined, format_id: 'http', ext: 'mp3' };
  }
}

export class NPODataMidEmbedIE extends InfoExtractor {
  static IE_NAME = 'NPODataMidEmbed';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const videoId = this._search_regex(/data-mid=(["'])(?:(?!\1).)+\1/, webpage, 'video_id')!.replace(/["']/g, '');
    return { _type: 'url_transparent', ie_key: 'NPO', id: videoId, url: `npo:${videoId}`, display_id: displayId };
  }
}

export class SchoolTVIE extends NPODataMidEmbedIE {
  static IE_NAME = 'schooltv';
  static _VALID_URL = /https?:\/\/(?:www\.)?schooltv\.nl\/video\/(?<id>[^/?#&]+)/;
}

export class HetKlokhuisIE extends NPODataMidEmbedIE {
  static IE_NAME = 'hetklokhuis';
  static _VALID_URL = /https?:\/\/(?:www\.)?hetklokhuis\.nl\/[^/]+\/\d+\/(?<id>[^/?#&]+)/;
}

export class NPOPlaylistBaseIE extends NPOIE {
  static IE_NAME = 'NPOPlaylistBase';
  static _VALID_URL: RegExp | string | false | null = false;
  static _PLAYLIST_ENTRY_RE = /data-media-id="([^"]+)"/;
  static _PLAYLIST_TITLE_RE = /<h1[^>]+>([^<]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);
    const entryRe = (this.constructor as typeof NPOPlaylistBaseIE)._PLAYLIST_ENTRY_RE;
    const ids = orderedSet([...webpage.matchAll(new RegExp(entryRe.source, 'g'))].map((m) => m[1]!));
    const entries = ids.map((id) => this.url_result(id.startsWith('http') ? id : `npo:${id}`, 'NPO', id));
    const title =
      this._html_search_regex((this.constructor as typeof NPOPlaylistBaseIE)._PLAYLIST_TITLE_RE, webpage, 'playlist title', null, false) ||
      this._og_search_title(webpage) ||
      playlistId;
    return this.playlist_result(entries, playlistId, title);
  }
}

export class VPROIE extends NPOPlaylistBaseIE {
  static IE_NAME = 'vpro';
  static _VALID_URL = /https?:\/\/(?:www\.)?(?:(?:tegenlicht\.)?vpro|2doc)\.nl\/(?:[^/]+\/)*(?<id>[^/]+)\.html/;
  static _PLAYLIST_ENTRY_RE = /data-media-id="([^"]+)"/;
}

export class WNLIE extends NPOPlaylistBaseIE {
  static IE_NAME = 'wnl';
  static _VALID_URL = /https?:\/\/(?:www\.)?omroepwnl\.nl\/video\/(?:fragment\/)?(?<id>[^/?#]+)/;
  static _PLAYLIST_ENTRY_RE = /data-media-id="([^"]+)"/;
}

export class AndereTijdenIE extends NPOPlaylistBaseIE {
  static IE_NAME = 'anderetijden';
  static _VALID_URL = /https?:\/\/(?:www\.)?anderetijden\.nl\/(?:[^/]+\/)*(?<id>[^/]+)/;
  static _PLAYLIST_ENTRY_RE = /data-media-id="([^"]+)"/;
}
