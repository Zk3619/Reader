/**
 * BrightcoveNewIE / BrightcoveLegacyIE — aligned with yt-dlp brightcove.py
 * (playback API + policy key; legacy federated viewer; embed URL parsing).
 */

import { InfoExtractor, ExtractorError } from '../common';
import type { Format, VideoInfo } from '../types';

const NEW_VALID_URL =
  /https?:\/\/players\.brightcove\.net\/(?<account_id>\d+)\/(?<player_id>[^/]+)_(?<embed>[^/]+)\/index\.html\?.*(?<content_type>video|playlist)Id=(?<video_id>\d+|ref:[^&]+)/i;

const LEGACY_VALID_URL =
  /(?:https?:\/\/.*brightcove\.com\/(?:services|viewer).*?\?|brightcove:)(?<query>.*)/i;

function intOrNone(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function floatOrNone(v: unknown, scale = 1): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n / scale : null;
}

function parseQuery(qs: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of qs.replace(/^[?]/, '').split('&')) {
    if (!part) continue;
    const [k, ...rest] = part.split('=');
    if (!k) continue;
    out[decodeURIComponent(k)] = decodeURIComponent(rest.join('=').replace(/\+/g, ' '));
  }
  return out;
}

function mimetypeExt(type: unknown): string {
  const t = String(type || '').toLowerCase();
  if (t.includes('mpegurl') || t.includes('m3u8')) return 'm3u8';
  if (t.includes('dash')) return 'mpd';
  if (t.includes('mp4')) return 'mp4';
  return 'mp4';
}

export function extractBrightcoveEmbedUrls(webpage: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  const add = (raw: string) => {
    let u = raw.trim();
    if (u.startsWith('//')) u = `https:${u}`;
    if (!/^https?:\/\/players\.brightcove\.net\//i.test(u)) return;
    if (seen.has(u)) return;
    seen.add(u);
    urls.push(u);
  };

  for (const m of webpage.matchAll(
    /<iframe[^>]+src=(["'])((?:https?:)?\/\/players\.brightcove\.net\/\d+\/[^/]+\/index\.html.+?)\1/gi,
  )) {
    add(m[2]!);
  }

  for (const m of webpage.matchAll(
    /(<video(?:-js)?\s+[^>]*\bdata-video-id\s*=\s*['"]?[^>]+>)[\s\S]*?(?:<script[^>]+src=(["'])(?:https?:)?\/\/players\.brightcove\.net\/(\d+)\/([^/]+)_([^/]+)\/index(?:\.min)?\.js)/gi,
  )) {
    const videoTag = m[1]!;
    const accountId = m[3]!;
    const playerId = m[4]!;
    const embed = m[5]!;
    const vidMatch =
      /data-video-id\s*=\s*(["'])([^"']+)\1/i.exec(videoTag) ||
      /data-video-id\s*=\s*([^\s>]+)/i.exec(videoTag);
    const videoId = vidMatch?.[2] || vidMatch?.[1];
    if (videoId) {
      add(
        `https://players.brightcove.net/${accountId}/${playerId}_${embed}/index.html?videoId=${encodeURIComponent(videoId)}`,
      );
    }
  }

  for (const m of webpage.matchAll(
    /(["'])(https?:\/\/players\.brightcove\.net\/\d+\/[^"']+\/index\.html[^"']*)\1/gi,
  )) {
    add(m[2]!);
  }

  return urls;
}

abstract class BrightcoveBaseIE extends InfoExtractor {
  protected async parseBrightcoveMetadata(
    jsonData: Record<string, unknown>,
    videoId: string,
    headers: Record<string, string>,
  ): Promise<VideoInfo> {
    const formats: Format[] = [];
    const hdrs = { ...headers };
    delete hdrs.Authorization;

    for (const source of (jsonData.sources as Record<string, unknown>[]) || []) {
      const container = String(source.container || '');
      const ext = mimetypeExt(source.type);
      const src = String(source.src || source.streaming_src || '');
      if (!src && !source.stream_name) continue;

      if (ext === 'm3u8' || container === 'M2TS') {
        formats.push(
          ...(await this._extract_m3u8_formats(src, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false, {
            headers: hdrs,
          })),
        );
        continue;
      }
      if (ext === 'mpd') {
        formats.push(...(await this._extract_mpd_formats(src, videoId, 'dash', undefined, false, { headers: hdrs })));
        continue;
      }

      const tbr = floatOrNone(source.avg_bitrate, 1000);
      const height = intOrNone(source.height);
      const width = intOrNone(source.width);
      const f: Format = {
        url: src,
        format_id: `http${tbr ? `-${Math.trunc(tbr)}k` : ''}${height ? `-${height}p` : ''}`,
        ext: ext || container.toLowerCase() || 'mp4',
        protocol: 'https',
        tbr: tbr != null ? Math.trunc(tbr) : null,
        width,
        height,
        filesize: intOrNone(source.size),
        vcodec: width === 0 && height === 0 ? 'none' : String(source.codec || 'unknown'),
        http_headers: hdrs,
      };
      if (container === 'WVM' || source.key_systems) f.has_drm = true;
      formats.push(f);
    }

    if (!formats.length) {
      const errors = jsonData.errors as Record<string, unknown>[] | undefined;
      const err = errors?.[0];
      const msg = String(err?.message || err?.error_subcode || err?.error_code || 'No formats');
      this.raise_no_formats(msg, true);
    }

    for (const f of formats) {
      f.http_headers = { ...(f.http_headers || {}), ...hdrs };
    }

    const duration = floatOrNone(jsonData.duration, 1000);
    const thumbBase = String(jsonData.poster || jsonData.thumbnail || '') || undefined;

    return {
      id: videoId,
      title: String(jsonData.name || videoId).replace(/<[^>]+>/g, ''),
      description: String(jsonData.description || '').replace(/<[^>]+>/g, '') || undefined,
      thumbnail: thumbBase,
      duration: duration != null && duration > 0 ? duration : null,
      timestamp: jsonData.published_at ? Date.parse(String(jsonData.published_at)) / 1000 : null,
      uploader_id: jsonData.account_id != null ? String(jsonData.account_id) : undefined,
      tags: Array.isArray(jsonData.tags) ? (jsonData.tags as unknown[]).map(String) : undefined,
      formats: this._sort_formats(formats),
      extractor: this.IE_NAME,
      extractor_key: this.ie_key,
      http_headers: hdrs,
    };
  }
}

export class BrightcoveNewIE extends BrightcoveBaseIE {
  static IE_NAME = 'brightcove:new';
  static IE_DESC = 'Brightcove New Player';
  static _VALID_URL = NEW_VALID_URL;
  static _TESTS = [
    {
      url: 'http://players.brightcove.net/929656772001/e41d32dc-ec74-459e-a845-6c69f7b724ea_default/index.html?videoId=4463358922001',
      only_matching: true,
    },
    {
      url: 'https://players.brightcove.net/1752604059001/S13cJdUBz_default/index.html?playlistId=5718313430001',
      only_matching: true,
    },
  ];

  private policyKeyCache = new Map<string, string | null>();

  private async extractPolicyKey(
    accountId: string,
    playerId: string,
    embed: string,
    videoId: string,
  ): Promise<string | null> {
    const cacheKey = `${accountId}_${playerId}`;
    if (this.policyKeyCache.has(cacheKey)) return this.policyKeyCache.get(cacheKey) ?? null;

    const base = `https://players.brightcove.net/${accountId}/${playerId}_${embed}/`;
    const config = await this._download_json<Record<string, unknown>>(
      `${base}config.json`,
      videoId,
      'Downloading Brightcove config',
      { fatal: false },
    );
    let policyKey =
      (config?.video_cloud as Record<string, unknown> | undefined)?.policy_key != null
        ? String((config!.video_cloud as Record<string, unknown>).policy_key)
        : null;

    if (!policyKey) {
      const js = await this._download_webpage(`${base}index.min.js`, videoId, 'Downloading Brightcove player JS', {
        fatal: false,
      });
      policyKey =
        this._search_regex(/policyKey\s*:\s*(["'])(?<pk>.+?)\1/, js, 'policy key', null, false, 'pk') ||
        (() => {
          const catalog = this._search_regex(/catalog\(({.+?})\);/, js, 'catalog', null, false);
          if (!catalog) return null;
          const parsed = this._parse_json<Record<string, unknown>>(catalog, videoId, null, false);
          return parsed?.policyKey ? String(parsed.policyKey) : null;
        })();
    }

    this.policyKeyCache.set(cacheKey, policyKey);
    return policyKey;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = url.match(NEW_VALID_URL);
    if (!m?.groups) throw new ExtractorError('Invalid Brightcove URL', { expected: true });
    const { account_id: accountId, player_id: playerId, embed, content_type: contentType, video_id: videoId } =
      m.groups;

    let policyKey: string | null = null;
    let policyKeyExtracted = false;
    const apiBase = `https://edge.api.brightcove.com/playback/v1/accounts/${accountId}/${contentType}s/${videoId}`;
    const headers: Record<string, string> = {};

    for (let attempt = 0; attempt < 2; attempt++) {
      if (!policyKey) {
        policyKey = await this.extractPolicyKey(accountId, playerId, embed, videoId);
        policyKeyExtracted = true;
      }
      if (policyKey) headers.Accept = `application/json;pk=${policyKey}`;

      try {
        const jsonData = await this._download_json<Record<string, unknown>>(apiBase, videoId, 'Downloading Brightcove API', {
          headers,
        });

        if (contentType === 'playlist') {
          const videos = ((jsonData.videos as Record<string, unknown>[]) || []).filter((v) => v.id);
          const entries: VideoInfo[] = [];
          for (const vid of videos) {
            entries.push(await this.parseBrightcoveMetadata(vid, String(vid.id), headers));
          }
          return this.playlist_result(entries, String(jsonData.id || videoId), String(jsonData.name || videoId));
        }

        return {
          ...(await this.parseBrightcoveMetadata(jsonData, videoId, headers)),
          webpage_url: url,
          original_url: url,
        };
      } catch (e) {
        const msg = (e as Error).message || '';
        if (/INVALID_POLICY_KEY/i.test(msg) && !policyKeyExtracted) {
          policyKey = null;
          continue;
        }
        throw e;
      }
    }

    throw new ExtractorError('Unable to extract Brightcove video', { expected: true });
  }
}

export class BrightcoveLegacyIE extends BrightcoveBaseIE {
  static IE_NAME = 'brightcove:legacy';
  static IE_DESC = 'Brightcove Legacy Player';
  static _VALID_URL = LEGACY_VALID_URL;

  async _real_extract(url: string): Promise<VideoInfo> {
    const raw = url.startsWith('brightcove:') ? url.slice('brightcove:'.length) : url.split('?')[1] || url;
    const params = parseQuery(raw.includes('?') ? raw.split('?').pop()! : raw);

    const videoId =
      params['@videoPlayer'] ||
      params.videoPlayer ||
      params.videoID ||
      params.bctid ||
      params.videoId;
    const playerId = params.playerID || params.bcpid;
    const playerKey = params.playerKey || params.bckey;

    if (!videoId) throw new ExtractorError('Unable to extract Brightcove legacy video id', { expected: true });

    const refMatch = /^ref:(.+)$/i.exec(videoId);
    const resolvedId = refMatch ? refMatch[1]! : videoId;

    // Try redirect to new player when account/player ids are known
    if (playerId && /^\d+$/.test(String(playerId))) {
      const accountId = String(playerId);
      const newUrl = `https://players.brightcove.net/${accountId}/default_default/index.html?videoId=${encodeURIComponent(resolvedId)}`;
      return this.url_result(newUrl, 'BrightcoveNew', resolvedId);
    }

    if (!playerKey) {
      throw new ExtractorError('Brightcove legacy playerKey missing', { expected: true });
    }

    const apiUrl = `https://c.brightcove.com/services/json/player/readonly?playerKey=${encodeURIComponent(playerKey)}&videoId=${encodeURIComponent(resolvedId)}&template=template.js`;
    const data = await this._download_json<Record<string, unknown>>(apiUrl, resolvedId, 'Downloading legacy player JSON', {
      fatal: false,
    });

    const video = (data?.video as Record<string, unknown>) || data;
    const sources = (video?.sources as Record<string, unknown>[]) || (video?.renditions as Record<string, unknown>[]) || [];
    const formats: Format[] = [];
    for (const [i, src] of sources.entries()) {
      const u = String(src.src || src.url || '');
      if (!u) continue;
      formats.push({
        format_id: String(src.encodingRate || src.frameWidth || i),
        url: u,
        ext: mimetypeExt(src.type) || 'mp4',
        protocol: 'https',
        width: intOrNone(src.frameWidth),
        height: intOrNone(src.frameHeight),
        tbr: intOrNone(src.encodingRate),
      });
    }

    if (!formats.length) {
      // Last resort: smuggle into new IE via linkBaseURL embed discovery
      throw new ExtractorError('No Brightcove legacy formats', { expected: true });
    }

    return {
      id: resolvedId,
      title: String(video?.displayName || video?.name || resolvedId),
      description: String(video?.shortDescription || video?.description || '') || undefined,
      thumbnail: String(video?.thumbnailURL || video?.thumbnail || '') || undefined,
      duration: floatOrNone(video?.length, 1000),
      formats: this._sort_formats(formats),
      webpage_url: url,
      original_url: url,
      extractor: 'brightcove:legacy',
      extractor_key: 'BrightcoveLegacy',
    };
  }
}
