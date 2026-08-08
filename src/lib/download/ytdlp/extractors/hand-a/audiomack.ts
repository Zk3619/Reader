/**
 * AudiomackIE / AudiomackAlbumIE
 *
 * 旧站 `/api/music/url/...` 已失效（见 yt-dlp#4327）。
 * 改走官方 Data API `https://api.audiomack.com/v1`，用网页端 OAuth1 凭证签名
 *（consumer: audiomack-js，与站点前端一致）。
 *
 * 参考：https://audiomack.com/data-api/docs 、yt-dlp#4327 / PR#17258
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { SoundcloudIE } from '../sites';

const API_BASE = 'https://api.audiomack.com/v1';
/** Hardcoded in Audiomack web client (public). */
const CONSUMER_KEY = 'audiomack-js';
const CONSUMER_SECRET = 'f3ac5b086f3eab260520d8e3049561e6';

function oauthPercentEncode(value: string): string {
  return encodeURIComponent(value).replace(/%[0-9a-f]{2}/gi, (m) => m.toUpperCase());
}

function randomNonce(length = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) out += chars[bytes[i]! % chars.length];
  return out;
}

async function hmacSha1Base64(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data));
  const bytes = new Uint8Array(sig);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Build OAuth 1.0a (consumer-only) signed URL for GET/POST. */
export async function signAudiomackUrl(
  method: string,
  url: string,
  extraParams: Record<string, string> = {},
): Promise<string> {
  const parsed = new URL(url);
  const baseUrl = `${parsed.origin}${parsed.pathname}`;
  const params: Record<string, string> = {
    oauth_consumer_key: CONSUMER_KEY,
    oauth_nonce: randomNonce(32),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_version: '1.0',
  };
  for (const [k, v] of parsed.searchParams.entries()) params[k] = v;
  Object.assign(params, extraParams);

  const paramString = Object.keys(params)
    .sort()
    .map((k) => `${oauthPercentEncode(k)}=${oauthPercentEncode(String(params[k]))}`)
    .join('&');
  const baseString = [
    method.toUpperCase(),
    oauthPercentEncode(baseUrl),
    oauthPercentEncode(paramString),
  ].join('&');
  const signingKey = `${oauthPercentEncode(CONSUMER_SECRET)}&`;
  params.oauth_signature = await hmacSha1Base64(signingKey, baseString);

  const query = Object.keys(params)
    .sort()
    .map((k) => `${oauthPercentEncode(k)}=${oauthPercentEncode(String(params[k]))}`)
    .join('&');
  return `${baseUrl}?${query}`;
}

/** Normalize matched id `artist/song/slug` or `artist/slug` → artist + slug. */
export function splitAudiomackTag(tag: string): { artist: string; slug: string } {
  const parts = String(tag || '')
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return { artist: parts[0]!, slug: parts[parts.length - 1]! };
  }
  throw new ExtractorError(`Unable to parse Audiomack path: ${tag}`, { expected: true });
}

function ownStreamUrl(rec: Record<string, unknown>): string | null {
  for (const key of ['streaming_url', 'url', 'signedUrl', 'signed_url', 'play_url', 'stream_url']) {
    const v = rec[key];
    if (typeof v === 'string' && /^https?:\/\//i.test(v)) return v;
  }
  return null;
}

function pickStreamUrl(payload: unknown): string | null {
  if (typeof payload === 'string') {
    const s = payload.trim().replace(/^"|"$/g, '');
    if (/^https?:\/\//i.test(s)) return s;
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  const rec = payload as Record<string, unknown>;
  const own = ownStreamUrl(rec);
  if (own) return own;
  for (const key of ['data', 'result', 'results']) {
    if (rec[key] != null) {
      const nested = pickStreamUrl(rec[key]);
      if (nested) return nested;
    }
  }
  return null;
}

function pickTrackId(track: Record<string, unknown>): string {
  for (const key of ['id', 'song_id', 'music_id', 'track_id', 'musicId', 'songId']) {
    const v = track[key];
    if (v != null && String(v).trim() && String(v) !== '0') return String(v);
  }
  return '';
}

function looksLikeMusicEntity(obj: Record<string, unknown>): boolean {
  if (pickTrackId(obj)) return true;
  if (ownStreamUrl(obj)) return true;
  if (obj.title != null && (obj.url_slug != null || obj.type === 'song' || obj.type === 'album')) {
    return true;
  }
  return false;
}

/** API 常把实体包在 results / data 里；展开为歌曲/专辑对象。 */
export function unwrapAudiomackEntity(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') return null;
  const rec = payload as Record<string, unknown>;

  for (const key of ['results', 'data', 'result', 'song', 'music', 'album', 'item']) {
    const v = rec[key];
    if (!v) continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        const hit = unwrapAudiomackEntity(item);
        if (hit) return hit;
      }
      continue;
    }
    if (typeof v === 'object') {
      const hit = unwrapAudiomackEntity(v);
      if (hit) return hit;
    }
  }

  if (looksLikeMusicEntity(rec)) return rec;
  return null;
}

function asTrackList(meta: Record<string, unknown>): Record<string, unknown>[] {
  for (const key of ['tracks', 'songs', 'results']) {
    const v = meta[key];
    if (Array.isArray(v)) {
      return v
        .map((x) => unwrapAudiomackEntity(x))
        .filter((x): x is Record<string, unknown> => !!x);
    }
  }
  return [];
}

function artistName(track: Record<string, unknown>): string | undefined {
  const a = track.artist;
  if (typeof a === 'string' && a.trim()) return a;
  if (a && typeof a === 'object') {
    const name = (a as Record<string, unknown>).name ?? (a as Record<string, unknown>).url_slug;
    if (name != null) return String(name);
  }
  const u = track.uploader;
  if (typeof u === 'string' && u.trim()) return u;
  if (u && typeof u === 'object') {
    const name = (u as Record<string, unknown>).name ?? (u as Record<string, unknown>).url_slug;
    if (name != null) return String(name);
  }
  return undefined;
}

/** 从歌曲页 HTML / __NEXT_DATA__ 里抠出曲目对象或数字 id。 */
export function extractAudiomackTrackFromWebpage(webpage: string): Record<string, unknown> | null {
  if (!webpage) return null;

  const next = webpage.match(
    /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i,
  );
  if (next?.[1]) {
    try {
      const data = JSON.parse(next[1]) as unknown;
      const hit = unwrapAudiomackEntity(data);
      if (hit && (pickTrackId(hit) || pickStreamUrl(hit))) return hit;
      // 深搜带数字 id + title 的节点
      const deep = findSongNode(data, 0);
      if (deep) return deep;
    } catch {
      /* continue */
    }
  }

  const play = webpage.match(/\/music\/play\/(\d{3,})/);
  if (play?.[1]) return { id: play[1] };

  const idTitle = webpage.match(
    /"id"\s*:\s*"?(\d{3,})"?\s*,\s*"title"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/,
  );
  if (idTitle) return { id: idTitle[1], title: idTitle[2]?.replace(/\\"/g, '"') };

  return null;
}

function findSongNode(obj: unknown, depth: number): Record<string, unknown> | null {
  if (!obj || depth > 14) return null;
  if (typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const hit = findSongNode(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  const rec = obj as Record<string, unknown>;
  const id = pickTrackId(rec);
  if (id && (rec.title != null || rec.url_slug != null || rec.type === 'song')) {
    return rec;
  }
  for (const v of Object.values(rec)) {
    const hit = findSongNode(v, depth + 1);
    if (hit) return hit;
  }
  return null;
}

abstract class AudiomackBaseIE extends InfoExtractor {
  protected async apiJson(
    path: string,
    videoId: string,
    opts?: { method?: string; extraParams?: Record<string, string>; note?: string },
  ): Promise<unknown> {
    const method = (opts?.method || 'GET').toUpperCase();
    const unsigned = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
    const signed = await signAudiomackUrl(method, unsigned, opts?.extraParams || {});
    const headers = {
      Accept: 'application/json, text/plain, */*',
      Referer: 'https://audiomack.com/',
      Origin: 'https://audiomack.com',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    };
    if (opts?.note) this.to_screen(`${videoId}: ${opts.note}`);
    const text = await this._httpGetText(signed, headers, {
      method,
      body: method !== 'GET' ? '' : undefined,
    });
    const trimmed = String(text || '').trim();
    if (!trimmed) return {};
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      // /play 偶发直接返回裸 URL
      if (/^https?:\/\//i.test(trimmed)) return trimmed;
      throw new ExtractorError(`Unable to parse Audiomack JSON (${videoId})`, { expected: true });
    }
  }

  protected async resolveStreamUrl(
    track: Record<string, unknown>,
    videoId: string,
    section: string,
  ): Promise<string> {
    const entity = unwrapAudiomackEntity(track) || track;
    const direct = pickStreamUrl(entity);
    if (direct) return direct;

    const id = pickTrackId(entity);
    if (!id) {
      throw new ExtractorError(
        `Audiomack track missing id/stream (keys=${Object.keys(entity).slice(0, 12).join(',') || 'none'})`,
        { expected: true },
      );
    }

    // Web client: GET /v1/music/play/:id?section=...
    try {
      const play = await this.apiJson(`/music/play/${id}`, videoId, {
        extraParams: { section },
        note: 'Downloading Audiomack play URL',
      });
      const url = pickStreamUrl(play);
      if (url) return url;
    } catch (e) {
      this.report_warning(`Audiomack play GET failed: ${(e as Error).message || e}`);
    }

    // Docs: POST /v1/music/:id/play
    const playPost = await this.apiJson(`/music/${id}/play`, videoId, {
      method: 'POST',
      extraParams: { section },
      note: 'Downloading Audiomack play URL (POST)',
    });
    const url = pickStreamUrl(playPost);
    if (!url) throw new ExtractorError('Audiomack returned no streaming URL', { expected: true });
    return url;
  }

  protected buildAudioInfo(
    track: Record<string, unknown>,
    streamUrl: string,
    webpageUrl: string,
  ): VideoInfo {
    if (SoundcloudIE.suitable(streamUrl)) {
      return this.url_result(streamUrl, 'Soundcloud') as unknown as VideoInfo;
    }

    const entity = unwrapAudiomackEntity(track) || track;
    const title = entity.title != null ? String(entity.title) : undefined;
    const artist = artistName(entity);
    const id = pickTrackId(entity) || title || 'audiomack';
    const ext = /\.m4a(\?|$)/i.test(streamUrl) ? 'm4a' : 'mp3';
    const headers = {
      Referer: 'https://audiomack.com/',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    };
    const formats: Format[] = [
      {
        format_id: 'streaming',
        url: streamUrl,
        ext,
        vcodec: 'none',
        acodec: ext === 'm4a' ? 'aac' : 'mp3',
        http_headers: headers,
      },
    ];

    const image =
      (typeof entity.image === 'string' && entity.image) ||
      (entity.uploader &&
      typeof entity.uploader === 'object' &&
      typeof (entity.uploader as Record<string, unknown>).image === 'string'
        ? String((entity.uploader as Record<string, unknown>).image)
        : undefined);

    return {
      id: String(id),
      title: title || String(id),
      uploader: artist,
      thumbnail: image || undefined,
      url: streamUrl,
      formats,
      webpage_url: webpageUrl,
      original_url: webpageUrl,
      extractor: 'audiomack',
      extractor_key: 'Audiomack',
      http_headers: headers,
    };
  }

  protected async loadSongMeta(
    artist: string,
    slug: string,
    tag: string,
    pageUrl: string,
  ): Promise<Record<string, unknown>> {
    let raw: unknown;
    try {
      raw = await this.apiJson(`/music/song/${artist}/${slug}`, tag, {
        note: 'Downloading song metadata',
      });
    } catch (e) {
      this.report_warning(`Audiomack song API failed: ${(e as Error).message || e}`);
      raw = null;
    }

    let meta = unwrapAudiomackEntity(raw);
    if (meta && (pickTrackId(meta) || pickStreamUrl(meta))) return meta;

    // 回退：抓页面 __NEXT_DATA__ / play id
    try {
      const modernUrl = `https://audiomack.com/${artist}/song/${slug}`;
      const webpage = await this._download_webpage(
        modernUrl,
        tag,
        'Downloading Audiomack webpage',
        { fatal: false, headers: { Referer: 'https://audiomack.com/' } },
      );
      const fromPage = webpage ? extractAudiomackTrackFromWebpage(webpage) : null;
      if (fromPage && (pickTrackId(fromPage) || pickStreamUrl(fromPage))) {
        return { ...(meta || {}), ...fromPage };
      }
    } catch (e) {
      this.report_warning(`Audiomack webpage fallback failed: ${(e as Error).message || e}`);
    }

    // 再试旧版路径页面
    try {
      const webpage = await this._download_webpage(
        pageUrl.replace(/^http:/i, 'https:'),
        tag,
        'Downloading Audiomack webpage (legacy path)',
        { fatal: false, headers: { Referer: 'https://audiomack.com/' } },
      );
      const fromPage = webpage ? extractAudiomackTrackFromWebpage(webpage) : null;
      if (fromPage && (pickTrackId(fromPage) || pickStreamUrl(fromPage))) {
        return { ...(meta || {}), ...fromPage };
      }
    } catch {
      /* ignore */
    }

    if (meta) return meta;
    throw new ExtractorError(
      `Invalid url ${pageUrl}` +
        (raw && typeof raw === 'object'
          ? ` (api keys=${Object.keys(raw as object).slice(0, 8).join(',')})`
          : ''),
      { expected: true },
    );
  }
}

export class AudiomackIE extends AudiomackBaseIE {
  static IE_NAME = 'audiomack';
  static IE_DESC = 'Audiomack';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?audiomack\.com\/(?:song\/|(?=.+\/song\/))(?<id>[\w/-]+)/;
  static _TESTS = [
    {
      url: 'http://www.audiomack.com/song/roosh-williams/extraordinary',
      only_matching: true,
    },
    {
      url: 'https://audiomack.com/roosh-williams/song/extraordinary',
      only_matching: true,
    },
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    const albumUrlTag = this._match_id(url).replace('/song/', '/');
    const { artist, slug } = splitAudiomackTag(albumUrlTag);

    const meta = await this.loadSongMeta(artist, slug, albumUrlTag, url);
    const streamUrl = await this.resolveStreamUrl(meta, albumUrlTag, 'Song Page');
    return this.buildAudioInfo(meta, streamUrl, url);
  }
}

export class AudiomackAlbumIE extends AudiomackBaseIE {
  static IE_NAME = 'audiomack:album';
  static IE_DESC = 'Audiomack albums';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?audiomack\.com\/(?:album\/|(?=.+\/album\/))(?<id>[\w/-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const albumUrlTag = this._match_id(url).replace('/album/', '/');
    const { artist, slug } = splitAudiomackTag(albumUrlTag);

    const raw = await this.apiJson(`/music/album/${artist}/${slug}`, albumUrlTag, {
      note: 'Downloading album metadata',
    });
    const meta = unwrapAudiomackEntity(raw);
    if (!meta || (meta.error && !asTrackList(meta).length)) {
      throw new ExtractorError(`Invalid album url ${url}`, { expected: true });
    }

    const tracks = asTrackList(meta);
    if (!tracks.length) {
      throw new ExtractorError('Audiomack album has no tracks', { expected: true });
    }

    const entries: VideoInfo[] = [];
    for (const track of tracks) {
      try {
        const streamUrl = await this.resolveStreamUrl(track, albumUrlTag, 'Album Page');
        const info = this.buildAudioInfo(track, streamUrl, url);
        entries.push(info);
      } catch (e) {
        this.report_warning(`Skip track ${pickTrackId(track) || '?'}: ${(e as Error).message || e}`);
      }
    }

    if (!entries.length) {
      throw new ExtractorError('No playable Audiomack album tracks', { expected: true });
    }

    return {
      _type: 'playlist',
      id: String(meta.id || albumUrlTag),
      title: meta.title != null ? String(meta.title) : albumUrlTag,
      entries,
      webpage_url: url,
      original_url: url,
      extractor: 'audiomack:album',
      extractor_key: 'AudiomackAlbum',
    };
  }
}
