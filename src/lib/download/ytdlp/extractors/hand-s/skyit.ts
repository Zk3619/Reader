/** SkyIt family ù?ported from yt-dlp skyit.py (main path) */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, dict_get, int_or_none, parse_duration, traverse_obj, unified_timestamp } from '../../utils';
import { extractM3u8FormatsAndSubtitles, searchNextjsData } from './_helpers';

const TOKEN_MAP: Record<string, string> = {
  cielo: 'Hh9O7M8ks5yi6nSROL7bKYz933rdf3GhwZlTLMgvy4Q',
  hotclub: 'kW020K2jq2lk2eKRJD2vWEg832ncx2EivZlTLQput2C',
  mtv8: 'A5Nn9GGb326CI7vP5e27d7E4PIaQjota',
  salesforce: 'C6D585FD1615272C98DE38235F38BD86',
  sitocommerciale: 'VJwfFuSGnLKnd9Phe9y96WkXgYDCguPMJ2dLhGMb2RE',
  sky: 'F96WlOd8yoFmLQgiqv6fNQRvHZcsWk5jDaYnDvhbiJk',
  skyarte: 'LWk29hfiU39NNdq87ePeRach3nzTSV20o0lTv2001Cd',
  theupfront: 'PRSGmDMsg6QMGc04Obpoy7Vsbn7i2Whp',
};

export class SkyItBaseIE extends InfoExtractor {
  static IE_NAME = 'skyit:base';
  static _GEO_BYPASS = false;
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  protected _DOMAIN = 'sky';
  static _PLAYER_TMPL = 'https://player.sky.it/player/external.html?id=%s&domain=%s';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new Error('SkyItBaseIE is not standalone');
  }

  protected _playerUrlResult(videoId: string): VideoInfo {
    return this.url_result(
      SkyItBaseIE._PLAYER_TMPL.replace('%s', videoId).replace('%s', this._DOMAIN),
      'player.sky.it',
      videoId,
    );
  }

  protected async _parseVideo(video: Record<string, unknown>, videoId: string): Promise<VideoInfo> {
    const isLive = video.type === 'live';
    const hlsUrl = (isLive ? video.streaming_url : video.hls_url) as string | undefined;
    if (!hlsUrl && (isLive ? video.geoblock : video.geob)) {
      this.raise_geo_restricted(undefined, ['IT']);
    }
    const { formats } = await extractM3u8FormatsAndSubtitles(this, hlsUrl!, videoId, 'hls');
    return {
      id: videoId,
      title: video.title as string | undefined,
      formats,
      thumbnail: dict_get(video, ['video_still', 'video_still_medium', 'thumb']) as string | undefined,
      description: (video.short_desc as string | undefined) || undefined,
      timestamp: unified_timestamp(video.create_date) ?? undefined,
      duration: int_or_none(video.duration_sec) ?? parse_duration(video.duration) ?? undefined,
      is_live: isLive,
    };
  }
}

export class SkyItPlayerIE extends SkyItBaseIE {
  static IE_NAME = 'player.sky.it';
  static _VALID_URL =
    /https?:\/\/player\.sky\.it\/player\/(?:external|social)\.html\?.*?\bid=(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const domain = new URL(url).searchParams.get('domain') || 'sky';
    const token = String(dict_get(TOKEN_MAP, domain, TOKEN_MAP.sky));
    const video = await this._download_json<Record<string, unknown>>(
      'https://apid.sky.it/vdp/v1/getVideoData',
      videoId,
      undefined,
      {
        query: { caller: 'sky', id: videoId, token },
        headers: this.geo_verification_headers(),
      },
    );
    return this._parseVideo(video, videoId);
  }
}

export class SkyItVideoIE extends SkyItBaseIE {
  static IE_NAME = 'video.sky.it';
  static _VALID_URL =
    /https?:\/\/(?:masterchef|video|xfactor)\.sky\.it(?:\/[^/]+)*\/video\/[0-9a-z-]+-(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    return this._playerUrlResult(this._match_id(url));
  }
}

export class SkyItVideoLiveIE extends SkyItBaseIE {
  static IE_NAME = 'video.sky.it:live';
  static _VALID_URL = /https?:\/\/video\.sky\.it\/diretta\/(?<id>[^/?&#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const nextData = searchNextjsData(this, webpage, displayId);
    const assetId = String(
      traverse_obj(nextData, ['props', 'initialState', 'livePage', 'content', 'asset_id']) || displayId,
    );
    const livestream = await this._download_json<Record<string, unknown>>(
      'https://apid.sky.it/vdp/v1/getLivestream',
      assetId,
      undefined,
      { query: { id: assetId } },
    );
    return this._parseVideo(livestream, assetId);
  }
}

export class SkyItIE extends SkyItBaseIE {
  static IE_NAME = 'sky.it';
  static _VALID_URL =
    /https?:\/\/(?:sport|tg24)\.sky\.it(?:\/[^/]+)*\/\d{4}\/\d{2}\/\d{2}\/(?<id>[^/?&#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const videoId = this._search_regex(/data-videoid="(\d+)"/, webpage, 'video id')!;
    return this._playerUrlResult(videoId);
  }
}

export class SkyItArteIE extends SkyItIE {
  static IE_NAME = 'arte.sky.it';
  static _VALID_URL = /https?:\/\/arte\.sky\.it\/video\/(?<id>[^/?&#]+)/;
  protected _DOMAIN = 'skyarte';

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const videoId = this._search_regex(
      /"embedUrl"\s*:\s*"(?:https:)?\/\/player\.sky\.it\/player\/external\.html\?[^"]*\bid=(\d+)/,
      webpage,
      'video id',
    )!;
    return this._playerUrlResult(videoId);
  }
}

export class CieloTVItIE extends SkyItIE {
  static IE_NAME = 'cielotv.it';
  static _VALID_URL = /https?:\/\/(?:www\.)?cielotv\.it\/video\/(?<id>[^.]+)\.html/;
  protected _DOMAIN = 'cielo';

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const videoId = this._search_regex(/videoId\s*=\s*"(\d+)"/, webpage, 'video id')!;
    return this._playerUrlResult(videoId);
  }
}

export class TV8ItIE extends SkyItVideoIE {
  static IE_NAME = 'tv8.it';
  static _VALID_URL = /https?:\/\/(?:www\.)?tv8\.it\/(?:show)?video\/(?:[0-9a-z-]+-)?(?<id>\d+)/;
  protected _DOMAIN = 'mtv8';
}

export class TV8ItLiveIE extends SkyItBaseIE {
  static IE_NAME = 'tv8.it:live';
  static IE_DESC = 'TV8 Live';
  static _VALID_URL = /https?:\/\/(?:www\.)?tv8\.it\/streaming/;
  protected _DOMAIN = 'mtv8';

  async _real_extract(_url: string): Promise<VideoInfo> {
    const videoId = 'tv8';
    const livestream = await this._download_json<Record<string, unknown>>(
      'https://apid.sky.it/vdp/v1/getLivestream',
      videoId,
      'Downloading manifest JSON',
      { query: { id: '7' } },
    );
    const metadata = await this._download_json<{ info?: Record<string, unknown> }>(
      'https://tv8.it/api/getStreaming',
      videoId,
      undefined,
      { fatal: false },
    );
    const info = await this._parseVideo(livestream, videoId);
    const metaInfo = metadata.info || {};
    return {
      ...info,
      title: traverse_obj(metaInfo, ['title', 'text']) as string | undefined,
      description: clean_html(String(traverse_obj(metaInfo, ['description', 'html']) || '')) || undefined,
    };
  }
}

export class TV8ItPlaylistIE extends InfoExtractor {
  static IE_NAME = 'tv8.it:playlist';
  static IE_DESC = 'TV8 Playlist';
  static _VALID_URL = /https?:\/\/(?:www\.)?tv8\.it\/(?!video)[^/#?]+\/(?<id>[^/#?]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);
    const nextData = searchNextjsData(this, webpage, playlistId);
    const data = traverse_obj(nextData, ['props', 'pageProps', 'data']) as Record<string, unknown>;
    const cards = ((data.lastContent as Record<string, unknown>)?.cards as Array<Record<string, unknown>>) || [];
    const entries = cards
      .filter((c) => c.href)
      .map((card) => {
        const extra = (card.extraData as Record<string, unknown>) || {};
        return this.url_result(
          `https://tv8.it${card.href}`,
          'tv8.it',
          String(extra.asset_id || ''),
          String(((card.title as Record<string, unknown>)?.typography as Record<string, unknown>)?.text || ''),
        );
      });
    const cardDesktop = (data.card as Record<string, unknown>)?.desktop as Record<string, unknown> | undefined;
    return this.playlist_result(
      entries,
      playlistId,
      traverse_obj(cardDesktop, ['title', 'text']) as string | undefined,
      clean_html(String(traverse_obj(cardDesktop, ['description', 'html']) || '')) || undefined,
    );
  }
}
