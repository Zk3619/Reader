// @ts-nocheck
/** ZingMp3 extractors â€?ported from yt-dlp zingmp3.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { createHash, createHmac } from 'node:crypto';
import {
  int_or_none,
  join_nonempty,
  url_or_none,
  urljoin,
} from '../../utils';

function protoRelative(url: string): string {
  return url.startsWith('//') ? `https:${url}` : url;
}

export class ZingMp3BaseIE extends InfoExtractor {
  static IE_NAME = 'zingmp3base';
  static _VALID_URL = false;
  static _VALID_URL_TMPL =
    /https?:\/\/(?:mp3\.zing|zingmp3)\.vn\/(?<type>(?:%s))\/[^/?#]+\/(?<id>\w+)(?:\.html|\?)/;
  static _GEO_COUNTRIES = ['VN'];
  static _DOMAIN = 'https://zingmp3.vn';
  static _PER_PAGE = 50;
  static _API_SLUGS: Record<string, string> = {
    'bai-hat': '/api/v2/page/get/song',
    embed: '/api/v2/page/get/song',
    'video-clip': '/api/v2/page/get/video',
    lyric: '/api/v2/lyric/get/lyric',
    'song-streaming': '/api/v2/song/get/streaming',
    liveradio: '/api/v2/livestream/get/info',
    eps: '/api/v2/page/get/podcast-episode',
    'episode-streaming': '/api/v2/podcast/episode/get/streaming',
    playlist: '/api/v2/page/get/playlist',
    album: '/api/v2/page/get/playlist',
    pgr: '/api/v2/page/get/podcast-program',
    'pgr-list': '/api/v2/podcast/episode/get/list',
    cgr: '/api/v2/page/get/podcast-category',
    'cgr-list': '/api/v2/podcast/program/get/list-by-cate',
    cgrs: '/api/v2/page/get/podcast-categories',
    'zing-chart': '/api/v2/page/get/chart-home',
    'zing-chart-tuan': '/api/v2/page/get/week-chart',
    'moi-phat-hanh': '/api/v2/page/get/newrelease-chart',
    'the-loai-video': '/api/v2/video/get/list',
    'info-artist': '/api/v2/page/get/artist',
    'user-list-song': '/api/v2/song/get/list',
    'user-list-video': '/api/v2/video/get/list',
    hub: '/api/v2/page/get/hub-detail',
    'new-release': '/api/v2/chart/get/new-release',
    top100: '/api/v2/page/get/top-100',
    'podcast-new': '/api/v2/podcast/program/get/list-by-type',
    'top-podcast': '/api/v2/podcast/program/get/top-episode',
  };

  protected _api_url(urlType: string, params: Record<string, string | number>): string {
    const apiSlug = ZingMp3BaseIE._API_SLUGS[urlType];
    const baseParams: Record<string, string> = { ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), ctime: '1' };
    const sha256 = createHash('sha256')
      .update(Object.entries(baseParams).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join(''))
      .digest('hex');
    const sig = createHmac('sha512', 'acOrvUS15XRW2o9JksiK1KgQ6Vbds8ZW')
      .update(`${apiSlug}${sha256}`)
      .digest('hex');
    const q = new URLSearchParams({ ...baseParams, apiKey: 'X5BM3w8N7MKozC0B85o4KMlzLZKhV00y', sig });
    return `${ZingMp3BaseIE._DOMAIN}${apiSlug}?${q.toString()}`;
  }

  protected async _call_api(
    urlType: string,
    params: Record<string, string | number>,
    displayId?: string,
    opts?: { query?: Record<string, string>; fatal?: boolean },
  ): Promise<Record<string, any>> {
    const raw = await this._download_json<Record<string, any>>(
      this._api_url(urlType, params),
      displayId || String(params.id || ''),
      `Downloading ${urlType} JSON metadata`,
      { query: opts?.query, fatal: opts?.fatal },
    );
    return (raw || {}).data || {};
  }

  protected _parse_items(items: unknown): VideoInfo[] {
    const out: VideoInfo[] = [];
    for (const x of Array.isArray(items) ? items : []) {
      const link = url_or_none((x as Record<string, any>).link);
      if (!link) continue;
      out.push(this.url_result(urljoin(ZingMp3BaseIE._DOMAIN, link)));
    }
    return out;
  }

  protected async _fetch_page(_id: string, _urlType: string, _page: number): Promise<Record<string, any>> {
    throw new Error('Not implemented');
  }

  protected async _paged_list(id: string, urlType: string): Promise<VideoInfo[]> {
    const entries: VideoInfo[] = [];
    let count = 0;
    for (let page = 1; ; page++) {
      const data = await this._fetch_page(id, urlType, page);
      const pageEntries = this._parse_items(data.items);
      entries.push(...pageEntries);
      count += pageEntries.length;
      if (!data.hasMore) break;
      if (int_or_none(data.total) != null && count > Number(data.total)) break;
    }
    return entries;
  }
}

export class ZingMp3IE extends ZingMp3BaseIE {
  static IE_NAME = 'zingmp3';
  static IE_DESC = 'zingmp3.vn';
  static _VALID_URL =
    /https?:\/\/(?:mp3\.zing|zingmp3)\.vn\/(?<type>(?:bai-hat|video-clip|embed|eps))\/[^/?#]+\/(?<id>\w+)(?:\.html|\?)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url);
    const songId = m?.groups?.id || this._match_id(url);
    const urlType = m?.groups?.type || 'bai-hat';
    const item = await this._call_api(urlType, { id: songId });
    const itemId = String(item.encodeId || songId);

    let source: Record<string, any> = {};
    if (urlType === 'video-clip') {
      source = (item.streaming || {}) as Record<string, any>;
      const videoInfo = await this._download_json<Record<string, any>>(
        'http://api.mp3.zing.vn/api/mobile/video/getvideoinfo',
        itemId,
        'Downloading mp4 JSON metadata',
        { query: { requestdata: JSON.stringify({ id: itemId }) } },
      );
      source.mp4 = videoInfo.source || {};
    } else if (urlType === 'eps') {
      source = await this._call_api('episode-streaming', { id: itemId });
    } else {
      source = await this._call_api('song-streaming', { id: itemId });
    }

    const formats: Format[] = [];
    for (const [k, v] of Object.entries(source || {})) {
      if (!v || v === 'VIP') continue;
      if (k !== 'mp4' && k !== 'hls') {
        const u = url_or_none(v);
        if (!u) continue;
        formats.push({
          ext: 'mp3',
          format_id: k,
          tbr: int_or_none(k) ?? undefined,
          url: protoRelative(u),
          vcodec: 'none',
        });
        continue;
      }
      for (const [res, videoUrl] of Object.entries((v || {}) as Record<string, any>)) {
        const vu = url_or_none(videoUrl);
        if (!vu) continue;
        if (k === 'hls') {
          formats.push(...(await this._extract_m3u8_formats(vu, itemId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)));
        } else {
          formats.push({ format_id: `mp4-${res}`, url: vu, height: int_or_none(res) ?? undefined });
        }
      }
    }

    if (!formats.length) {
      if (item.msg === 'Sorry, this content is not available in your country.') {
        this.raise_geo_restricted('This content is not available in your country.');
      }
      this.raise_no_formats('The song is only for VIP accounts.');
    }

    const lyric = item.lyric || (await this._call_api('lyric', { id: itemId }, undefined, { fatal: false })).file;
    const subtitles: Record<string, Subtitle[]> | undefined = lyric ? { origin: [{ url: String(lyric) }] } : undefined;
    const album = (item.album || {}) as Record<string, any>;

    return {
      id: itemId,
      title: String(item.title || item.alias || itemId),
      thumbnail: String(item.thumbnail || item.thumbnailM || '') || undefined,
      duration: int_or_none(item.duration) ?? undefined,
      track: String(item.title || item.alias || '') || undefined,
      artist: String(item.artistsNames || item.artists_names || item.artists?.[0]?.name || '') || undefined,
      album: String(album.name || album.title || item.genres?.[0]?.name || '') || undefined,
      album_artist: String(album.artistsNames || album.artists_names || item.artists?.[0]?.name || '') || undefined,
      formats,
      subtitles,
    };
  }
}

export class ZingMp3AlbumIE extends ZingMp3BaseIE {
  static IE_NAME = 'zingmp3:album';
  static _VALID_URL =
    /https?:\/\/(?:mp3\.zing|zingmp3)\.vn\/(?<type>(?:album|playlist))\/[^/?#]+\/(?<id>\w+)(?:\.html|\?)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url);
    const songId = m?.groups?.id || this._match_id(url);
    const urlType = m?.groups?.type || 'playlist';
    const data = await this._call_api(urlType, { id: songId });
    return this.playlist_result(
      this._parse_items(data.song?.items),
      String(data.id || data.encodeId || songId),
      String(data.name || data.title || songId),
    );
  }
}

export class ZingMp3ChartHomeIE extends ZingMp3BaseIE {
  static IE_NAME = 'zingmp3:chart-home';
  static _VALID_URL =
    /https?:\/\/(?:mp3\.zing|zingmp3)\.vn\/(?<id>(?:zing-chart|moi-phat-hanh|top100|podcast-discover))\/?(?:[#?]|$)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const urlType = this._match_id(url);
    const params: Record<string, string> = { id: urlType };
    if (urlType === 'podcast-discover') params.type = 'discover';
    const data = await this._call_api(urlType, params);
    const items: Record<string, any>[] = [];
    if (urlType === 'top100') {
      for (const e of Array.isArray(data) ? data : []) items.push(...((e as Record<string, any>).items || []));
    } else if (urlType === 'zing-chart') {
      items.push(...((data.RTChart?.items || []) as Record<string, any>[]));
    } else {
      items.push(...((data.items || []) as Record<string, any>[]));
    }
    return this.playlist_result(this._parse_items(items), urlType);
  }
}

export class ZingMp3WeekChartIE extends ZingMp3BaseIE {
  static IE_NAME = 'zingmp3:week-chart';
  static _VALID_URL =
    /https?:\/\/(?:mp3\.zing|zingmp3)\.vn\/(?<type>(?:zing-chart-tuan))\/[^/?#]+\/(?<id>\w+)(?:\.html|\?)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url);
    const songId = m?.groups?.id || this._match_id(url);
    const urlType = m?.groups?.type || 'zing-chart-tuan';
    const data = await this._call_api(urlType, { id: songId });
    return this.playlist_result(
      this._parse_items(data.items),
      songId,
      `zing-chart-${String(data.country || '')}`,
    );
  }
}

export class ZingMp3ChartMusicVideoIE extends ZingMp3BaseIE {
  static IE_NAME = 'zingmp3:chart-music-video';
  static _VALID_URL =
    /https?:\/\/(?:mp3\.zing|zingmp3)\.vn\/(?<type>the-loai-video)\/(?<regions>[^/]+)\/(?<id>[^.]+)/;

  protected async _fetch_page(songId: string, urlType: string, page: number): Promise<Record<string, any>> {
    return this._call_api(urlType, { id: songId, type: 'genre', page, count: ZingMp3BaseIE._PER_PAGE });
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url);
    const songId = m?.groups?.id || this._match_id(url);
    const regions = m?.groups?.regions || '';
    const urlType = m?.groups?.type || 'the-loai-video';
    const entries = await this._paged_list(songId, urlType);
    return this.playlist_result(entries, songId, `${urlType}_${regions}`);
  }
}

export class ZingMp3UserIE extends ZingMp3BaseIE {
  static IE_NAME = 'zingmp3:user';
  static _VALID_URL =
    /https?:\/\/(?:mp3\.zing|zingmp3)\.vn\/(?<user>[^/]+)\/(?<type>bai-hat|single|album|video|song)\/?(?:[?#]|$)/;

  protected async _fetch_page(userId: string, urlType: string, page: number): Promise<Record<string, any>> {
    const t = urlType === 'bai-hat' ? 'user-list-song' : 'user-list-video';
    return this._call_api(t, { id: userId, type: 'artist', page, count: ZingMp3BaseIE._PER_PAGE });
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url);
    const alias = m?.groups?.user || '';
    const urlType = m?.groups?.type || 'bai-hat';
    const userInfo = await this._call_api('info-artist', {}, alias, { query: { alias } });

    if (alias === 'new-release' && (urlType === 'song' || urlType === 'album')) {
      const id = `${alias}-${urlType}`;
      const data = await this._call_api('new-release', { type: urlType }, id);
      return this.playlist_result(this._parse_items(data.items), id);
    }

    let entries: VideoInfo[] = [];
    if (urlType === 'bai-hat' || urlType === 'video') {
      entries = await this._paged_list(String(userInfo.id || ''), urlType);
    } else {
      const sectionId = urlType === 'album' ? 'aAlbum' : 'aSingle';
      const section = ((userInfo.sections || []) as Record<string, any>[]).find((x) => x.sectionId === sectionId);
      entries = this._parse_items(section?.items || []);
    }
    return this.playlist_result(
      entries,
      String(userInfo.id || alias),
      join_nonempty(String(userInfo.name || ''), urlType, ' - '),
      String(userInfo.biography || '') || undefined,
    );
  }
}

export class ZingMp3HubIE extends ZingMp3BaseIE {
  static IE_NAME = 'zingmp3:hub';
  static _VALID_URL =
    /https?:\/\/(?:mp3\.zing|zingmp3)\.vn\/(?<type>hub)\/[^/?#]+\/(?<id>[^./?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url);
    const songId = m?.groups?.id || this._match_id(url);
    const urlType = m?.groups?.type || 'hub';
    const hub = await this._call_api(urlType, { id: songId });
    const section = ((hub.sections || []) as Record<string, any>[]).find((x) => x.sectionId === 'hub');
    return this.playlist_result(
      this._parse_items(section?.items || []),
      songId,
      String(hub.title || songId),
      String(hub.description || '') || undefined,
    );
  }
}

export class ZingMp3LiveRadioIE extends ZingMp3BaseIE {
  static IE_NAME = 'zingmp3:liveradio';
  static _VALID_URL =
    /https?:\/\/(?:mp3\.zing|zingmp3)\.vn\/(?<type>(?:liveradio))\/(?<id>\w+)(?:\.html|\?)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url);
    const urlType = m?.groups?.type || 'liveradio';
    const liveRadioId = m?.groups?.id || this._match_id(url);
    const info = await this._call_api(urlType, { id: liveRadioId });
    const manifestUrl = url_or_none(info.streaming);
    if (!manifestUrl) throw new ExtractorError('This radio is offline.', { expected: true });
    const fmts = await this._extract_m3u8_formats(
      manifestUrl,
      liveRadioId,
      'mp4',
      'm3u8_native',
      undefined,
      undefined,
      'hls',
      undefined,
      false,
    );
    return {
      id: liveRadioId,
      is_live: true,
      formats: fmts,
      title: String(info.title || liveRadioId),
      thumbnail: String(info.thumbnail || info.thumbnailM || info.thumbnailV || info.thumbnailH || '') || undefined,
      view_count: int_or_none(info.activeUsers) ?? undefined,
      like_count: int_or_none(info.totalReaction) ?? undefined,
      description: String(info.description || '') || undefined,
    };
  }
}

export class ZingMp3PodcastEpisodeIE extends ZingMp3BaseIE {
  static IE_NAME = 'zingmp3:podcast-episode';
  static _VALID_URL =
    /https?:\/\/(?:mp3\.zing|zingmp3)\.vn\/(?<type>(?:pgr|cgr))\/[^/?#]+\/(?<id>\w+)(?:\.html|\?)/;

  protected async _fetch_page(epsId: string, urlType: string, page: number): Promise<Record<string, any>> {
    return this._call_api(urlType, { id: epsId, page, count: ZingMp3BaseIE._PER_PAGE });
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url);
    const podcastId = m?.groups?.id || this._match_id(url);
    const urlType = m?.groups?.type || 'pgr';
    const podcastInfo = await this._call_api(urlType, { id: podcastId });
    const entries = await this._paged_list(podcastId, urlType === 'pgr' ? 'pgr-list' : 'cgr-list');
    return this.playlist_result(
      entries,
      podcastId,
      String(podcastInfo.title || podcastId),
      String(podcastInfo.description || '') || undefined,
    );
  }
}

export class ZingMp3PodcastIE extends ZingMp3BaseIE {
  static IE_NAME = 'zingmp3:podcast';
  static _VALID_URL =
    /https?:\/\/(?:mp3\.zing|zingmp3)\.vn\/(?<id>(?:cgr|top-podcast|podcast-new))\/?(?:[#?]|$)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const urlType = this._match_id(url);
    const params: Record<string, string> = { id: urlType };
    if (urlType === 'podcast-new') params.type = 'new';
    const data = await this._call_api(urlType === 'cgr' ? 'cgrs' : urlType, params);
    return this.playlist_result(this._parse_items(data.items), urlType);
  }
}
