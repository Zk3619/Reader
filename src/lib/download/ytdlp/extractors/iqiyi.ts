/**
 * IqiyiIE — domestic iqiyi.com / pps.tv / qy.net
 *
 * Legacy path: HTML data-player-tvid + tmts (yt-dlp iqiyi.py).
 * Modern path: accelerator.js tvid + cache.video.iqiyi.com/dash (vf signed),
 * aligned with current iqiyi player / videodl dash flow.
 */

import CryptoJS from 'crypto-js';
import { InfoExtractor, ExtractorError } from '../common';
import type { Format, VideoInfo } from '../types';
import { parseHlsMediaPlaylist } from '../hls-native';

const IQ_HEADERS: Record<string, string> = {
  Referer: 'https://www.iqiyi.com/',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

const FORMATS_MAP: Record<string, number> = {
  '96': 1,
  '1': 2,
  '2': 3,
  '21': 4,
  '4': 5,
  '17': 5,
  '5': 6,
  '18': 7,
};

/** Dash bid → quality rank / label (iq.com _BID_TAGS subset). */
const BID_QUALITY: Record<number, { rank: number; note: string }> = {
  100: { rank: 1, note: '240P' },
  200: { rank: 2, note: '360P' },
  300: { rank: 3, note: '480P' },
  500: { rank: 4, note: '720P' },
  600: { rank: 5, note: '1080P' },
  610: { rank: 6, note: '1080P50' },
  700: { rank: 7, note: '2K' },
  800: { rank: 8, note: '4K' },
};

const DASH_BIDS = [200, 300, 500, 600, 800] as const;
const APP_VERSION = '13.062.22175';

function md5Text(text: string): string {
  return CryptoJS.MD5(text).toString(CryptoJS.enc.Hex);
}

function removeStart(text: string, start: string): string {
  return text.startsWith(start) ? text.slice(start.length) : text;
}

/** videodl / player vf — MD5 of path+query with appended scramble chars. */
export function iqiyiDashVf(pathAndQuery: string): string {
  const path = pathAndQuery.replace(/^(https?:\/\/)?cache\.video\.iqiyi\.com/i, '');
  let s = path;
  for (let t = 0; t < 4; t++) {
    for (let i = 0; i < 2; i++) {
      for (let n = 0; n < 4; n++) {
        const v = (70 * t + 677 * i + 21 * n + 87 * t * i * n + 59) % 30;
        s += String.fromCharCode(v < 9 ? v + 48 : v + 88);
      }
    }
  }
  return md5Text(s);
}

export function iqiyiDashAuthKey(tm: number, tvid: string): string {
  const giveaway = md5Text('');
  return md5Text(`${giveaway}${tm}${tvid}`);
}

function parseScrsz(scrsz: unknown): { width?: number; height?: number; resolution?: string } {
  const m = String(scrsz || '').match(/(\d+)\s*x\s*(\d+)/i);
  if (!m) return {};
  const width = Number(m[1]);
  const height = Number(m[2]);
  if (!(width > 0 && height > 0)) return {};
  return { width, height, resolution: `${width}x${height}` };
}

function tvidFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const q =
      u.searchParams.get('tvid') ||
      u.searchParams.get('tvId') ||
      u.searchParams.get('TVID');
    if (q && /^\d+$/.test(q)) return q;
  } catch {
    /* ignore */
  }
  const m = url.match(/[?&#]tvid=(\d+)/i);
  return m?.[1] || null;
}

export class IqiyiIE extends InfoExtractor {
  static IE_NAME = 'iqiyi';
  static IE_DESC = '爱奇艺';
  /** iqiyi.com / pps.tv pages + qy.net short links (+ sharePlay via iqiyi host). */
  static _VALID_URL =
    /https?:\/\/(?:(?:(?:[^.]+\.)?iqiyi\.com|www\.pps\.tv)\/.+|(?:www\.)?qy\.net\/[\w%-]+)/i;

  private async getRawData(tvid: string, videoId: string): Promise<Record<string, unknown>> {
    const tm = Date.now();
    const key = 'd5fb4bd9d50c4be6948c97edd7254b0e';
    const sc = md5Text(`${tm}${key}${tvid}`);
    const params = {
      tvid,
      vid: videoId,
      src: '76f90cbd92f94a2e925d83e8ccd22cb7',
      sc,
      t: String(tm),
    };
    const url = `http://cache.m.iqiyi.com/jp/tmts/${tvid}/${videoId}/`;
    const text = await this._download_webpage(url, videoId, 'Downloading iqiyi tmts', {
      query: params,
      headers: { ...IQ_HEADERS, ...this.geo_verification_headers() },
    });
    return this._parse_json(removeStart(text, 'var tvInfoJs='), videoId) as Record<string, unknown>;
  }

  private async extractPlaylist(webpage: string): Promise<VideoInfo | null> {
    const links = [
      ...webpage.matchAll(
        /<a[^>]+class="site-piclist_pic_link"[^>]+href="(http:\/\/www\.iqiyi\.com\/.+\.html)"/gi,
      ),
    ].map((m) => m[1]!);
    if (!links.length) return null;

    const albumId = this._search_regex(/albumId\s*:\s*(\d+),/, webpage, 'album ID')!;
    const albumTitle = this._html_search_regex(
      /data-share-title="([^"]+)"/,
      webpage,
      'album title',
      null,
      false,
    );

    const entries: VideoInfo[] = links.map((link) => this.url_result(link, 'Iqiyi'));
    const PAGE_SIZE = 50;

    for (let pageNum = 2; ; pageNum++) {
      const pagelistPage = await this._download_webpage(
        `http://cache.video.qiyi.com/jp/avlist/${albumId}/${pageNum}/${PAGE_SIZE}/`,
        albumId,
        `Downloading playlist page ${pageNum}`,
        { headers: IQ_HEADERS, fatal: false },
      );
      if (!pagelistPage) break;
      const pagelist = this._parse_json(
        removeStart(pagelistPage, 'var tvInfoJs='),
        albumId,
        undefined,
        false,
      ) as { data?: { vlist?: Array<{ vurl?: string }> } } | null;
      const vlist = pagelist?.data?.vlist || [];
      for (const item of vlist) {
        if (item.vurl) entries.push(this.url_result(item.vurl, 'Iqiyi'));
      }
      if (vlist.length < PAGE_SIZE) break;
    }

    return this.playlist_result(entries, albumId, albumTitle);
  }

  /** Follow qy.net → sharePlay (tvid in query) or other redirects. */
  private async resolveCanonicalUrl(url: string): Promise<string> {
    if (!/\.?qy\.net\//i.test(url)) {
      return url;
    }
    const pick = (res: { url?: string; headers?: Record<string, string> } | null): string | null => {
      if (!res) return null;
      if (res.url && /iqiyi\.com/i.test(res.url) && res.url !== url) return res.url;
      const loc =
        res.headers?.location ||
        res.headers?.Location ||
        Object.entries(res.headers || {}).find(([k]) => k.toLowerCase() === 'location')?.[1];
      if (loc && /^https?:\/\//i.test(loc)) return loc;
      if (res.url && res.url !== url) return res.url;
      return null;
    };
    const head = await this._request_webpage(url, 'iqiyi', 'Resolving iqiyi short URL', {
      headers: IQ_HEADERS,
      fatal: false,
      headersOnly: true,
      method: 'HEAD',
    });
    const fromHead = pick(head);
    if (fromHead) return fromHead;
    const getRes = await this._request_webpage(url, 'iqiyi', 'Resolving iqiyi short URL (GET)', {
      headers: IQ_HEADERS,
      fatal: false,
    });
    return pick(getRes) || url;
  }

  /** Modern player: accelerator.js embeds QiyiPlayerProphetData.tvid when Referer is the play page. */
  private async tvidFromAccelerator(pageUrl: string, videoId: string): Promise<string | null> {
    const text = await this._download_webpage(
      'https://mesh.if.iqiyi.com/player/lw/lwplay/accelerator.js?apiVer=3',
      videoId,
      'Downloading iqiyi accelerator',
      {
        headers: { ...IQ_HEADERS, Referer: pageUrl },
        fatal: false,
      },
    );
    if (!text) return null;
    const m =
      text.match(/window\.QiyiPlayerProphetData\s*=\s*\{[^}]*?"tvid"\s*:\s*(\d+)/) ||
      text.match(/"tvid"\s*:\s*(\d+)/);
    return m?.[1] || null;
  }

  private async fetchCoverTitle(tvid: string): Promise<{ title?: string; thumbnail?: string }> {
    const deviceId = md5Text(`${Date.now()}${Math.random()}`);
    const params: Record<string, string> = {
      entity_id: tvid,
      device_id: deviceId,
      auth_cookie: '',
      pcv: APP_VERSION,
      app_version: APP_VERSION,
      ext: '',
      app_mode: 'standard',
      scale: '125',
      timestamp: String(Date.now()),
      src: 'pca_tvg',
      os: '',
      conduit_id: '',
    };
    const query = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join('&');
    params.sign = md5Text(`${query}&secret_key=howcuteitis`).toUpperCase();
    try {
      const data = (await this._download_json(
        'https://mesh.if.iqiyi.com/tvg/v2/lw/base_info',
        tvid,
        'Downloading iqiyi cover info',
        { query: params, headers: IQ_HEADERS, fatal: false },
      )) as { data?: { base_data?: { title?: string; image_url?: string } } } | null;
      const base = data?.data?.base_data;
      return {
        title: base?.title ? String(base.title) : undefined,
        thumbnail: base?.image_url ? String(base.image_url) : undefined,
      };
    } catch {
      return {};
    }
  }

  private async fetchDashBid(
    tvid: string,
    bid: number,
  ): Promise<{ bid: number; m3u8: string; scrsz?: string; vsize?: number; vid?: string } | null> {
    const tm = Date.now();
    const deviceId = md5Text(`${tm}${bid}${Math.random()}`);
    const params: Record<string, string | number> = {
      tvid,
      bid,
      vid: '',
      src: '01010031010000000000',
      vt: 0,
      rs: 1,
      uid: '',
      ori: 'pcw',
      ps: 1,
      k_uid: deviceId,
      pt: 0,
      d: 0,
      s: '',
      lid: 0,
      cf: 0,
      ct: 0,
      authKey: iqiyiDashAuthKey(tm, tvid),
      k_tag: 1,
      dfp: '',
      locale: 'zh_cn',
      pck: '',
      k_err_retries: 0,
      up: '',
      qd_v: 'a1',
      tm,
      k_ft1: '706436220846084',
      k_ft4: '1162321298202628',
      k_ft5: '150994945',
      k_ft7: '4',
      fr_300: '120_120_120_120_120_120',
      fr_500: '120_120_120_120_120_120',
      fr_600: '120_120_120_120_120_120',
      fr_800: '120_120_120_120_120_120',
      fr_1020: '120_120_120_120_120_120',
      bop: encodeURIComponent(JSON.stringify({ version: '10.0', dfp: '', b_ft1: 28 })),
      sr: 1,
      ost: 0,
      ut: 0,
    };
    const qs = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    const vf = iqiyiDashVf(`/dash?${qs}`);
    const dashUrl = `https://cache.video.iqiyi.com/dash?${qs}&vf=${vf}`;
    const raw = (await this._download_json(dashUrl, tvid, `Downloading iqiyi dash bid=${bid}`, {
      headers: { ...IQ_HEADERS, ...this.geo_verification_headers() },
      fatal: false,
    })) as {
      code?: string;
      data?: {
        program?: {
          video?: Array<{
            bid?: number;
            ff?: string;
            m3u8?: string;
            scrsz?: string;
            vsize?: number;
            vid?: string;
          }>;
        };
      };
    } | null;
    if (!raw || raw.code === 'A00111') {
      if (raw?.code === 'A00111') this.raise_geo_restricted();
      return null;
    }
    if (raw.code && raw.code !== 'A00000') return null;
    const videos = raw.data?.program?.video || [];
    const hit =
      videos.find((v) => v.bid === bid && v.m3u8 && v.ff !== 'dash') ||
      videos.find((v) => v.m3u8 && v.ff !== 'dash');
    if (!hit?.m3u8) return null;
    return {
      bid: Number(hit.bid ?? bid),
      m3u8: String(hit.m3u8),
      scrsz: hit.scrsz != null ? String(hit.scrsz) : undefined,
      vsize: typeof hit.vsize === 'number' ? hit.vsize : undefined,
      vid: hit.vid != null ? String(hit.vid) : undefined,
    };
  }

  private formatsFromM3u8Body(
    m3u8: string,
    bid: number,
    extra?: { scrsz?: string; vsize?: number },
  ): Format | null {
    const parsed = parseHlsMediaPlaylist(m3u8, 'https://www.iqiyi.com/');
    if (!parsed.fragments.length) return null;
    const meta = BID_QUALITY[bid] || { rank: 0, note: String(bid) };
    const dim = parseScrsz(extra?.scrsz);
    return {
      format_id: String(bid),
      format_note: meta.note,
      url: parsed.fragments[0]!.url,
      ext: 'mp4',
      protocol: 'm3u8_frag_urls',
      quality: meta.rank,
      preference: meta.rank,
      filesize: extra?.vsize ?? null,
      ...dim,
      fragments: parsed.fragments.map((f) => ({
        url: f.url,
        media_sequence: f.mediaSequence,
        byte_range: f.byteRange
          ? { start: f.byteRange.start, end: f.byteRange.end }
          : undefined,
      })),
      http_headers: IQ_HEADERS,
      vcodec: 'h264',
      acodec: 'aac',
    };
  }

  private async extractDashFormats(tvid: string): Promise<Format[]> {
    const results = await Promise.all(DASH_BIDS.map((bid) => this.fetchDashBid(tvid, bid)));
    const byBid = new Map<number, Format>();
    for (const row of results) {
      if (!row) continue;
      if (byBid.has(row.bid)) continue;
      const fmt = this.formatsFromM3u8Body(row.m3u8, row.bid, {
        scrsz: row.scrsz,
        vsize: row.vsize,
      });
      if (fmt) byBid.set(row.bid, fmt);
    }
    return [...byBid.values()].sort((a, b) => (a.quality ?? 0) - (b.quality ?? 0));
  }

  private async extractTmtsFormats(tvid: string, videoId: string): Promise<Format[]> {
    let formats: Format[] = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      const rawData = await this.getRawData(tvid, videoId);
      if (rawData.code !== 'A00000') {
        if (rawData.code === 'A00111') {
          this.raise_geo_restricted();
        }
        throw new ExtractorError(`Unable to load iqiyi data. Error code: ${String(rawData.code)}`, {
          expected: true,
        });
      }

      const data = rawData.data as Record<string, unknown>;
      const vidl = (data.vidl as Record<string, unknown>[]) || [];
      formats = vidl
        .filter((stream) => stream.m3utx)
        .map((stream) => {
          const vd = String(stream.vd);
          return {
            url: String(stream.m3utx),
            format_id: vd,
            ext: 'mp4',
            quality: FORMATS_MAP[vd] ?? -1,
            protocol: 'm3u8_native' as const,
            http_headers: IQ_HEADERS,
          };
        });

      if (formats.length) break;
      await new Promise((r) => setTimeout(r, 5000));
    }
    return formats;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const canonical = await this.resolveCanonicalUrl(url);
    let tvid = tvidFromUrl(canonical) || tvidFromUrl(url);

    let webpage = '';
    let videoId: string | null = null;

    // HTML page path (legacy attributes + title scrape)
    if (!/\.?qy\.net\//i.test(canonical) || !tvid) {
      webpage =
        (await this._download_webpage(canonical, 'temp_id', 'Downloading iqiyi video page', {
          headers: IQ_HEADERS,
          fatal: false,
        })) || '';

      if (!tvid) {
        tvid = this._search_regex(
          /data-(?:player|shareplattrigger)-tvid\s*=\s*['"](\d+)/,
          webpage,
          'tvid',
          null,
          false,
        );
      }
      videoId = this._search_regex(
        /data-(?:player|shareplattrigger)-videoid\s*=\s*['"]([a-f\d]+)/,
        webpage,
        'video_id',
        null,
        false,
      );
    }

    if (!tvid) {
      tvid = await this.tvidFromAccelerator(canonical, 'iqiyi');
    }

    if (!tvid) {
      const playlist = webpage ? await this.extractPlaylist(webpage) : null;
      if (playlist) return playlist;
      throw new ExtractorError("Can't find any iqiyi video", { expected: true });
    }

    let formats: Format[] = [];
    if (videoId) {
      try {
        formats = await this.extractTmtsFormats(tvid, videoId);
      } catch {
        formats = [];
      }
    }
    if (!formats.length) {
      formats = await this.extractDashFormats(tvid);
    }

    if (!formats.length) {
      throw new ExtractorError('No iqiyi formats found', { expected: true });
    }

    const cover = await this.fetchCoverTitle(tvid);
    const title =
      cover.title ||
      this._html_search_regex(/id="widget-videotitle"[^>]*>([^<]+)/, webpage, 'title', null, false) ||
      this._html_search_regex(/class="mod-play-tit"[^>]*>([^<]+)/, webpage, 'title', null, false) ||
      this._html_search_regex(
        /<span[^>]+data-videochanged-title="word"[^>]*>([^<]+)<\/span>/,
        webpage,
        'title',
        null,
        false,
      ) ||
      this._og_search_title(webpage) ||
      tvid;

    return {
      id: videoId || tvid,
      title: title || tvid,
      thumbnail: cover.thumbnail,
      formats,
      webpage_url: canonical,
      original_url: url,
      extractor: 'iqiyi',
      extractor_key: 'Iqiyi',
      http_headers: IQ_HEADERS,
    };
  }
}
