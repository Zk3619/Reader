// @ts-nocheck
/** VGTVIE / BTArticleIE / BTVestlendingenIE â€?ported from yt-dlp vgtv.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { float_or_none, try_get } from '../../utils';

const HOST_TO_APPNAME: Record<string, string> = {
  'tv.vg.no': 'vgtv',
  'vgtv.no': 'vgtv',
  'bt.no/tv': 'bttv',
  'aftenbladet.no/tv': 'satv',
  'fvn.no/fvntv': 'fvntv',
  'aftenposten.no/webtv': 'aptv',
  'ap.vgtv.no/webtv': 'aptv',
  'tv.aftonbladet.se': 'abtv',
  'tv.aftonbladet.se/abtv': 'abtv',
  'www.aftonbladet.se/tv': 'abtv',
};

const APP_NAME_TO_VENDOR: Record<string, string> = {
  vgtv: 'vgtv',
  bttv: 'bt',
  satv: 'sa',
  fvntv: 'fvn',
  aptv: 'ap',
  abtv: 'ab',
};

export class VGTVIE extends InfoExtractor {
  static IE_NAME = 'VGTV';
  static IE_DESC = 'VGTV, BTTV, FTV, Aftenposten and Aftonbladet';
  static _WORKING = false;
  static _GEO_BYPASS = false;
  static _VALID_URL = new RegExp(
    String.raw`(?:https?://(?:www\.)?(?<host>${Object.keys(HOST_TO_APPNAME).map((h) => h.replace(/\./g, '\\.')).join('|')})/?(?:(?:\#!/)?(?:video|live)/|embed?.*id=|a(?:rticles)?/)|(?<appname>${Object.keys(APP_NAME_TO_VENDOR).join('|')}):)(?<id>\d+)`,
  );

  async _real_extract(url: string): Promise<VideoInfo> {
    const mobj = this._match_valid_url(url)!;
    const videoId = mobj.groups!.id!;
    const host = mobj.groups!.host;
    const appname = host ? HOST_TO_APPNAME[host]! : mobj.groups!.appname!;
    const vendor = APP_NAME_TO_VENDOR[appname]!;

    const data = await this._download_json<Record<string, unknown>>(
      `http://svp.vg.no/svp/api/v1/${vendor}/assets/${videoId}?appName=${appname}-website`,
      videoId,
      'Downloading media JSON',
    );

    if (data.status === 'inactive') {
      throw new ExtractorError(`Video ${videoId} is no longer available`, { expected: true });
    }

    const streams = data.streamUrls as Record<string, unknown>;
    const streamType = data.streamType as string | undefined;
    const isLive = streamType === 'live';
    const formats: Format[] = [];

    const hlsUrl = streams?.hls as string | undefined;
    if (hlsUrl) {
      formats.push(
        ...(await this._extract_m3u8_formats(
          hlsUrl,
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
    }

    // HDS/f4m skipped â€?not supported in Reader port
    const mp4Urls = [...((streams?.pseudostreaming as string[]) || [])];
    const mp4Url = streams?.mp4 as string | undefined;
    if (mp4Url) mp4Urls.push(mp4Url);
    for (const mp4 of mp4Urls) {
      const formatInfo: Format = { url: mp4 };
      const dim = /(\d+)_(\d+)_(\d+)/.exec(mp4);
      if (dim) {
        const tbr = Number(dim[3]);
        formatInfo.width = Number(dim[1]);
        formatInfo.height = Number(dim[2]);
        formatInfo.tbr = tbr;
        formatInfo.format_id = `mp4-${tbr}`;
      }
      formats.push(formatInfo);
    }

    if (!formats.length) {
      const properties = try_get(
        data,
        (x) => (x as Record<string, unknown>).streamConfiguration as Record<string, unknown>,
      ) as Record<string, unknown> | undefined;
      const props = properties?.properties;
      if (Array.isArray(props) && props.includes('geoblocked')) {
        const country = (host || '').split('.').pop()?.split('/')[0]?.toUpperCase();
        this.raise_geo_restricted(undefined, country ? [country] : undefined);
      }
    }

    const images = data.images as Record<string, string> | undefined;
    return {
      id: videoId,
      title: String(data.title || videoId),
      description: data.description != null ? String(data.description) : undefined,
      thumbnail: images?.main ? `${images.main}?t[]=900x506q80` : undefined,
      timestamp: data.published != null ? Number(data.published) : undefined,
      duration: float_or_none(data.duration, 1000) ?? undefined,
      view_count: data.displays != null ? Number(data.displays) : undefined,
      is_live: isLive,
      formats,
    };
  }
}

export class BTArticleIE extends InfoExtractor {
  static IE_NAME = 'bt:article';
  static IE_DESC = 'Bergens Tidende Articles';
  static _VALID_URL = /https?:\/\/(?:www\.)?bt\.no\/(?:[^/]+\/)+(?<id>[^/]+)-\d+\.html/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const webpage = await this._download_webpage(url, this._match_id(url));
    const videoId = this._search_regex(/<video[^>]+data-id="(\d+)"/, webpage, 'video id')!;
    return this.url_result(`bttv:${videoId}`, 'VGTV');
  }
}

export class BTVestlendingenIE extends InfoExtractor {
  static IE_NAME = 'bt:vestlendingen';
  static IE_DESC = 'Bergens Tidende - Vestlendingen';
  static _VALID_URL = /https?:\/\/(?:www\.)?bt\.no\/spesial\/vestlendingen\/#!\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    return this.url_result(`bttv:${this._match_id(url)}`, 'VGTV');
  }
}
