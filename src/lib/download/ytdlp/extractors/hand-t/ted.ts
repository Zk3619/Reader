/** Ted family ? ported from yt-dlp ted.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  int_or_none,
  parse_duration,
  str_or_none,
  str_to_int,
  try_get,
  unified_strdate,
  url_or_none,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles, searchNextjsData } from './_helpers';

const TED_REFERER = { Referer: 'https://www.ted.com/' };

/** playerData may be a JSON string or already-parsed object in __NEXT_DATA__ */
function asPlayerData(
  ie: InfoExtractor,
  raw: unknown,
  videoId: string,
): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === 'string' && raw.trim()) {
    return (ie._parse_json(raw, videoId, null, false) as Record<string, unknown>) || {};
  }
  return {};
}

/** Strip TED HLS `preview` query; remaining playlist is still full VOD */
function stripTedPreviewParam(url: string): string {
  try {
    const u = new URL(url);
    if (u.searchParams.has('preview')) {
      u.searchParams.delete('preview');
    }
    return u.toString();
  } catch {
    return url
      .replace(/([?&])preview(?:=[^&]*)?/gi, '$1')
      .replace(/\?&/, '?')
      .replace(/[?&]$/, '')
      .replace(/&&+/g, '&');
  }
}

export class TedBaseIE extends InfoExtractor {
  static IE_NAME = 'tedbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  static _VALID_URL_BASE = String.raw`https?://www\.ted\.com/(?<type>talks|series|playlists(?:/\d+)?)(?:/lang/[^/#?]+)?/(?<id>[\w-]+)`;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('TedBaseIE is not a standalone extractor', { expected: true });
  }

  protected *_parsePlaylist(playlist: Record<string, unknown>): Generator<VideoInfo> {
    const nodes = try_get(playlist, (x) => (x as { videos?: { nodes?: unknown[] } }).videos?.nodes) as
      | Array<Record<string, unknown>>
      | undefined;
    for (const entry of nodes || []) {
      if (entry.__typename === 'Video' && entry.canonicalUrl) {
        yield this.url_result(String(entry.canonicalUrl), 'TedTalk');
      }
    }
  }
}

export class TedTalkIE extends TedBaseIE {
  static IE_NAME = 'tedtalk';
  static _VALID_URL = /https?:\/\/www\.ted\.com\/talks(?:\/lang\/[^/#?]+)?\/(?<id>[\w-]+)/;
  static _TESTS = [
    {
      url: 'https://www.ted.com/talks/candace_parker_how_to_break_down_barriers_and_not_accept_limits',
      info_dict: {
        id: '86532',
        ext: 'mp4',
        title: 'How to break down barriers and not accept limits',
        uploader: 'Candace Parker',
      },
    },
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const pageProps = searchNextjsData(this, webpage, displayId).pageProps as Record<string, unknown>;
    const talkInfo = (pageProps.videoData as Record<string, unknown>) || {};
    const videoId = String(talkInfo.id ?? displayId);
    const playerData = asPlayerData(this, talkInfo.playerData, videoId);

    let httpUrl: string | null = null;
    const formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};
    const durationSec =
      int_or_none(talkInfo.duration) ??
      parse_duration(this._og_search_property('video:duration', webpage) || '') ??
      null;

    // 1) Progressive h264 first ? complete file, measurable size (avoid tiny HLS manifests)
    const h264Resources = playerData.resources && (playerData.resources as Record<string, unknown>).h264;
    if (Array.isArray(h264Resources)) {
      for (const resource of h264Resources) {
        const h264Url = url_or_none((resource as { file?: string }).file);
        if (!h264Url) continue;
        const bitrate = int_or_none((resource as { bitrate?: unknown }).bitrate);
        const filesizeApprox =
          bitrate != null && durationSec != null && durationSec > 0
            ? Math.round((bitrate * 1000 * durationSec) / 8)
            : undefined;
        formats.push({
          url: h264Url,
          format_id: `h264-${bitrate ?? '0'}k`,
          tbr: bitrate ?? undefined,
          filesize_approx: filesizeApprox,
          ext: 'mp4',
          protocol: 'https',
          vcodec: 'avc1',
          acodec: 'mp4a.40.2',
          // Above HLS so bv*+ba/b and UI prefer progressive MP4
          preference: 100,
          http_headers: { ...TED_REFERER },
        });
        if (/\d+k/i.test(h264Url)) httpUrl = h264Url;
      }
    }

    for (const [formatId, resources] of Object.entries(
      (playerData.resources as Record<string, unknown>) || {},
    )) {
      if (formatId === 'hls') {
        let streamUrl = url_or_none((resources as { stream?: string }).stream);
        if (!streamUrl) continue;
        streamUrl = stripTedPreviewParam(streamUrl);
        const res = await extractM3u8FormatsAndSubtitles(this, streamUrl, videoId, formatId);
        for (const f of res.formats) {
          formats.push({
            ...f,
            preference: f.preference ?? -10,
            http_headers: { ...(f.http_headers || {}), ...TED_REFERER },
          });
        }
        subtitles = mergeSubtitles(subtitles, res.subtitles);
        continue;
      }
      if (formatId === 'h264') continue; // handled above
      if (!Array.isArray(resources)) continue;
      if (formatId === 'rtmp') {
        const streamer = talkInfo.streamer;
        if (!streamer) continue;
        for (const resource of resources) {
          const file = (resource as { file?: string }).file;
          if (!file) continue;
          formats.push({
            format_id: `${formatId}-${(resource as { name?: string }).name}`,
            url: String(streamer),
            play_path: file,
            ext: 'flv',
            width: int_or_none((resource as { width?: unknown }).width) ?? undefined,
            height: int_or_none((resource as { height?: unknown }).height) ?? undefined,
            tbr: int_or_none((resource as { bitrate?: unknown }).bitrate) ?? undefined,
            preference: -50,
          });
        }
      }
    }

    if (httpUrl) {
      for (const m3u8Format of formats.filter(
        (f) =>
          (f.protocol === 'm3u8_native' || f.protocol === 'm3u8') && f.vcodec !== 'none',
      )) {
        const bitrate = m3u8Format.url?.match(/(\d+k)/i)?.[1];
        if (!bitrate) continue;
        const bitrateUrl = httpUrl.replace(/\d+k/i, bitrate);
        const copy: Format = {
          ...m3u8Format,
          url: bitrateUrl,
          format_id: String(m3u8Format.format_id).replace('hls', 'http'),
          protocol: 'https',
          ext: 'mp4',
          preference: 50,
          http_headers: { ...TED_REFERER },
        };
        if (copy.acodec === 'none') delete copy.acodec;
        formats.push(copy);
      }
    }

    const audioDownload = url_or_none(talkInfo.audioDownload);
    if (audioDownload) {
      formats.push({
        url: audioDownload,
        format_id: 'audio',
        vcodec: 'none',
        ext: 'mp3',
        protocol: 'https',
        preference: -20,
        http_headers: { ...TED_REFERER },
      });
    }

    if (!formats.length) {
      const external = (playerData.external as Record<string, unknown>) || {};
      const service = String(external.service || '').toLowerCase();
      if (service === 'youtube' && external.code) {
        return this.url_result(
          `https://www.youtube.com/watch?v=${String(external.code)}`,
          'Youtube',
          String(external.code),
        );
      }
      const extUrl = url_or_none(external.uri) || url_or_none(external.code);
      if (extUrl) return this.url_result(extUrl);
      throw new ExtractorError('No TED formats found', { expected: true });
    }

    let thumbnail = str_or_none(playerData.thumb) || this._og_search_property('image', webpage);
    if (thumbnail) thumbnail = thumbnail.split('?')[0]!;

    return {
      id: videoId,
      title: str_or_none(talkInfo.title) || this._og_search_title(webpage) || displayId,
      uploader: str_or_none(talkInfo.presenterDisplayName) ?? undefined,
      thumbnail: thumbnail ?? undefined,
      description:
        str_or_none(talkInfo.description) || (this._og_search_description(webpage) ?? undefined),
      subtitles: Object.keys(subtitles).length ? subtitles : undefined,
      formats,
      duration: durationSec ?? undefined,
      view_count: str_to_int(talkInfo.viewedCount) ?? undefined,
      upload_date: unified_strdate(talkInfo.publishedAt) ?? undefined,
      release_date: unified_strdate(talkInfo.recordedOn) ?? undefined,
      tags: try_get(playerData, (x) => (x as { targeting?: { tag?: string } }).targeting?.tag?.split(
        ',',
      )) as string[] | undefined,
      http_headers: { ...TED_REFERER },
    };
  }
}

export class TedSeriesIE extends TedBaseIE {
  static IE_NAME = 'tedseries';
  static _VALID_URL = /https?:\/\/www\.ted\.com\/series(?:\/lang\/[^/#?]+)?\/(?<id>[\w-]+)(?:#season_(?<season>\d+))?/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const displayId = m.groups!.id!;
    const season = m.groups!.season;
    const webpage = await this._download_webpage(url, displayId, 'Downloading series webpage');
    const pageProps = searchNextjsData(this, webpage, displayId).pageProps as Record<string, unknown>;
    const seasons = (pageProps.seasons as Array<Record<string, unknown>>) || [];
    const entries: VideoInfo[] = [];
    for (const s of seasons) {
      if (season != null && String(s.seasonNumber) !== season) continue;
      entries.push(...this._parsePlaylist(s));
    }
    const seriesId = try_get(pageProps, (x) => (x as { series?: { id?: string } }).series?.id);
    const seriesName =
      try_get(pageProps, (x) => (x as { series?: { name?: string } }).series?.name) ||
      this._og_search_title(webpage, false);
    const playlistId = season && seriesId ? `${seriesId}_${season}` : String(seriesId || displayId);
    const title = season && seriesName ? `${seriesName} Season ${season}` : seriesName || displayId;
    return this.playlist_result(entries, playlistId, title, this._og_search_description(webpage) ?? undefined);
  }
}

export class TedPlaylistIE extends TedBaseIE {
  static IE_NAME = 'tedplaylist';
  static _VALID_URL = /https?:\/\/www\.ted\.com\/playlists(?:\/\d+)?(?:\/lang\/[^/#?]+)?\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const pageProps = searchNextjsData(this, webpage, displayId).pageProps as Record<string, unknown>;
    const playlist = (pageProps.playlist as Record<string, unknown>) || {};
    const title =
      str_or_none(playlist.title) ||
      this._og_search_title(webpage, false)?.replace(' | TED Talks', '') ||
      displayId;
    return this.playlist_result(
      [...this._parsePlaylist(playlist)],
      String(playlist.id || displayId),
      title,
      this._og_search_description(webpage) ?? undefined,
    );
  }
}

export class TedEmbedIE extends InfoExtractor {
  static IE_NAME = 'tedembed';
  static _VALID_URL = /https?:\/\/embed(?:-ssl)?\.ted\.com\//;

  async _real_extract(url: string): Promise<VideoInfo> {
    return this.url_result(url.replace(/:\/\/embed(-ssl)?/, '://www'), 'TedTalk');
  }
}
