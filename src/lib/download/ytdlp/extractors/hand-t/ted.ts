/** Ted family ù?ported from yt-dlp ted.py */

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

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const pageProps = searchNextjsData(this, webpage, displayId).pageProps as Record<string, unknown>;
    const talkInfo = (pageProps.videoData as Record<string, unknown>) || {};
    const videoId = String(talkInfo.id ?? displayId);
    const playerData = this._parse_json(String(talkInfo.playerData ?? '{}'), videoId) as Record<string, unknown>;

    let httpUrl: string | null = null;
    const formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};
    for (const [formatId, resources] of Object.entries((playerData.resources as Record<string, unknown>) || {})) {
      if (formatId === 'hls') {
        const streamUrl = url_or_none((resources as { stream?: string }).stream);
        if (!streamUrl) continue;
        const res = await extractM3u8FormatsAndSubtitles(this, streamUrl, videoId, formatId);
        formats.push(...res.formats);
        subtitles = mergeSubtitles(subtitles, res.subtitles);
        continue;
      }
      if (!Array.isArray(resources)) continue;
      if (formatId === 'h264') {
        for (const resource of resources) {
          const h264Url = (resource as { file?: string }).file;
          if (!h264Url) continue;
          const bitrate = int_or_none((resource as { bitrate?: unknown }).bitrate);
          formats.push({ url: h264Url, format_id: `${formatId}-${bitrate}k`, tbr: bitrate ?? undefined });
          if (/\d+k/.test(h264Url)) httpUrl = h264Url;
        }
      } else if (formatId === 'rtmp') {
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
          });
        }
      }
    }

    if (httpUrl) {
      for (const m3u8Format of formats.filter((f) => f.protocol === 'm3u8_native' && f.vcodec !== 'none')) {
        const bitrate = m3u8Format.url?.match(/(\d+k)/)?.[1];
        if (!bitrate) continue;
        const bitrateUrl = httpUrl.replace(/\d+k/, bitrate);
        const copy = { ...m3u8Format, url: bitrateUrl, format_id: String(m3u8Format.format_id).replace('hls', 'http'), protocol: 'https' as const };
        if (copy.acodec === 'none') delete copy.acodec;
        formats.push(copy);
      }
    }

    const audioDownload = url_or_none(talkInfo.audioDownload);
    if (audioDownload) formats.push({ url: audioDownload, format_id: 'audio', vcodec: 'none' });

    if (!formats.length) {
      const external = (playerData.external as Record<string, unknown>) || {};
      const service = String(external.service || '').toLowerCase();
      const extUrl = service === 'youtube' ? external.code : external.uri;
      return this.url_result(String(extUrl || ''));
    }

    let thumbnail = str_or_none(playerData.thumb) || this._og_search_property('image', webpage);
    if (thumbnail) thumbnail = thumbnail.split('?')[0]!;

    return {
      id: videoId,
      title: str_or_none(talkInfo.title) || this._og_search_title(webpage) || displayId,
      uploader: str_or_none(talkInfo.presenterDisplayName) ?? undefined,
      thumbnail: thumbnail ?? undefined,
      description: str_or_none(talkInfo.description) || (this._og_search_description(webpage) ?? undefined),
      subtitles: Object.keys(subtitles).length ? subtitles : undefined,
      formats,
      duration: int_or_none(talkInfo.duration) ?? parse_duration(this._og_search_property('video:duration', webpage) || '') ?? undefined,
      view_count: str_to_int(talkInfo.viewedCount) ?? undefined,
      upload_date: unified_strdate(talkInfo.publishedAt) ?? undefined,
      release_date: unified_strdate(talkInfo.recordedOn) ?? undefined,
      tags: try_get(playerData, (x) => (x as { targeting?: { tag?: string } }).targeting?.tag?.split(',')) as string[] | undefined,
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
    return this.playlist_result([...this._parsePlaylist(playlist)], String(playlist.id || displayId), title, this._og_search_description(webpage) ?? undefined);
  }
}

export class TedEmbedIE extends InfoExtractor {
  static IE_NAME = 'tedembed';
  static _VALID_URL = /https?:\/\/embed(?:-ssl)?\.ted\.com\//;

  async _real_extract(url: string): Promise<VideoInfo> {
    return this.url_result(url.replace(/:\/\/embed(-ssl)?/, '://www'), 'TedTalk');
  }
}
