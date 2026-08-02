/** NownessBaseIE / NownessIE / NownessPlaylistIE / NownessSeriesIE — ported from yt-dlp nowness.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class NownessBaseIE extends InfoExtractor {
  static IE_NAME = 'NownessBase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('NownessBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _extractUrlResult(post: Record<string, unknown>): Promise<VideoInfo | null> {
    if (post.type !== 'video') return null;
    for (const media of (post.media as Array<Record<string, unknown>>) || []) {
      if (media.type !== 'video') continue;
      const videoId = String(media.content ?? '');
      const source = String(media.source ?? '');
      if (source === 'brightcove') {
        const playerCode = await this._download_webpage(
          `http://www.nowness.com/iframe?id=${videoId}`,
          videoId,
          'Downloading player JavaScript',
        );
        const bcMatch =
          playerCode.match(/players\.brightcove\.net\/[^"']+/) ||
          playerCode.match(/videoId[=:]["']?(\d+)/);
        if (bcMatch) {
          const bcUrl = bcMatch[0].includes('brightcove.net')
            ? `https://${bcMatch[0]}`
            : `https://players.brightcove.net/2385340575001/default_default/index.html?videoId=${bcMatch[1] || videoId}`;
          return this.url_result(bcUrl, 'BrightcoveNew', videoId);
        }
        throw new ExtractorError('Could not find player definition', { expected: true });
      }
      if (source === 'vimeo') return this.url_result(`http://vimeo.com/${videoId}`, 'Vimeo', videoId);
      if (source === 'youtube') return this.url_result(videoId, 'Youtube', videoId);
    }
    return null;
  }

  protected async _apiRequest(
    url: string,
    requestPath: string,
  ): Promise<[string, Record<string, unknown>]> {
    const displayId = this._match_id(url);
    const lang = url.includes('cn.nowness.com') ? 'zh-cn' : 'en-us';
    const data = await this._download_json<Record<string, unknown>>(
      `http://api.nowness.com/api/${requestPath.replace('%s', displayId)}`,
      displayId,
      undefined,
      { headers: { 'X-Nowness-Language': lang } },
    );
    return [displayId, data];
  }
}

export class NownessIE extends NownessBaseIE {
  static IE_NAME = 'nowness';
  static _VALID_URL =
    /https?:\/\/(?:(?:www|cn)\.)?nowness\.com\/(?:story|(?:series|category)\/[^/]+)\/(?<id>[^/]+?)(?:$|[?#])/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const [, post] = await this._apiRequest(url, 'post/getBySlug/%s');
    const result = await this._extractUrlResult(post);
    if (!result) throw new ExtractorError('No video found', { expected: true });
    return result;
  }
}

export class NownessPlaylistIE extends NownessBaseIE {
  static IE_NAME = 'nowness:playlist';
  static _VALID_URL = /https?:\/\/(?:(?:www|cn)\.)?nowness\.com\/playlist\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const [playlistId, playlist] = await this._apiRequest(url, 'post?PlaylistId=%s');
    const entries: VideoInfo[] = [];
    for (const item of (playlist.items as Array<Record<string, unknown>>) || []) {
      const r = await this._extractUrlResult(item);
      if (r) entries.push(r);
    }
    return this.playlist_result(entries, playlistId);
  }
}

export class NownessSeriesIE extends NownessBaseIE {
  static IE_NAME = 'nowness:series';
  static _VALID_URL = /https?:\/\/(?:(?:www|cn)\.)?nowness\.com\/series\/(?<id>[^/]+?)(?:$|[?#])/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const [, series] = await this._apiRequest(url, 'series/getBySlug/%s');
    const entries: VideoInfo[] = [];
    for (const post of (series.posts as Array<Record<string, unknown>>) || []) {
      const r = await this._extractUrlResult(post);
      if (r) entries.push(r);
    }
    const translations = (series.translations as Array<Record<string, unknown>>) || [];
    const t0 = translations[0] || {};
    return this.playlist_result(
      entries,
      String(series.id ?? ''),
      String(t0.title ?? t0.seoTitle ?? ''),
      String(t0.seoDescription ?? ''),
    );
  }
}
