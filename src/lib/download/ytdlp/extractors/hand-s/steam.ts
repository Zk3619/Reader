/** SteamIE / SteamCommunityIE / SteamCommunityBroadcastIE — ported from yt-dlp steam.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import {
  clean_html,
  join_nonempty,
  js_to_json,
  str_or_none,
  url_or_none,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles, parse_resolution, url_basename } from './_helpers';

export class SteamIE extends InfoExtractor {
  static IE_NAME = 'steam';
  static _VALID_URL =
    /https?:\/\/store\.steampowered\.com(?:\/agecheck)?\/app\/(?<id>\d+)\/?(?:[^?/#]+\/?)?(?:[?#]|$)/;

  protected async *_entries(
    appId: string,
    appName: string | undefined,
    dataProps: Record<string, unknown>,
  ): AsyncGenerator<VideoInfo> {
    const trailers = (dataProps.trailers as Array<Record<string, unknown>>) || [];
    for (const trailer of trailers) {
      const movieId = str_or_none(trailer.id);
      if (!movieId) continue;
      const thumbnails: Thumbnail[] = [];
      for (const key of ['poster', 'thumbnail']) {
        const thumbUrl = url_or_none(trailer[key]);
        if (thumbUrl) thumbnails.push({ url: thumbUrl, ...parse_resolution(url_basename(thumbUrl)) });
      }
      const formats: Format[] = [];
      const hls = url_or_none(trailer.hlsManifest);
      if (hls) {
        formats.push(
          ...(await this._extract_m3u8_formats(hls, appId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
        );
      }
      for (const dash of (trailer.dashManifests as string[]) || []) {
        if (url_or_none(dash)) {
          formats.push(...(await this._extract_mpd_formats(dash, appId, undefined, undefined, false)));
        }
      }
      yield {
        id: join_nonempty(appId, movieId, '-'),
        title: join_nonempty(appName, 'video', movieId, ' ') || movieId,
        formats,
        series: appName,
        series_id: appId,
        thumbnails,
      };
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const appId = this._match_id(url);
    const webpage = await this._download_webpage(url, appId);
    const carouselMatch = webpage.match(/class=["'][^"']*gamehighlight_desktopcarousel[^"']*["'][^>]*data-props=["']([^"']+)["']/i);
    const dataProps = carouselMatch
      ? this._parse_json<Record<string, unknown>>(
          carouselMatch[1]!.replace(/&quot;/g, '"'),
          appId,
        ) || {}
      : {};
    const appName = clean_html(String(dataProps.appName || '')) || undefined;
    const entries: VideoInfo[] = [];
    for await (const e of this._entries(appId, appName, dataProps)) entries.push(e);
    return this.playlist_result(entries, appId, appName);
  }
}

export class SteamCommunityIE extends InfoExtractor {
  static IE_NAME = 'steamcommunity';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?steamcommunity\.com\/sharedfiles\/filedetails(?:\/?\?(?:[^#]+&)?id=|\/)(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const fileId = this._match_id(url);
    const webpage = await this._download_webpage(url, fileId);
    const flashvars =
      this._search_json<Record<string, Record<string, string>>>(
        /var\s+rgMovieFlashvars\s*=/,
        webpage,
        'flashvars',
        fileId,
        { transform_source: js_to_json, default: {} },
      ) || {};
    let youtubeId: string | undefined;
    for (const obj of Object.values(flashvars)) {
      if (obj?.YOUTUBE_VIDEO_ID) {
        youtubeId = obj.YOUTUBE_VIDEO_ID;
        break;
      }
    }
    if (!youtubeId) {
      const frameMatch = webpage.match(/class=["'][^"']*movieFrame modal[^"']*["'][^>]*id=["']([^"']+)["']/i);
      youtubeId = frameMatch?.[1];
    }
    if (!youtubeId) throw new ExtractorError('No video found', { expected: true });
    return this.url_result(youtubeId, 'Youtube');
  }
}

export class SteamCommunityBroadcastIE extends InfoExtractor {
  static IE_NAME = 'steamcommunity:broadcast';
  static _VALID_URL = /https?:\/\/(?:www\.)?steamcommunity\.com\/broadcast\/watch\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const jsonData = await this._download_json<{ hls_url?: string; num_view?: number }>(
      'https://steamcommunity.com/broadcast/getbroadcastmpd/',
      videoId,
      undefined,
      { query: { steamid: videoId } },
    );
    const res = await extractM3u8FormatsAndSubtitles(this, jsonData.hls_url!, videoId, 'mp4');
    const uploaderJson = (
      await this._download_json<Array<Record<string, unknown>>>(
        'https://steamcommunity.com/actions/ajaxresolveusers',
        videoId,
        undefined,
        { query: { steamids: videoId } },
      )
    )[0]!;
    return {
      id: videoId,
      title: this._og_search_title(webpage) || videoId,
      formats: res.formats,
      live_status: 'is_live',
      view_count: jsonData.num_view,
      uploader: uploaderJson.persona_name as string | undefined,
      uploader_id: str_or_none(uploaderJson.accountid) || undefined,
      subtitles: res.subtitles,
    };
  }
}
