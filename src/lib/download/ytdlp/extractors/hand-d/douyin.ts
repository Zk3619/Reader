/**
 * DouyinIE — aligned with yt-dlp DouyinIE, plus share-page fallback.
 *
 * www.douyin.com/aweme/v1/web/aweme/detail/ 在无有效浏览器 Cookie / a_bogus 时常返回空 body。
 * 分享回流页（iesdouyin / m.douyin share/video）会内嵌 window._ROUTER_DATA，无需签名即可解析。
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { downloadBinaryProxyArgs } from '@/lib/http/download-binary-proxy';
import { splitSetCookieHeader } from '@/lib/http/cookie-jar';
import { resolveYtdlpProxy } from '../../networking/socks';

const DOUYIN_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';

function randomMsToken(length = 107): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  const bytes = new Uint8Array(length);
  (globalThis.crypto || (globalThis as { crypto?: Crypto }).crypto)?.getRandomValues?.(bytes);
  for (let i = 0; i < length; i++) {
    const b = bytes[i] ?? Math.floor(Math.random() * 256);
    out += chars[b % chars.length];
  }
  return out;
}

function randomVerifyFp(): string {
  const seg = () => Math.random().toString(36).slice(2, 10);
  return `verify_${seg()}_${seg()}_${seg()}_${seg()}_${seg()}`;
}

/** Anti-bot JS shell without embedded media JSON. */
function looksLikeDouyinShell(text: string): boolean {
  if (!text) return false;
  if (/_ROUTER_DATA|RENDER_DATA|UNIVERSAL_DATA_FOR_REHYDRATION|videoInfoRes|aweme_detail/i.test(text)) {
    return false;
  }
  return /_\$jsvmprt|Please wait\.\.\./i.test(text);
}

function expandMediaUrls(u: string): string[] {
  const urls = [u];
  if (/\/playwm\//i.test(u)) {
    urls.unshift(u.replace(/\/playwm\//i, '/play/'));
  }
  return urls;
}

function parseAwemeFormats(
  detail: Record<string, unknown>,
  headers: Record<string, string>,
): Format[] {
  const video = (detail.video || {}) as Record<string, unknown>;
  const formats: Format[] = [];
  const seen = new Set<string>();

  const pushAddr = (
    addr: Record<string, unknown> | undefined,
    meta: Partial<Format> & { format_id: string },
  ) => {
    if (!addr) return;
    const list = addr.url_list;
    const urls = Array.isArray(list)
      ? list.map(String)
      : typeof list === 'string'
        ? [list]
        : [];
    for (const raw of urls) {
      if (!raw) continue;
      for (const u of expandMediaUrls(raw)) {
        if (seen.has(u)) continue;
        seen.add(u);
        const noWm = /\/play\//i.test(u) && !/\/playwm\//i.test(u);
        formats.push({
          url: u,
          ext: 'mp4',
          protocol: 'https',
          acodec: 'aac',
          filesize: Number(addr.data_size) || null,
          width: Number(addr.width || meta.width) || null,
          height: Number(addr.height || meta.height) || null,
          preference: noWm ? 1 : 0,
          http_headers: headers,
          ...meta,
          format_id: noWm && meta.format_id === 'play_addr' ? 'play_addr_no_wm' : meta.format_id,
          format_note: noWm
            ? String(meta.format_note || 'Direct video').replace(/watermarked/i, '').trim() ||
              'Direct video'
            : meta.format_note,
        });
      }
    }
  };

  const width = Number(video.width) || null;
  const height = Number(video.height) || null;
  const isH265 = Boolean(video.is_bytevc1 || video.is_h265);

  pushAddr(video.play_addr as Record<string, unknown> | undefined, {
    format_id: 'play_addr',
    format_note: 'Direct video',
    vcodec: isH265 ? 'h265' : 'h264',
    width,
    height,
  });
  pushAddr(video.download_addr as Record<string, unknown> | undefined, {
    format_id: 'download_addr',
    format_note: video.has_watermark ? 'Download video, watermarked' : 'Download video',
    vcodec: 'h264',
    width: Number((video.download_addr as Record<string, unknown>)?.width) || width,
    height,
  });
  pushAddr(video.play_addr_h264 as Record<string, unknown> | undefined, {
    format_id: 'play_addr_h264',
    format_note: 'Direct video',
    vcodec: 'h264',
  });
  pushAddr(video.play_addr_bytevc1 as Record<string, unknown> | undefined, {
    format_id: 'play_addr_bytevc1',
    format_note: 'Direct video',
    vcodec: 'h265',
  });

  for (const b of (video.bit_rate as Record<string, unknown>[]) || []) {
    const brH265 = Boolean(b.is_bytevc1 || b.is_h265);
    pushAddr(b.play_addr as Record<string, unknown> | undefined, {
      format_id: String(b.gear_name || `br-${formats.length}`),
      format_note: 'Playback video',
      vcodec: brH265 ? 'h265' : 'h264',
      tbr: b.bit_rate != null ? Number(b.bit_rate) / 1000 : null,
      fps: Number(b.FPS || b.fps) || null,
    });
  }

  if (!formats.length) {
    const music = (detail.music || {}) as Record<string, unknown>;
    const musicList = (music.play_url as Record<string, unknown>)?.url_list;
    const mu =
      (Array.isArray(musicList) && String(musicList[0] || '')) ||
      (typeof music.playUrl === 'string' ? music.playUrl : '');
    if (mu.startsWith('http')) {
      formats.push({
        format_id: 'music',
        url: mu,
        ext: 'mp3',
        protocol: 'https',
        vcodec: 'none',
        acodec: 'mp3',
        format_note: 'Music track',
        http_headers: headers,
      });
    }
  }

  return formats;
}

function findAwemeDetail(obj: unknown, depth = 0): Record<string, unknown> | null {
  if (!obj || depth > 12) return null;
  if (typeof obj !== 'object') return null;
  const rec = obj as Record<string, unknown>;
  if (rec.aweme_detail && typeof rec.aweme_detail === 'object') {
    return rec.aweme_detail as Record<string, unknown>;
  }
  if (Array.isArray(rec.item_list) && rec.item_list[0] && typeof rec.item_list[0] === 'object') {
    return rec.item_list[0] as Record<string, unknown>;
  }
  if (rec.videoInfoRes && typeof rec.videoInfoRes === 'object') {
    const hit = findAwemeDetail(rec.videoInfoRes, depth + 1);
    if (hit) return hit;
  }
  if ((rec.awemeId || rec.aweme_id) && rec.video) return rec;
  for (const v of Object.values(rec)) {
    const hit = findAwemeDetail(v, depth + 1);
    if (hit) return hit;
  }
  return null;
}

/** Exported for unit tests. */
export function extractDouyinDetail(webpage: string): Record<string, unknown> | null {
  if (!webpage) return null;

  const router = webpage.match(/window\._ROUTER_DATA\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/i);
  if (router?.[1]) {
    try {
      const data = JSON.parse(router[1]) as Record<string, unknown>;
      const detail = findAwemeDetail(data);
      if (detail?.video || detail?.aweme_id) return detail;
    } catch {
      /* continue */
    }
  }

  const patterns = [
    /<script[^>]*id="RENDER_DATA"[^>]*>([^<]+)<\/script>/i,
    /<script[^>]*id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([^<]+)<\/script>/i,
    /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/,
  ];
  for (const re of patterns) {
    const m = webpage.match(re);
    if (!m?.[1]) continue;
    try {
      let raw = m[1];
      if (/RENDER_DATA|UNIVERSAL_DATA/i.test(re.source)) {
        raw = decodeURIComponent(raw);
      }
      const data = JSON.parse(raw) as Record<string, unknown>;
      const detail = findAwemeDetail(data);
      if (detail?.video || detail?.aweme_id) return detail;
    } catch {
      /* continue */
    }
  }
  return null;
}

export class DouyinIE extends InfoExtractor {
  static IE_NAME = 'Douyin';
  static IE_DESC = '抖音';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?douyin\.com\/(?:video|note)\/(?<id>\d+)/i;
  static _WEBPAGE_HOST = 'https://www.douyin.com/';
  static _TESTS = [
    { url: 'https://www.douyin.com/video/6961737553342991651', only_matching: true },
  ];

  private async applySetCookieHeaders(
    responseUrl: string,
    headers: Record<string, string>,
  ): Promise<void> {
    const raw = headers['set-cookie'] || headers['Set-Cookie'] || '';
    if (!raw) return;
    const lines = splitSetCookieHeader(raw);
    for (const line of lines) {
      const first = line.split(';')[0] || '';
      const eq = first.indexOf('=');
      if (eq <= 0) continue;
      const name = first.slice(0, eq).trim();
      const value = first.slice(eq + 1).trim();
      if (!name) continue;
      const domainAttr = /(?:^|;\s*)domain=([^;]+)/i.exec(line)?.[1]?.trim();
      let domain = domainAttr || '.douyin.com';
      if (!domain.startsWith('.')) domain = `.${domain}`;
      if (/bytedance\.com|ixigua\.com/i.test(domain) && name === 'ttwid') {
        await this._set_cookie('.douyin.com', name, value, undefined, '/', true);
      }
      await this._set_cookie(domain, name, value, undefined, '/', true);
    }
    try {
      const { saveSetCookieLines } = await import('@/lib/http/cookie-jar');
      await saveSetCookieLines('https://www.douyin.com/', lines);
      await saveSetCookieLines(responseUrl, lines);
    } catch {
      /* ignore */
    }
  }

  private async rawFetch(
    url: string,
    opts?: {
      method?: string;
      body?: string;
      headers?: Record<string, string>;
      impersonate?: boolean | string;
    },
  ): Promise<{ text: string; status: number; url: string; headers: Record<string, string> }> {
    const headers = await this._buildHeaders(url, {
      'User-Agent': DOUYIN_UA,
      Referer: 'https://www.douyin.com/',
      ...(opts?.headers || {}),
    });
    const impersonate = opts?.impersonate ?? true;
    const method = opts?.method || (opts?.body ? 'POST' : 'GET');

    const tryAccept = async (
      text: string,
      status: number,
      responseUrl: string,
      respHeaders: Record<string, string>,
    ) => {
      if (status <= 0 || status >= 500) return null;
      if (looksLikeDouyinShell(text)) return null;
      await this.applySetCookieHeaders(responseUrl || url, respHeaders || {});
      return { text, status, url: responseUrl || url, headers: respHeaders || {} };
    };

    if (impersonate) {
      try {
        const { tryImpersonateFetch } = await import('../../networking/curl-impersonate');
        const ja3 = await tryImpersonateFetch(url, {
          method,
          headers,
          body: opts?.body ?? null,
          profile: typeof impersonate === 'string' ? impersonate : 'chrome',
          force: true,
        });
        if (ja3) {
          const ok = await tryAccept(ja3.body, ja3.status, url, ja3.headers || {});
          if (ok) return ok;
        }
      } catch {
        /* fall through */
      }
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<{
        data: number[];
        status: number;
        headers: Record<string, string>;
        url: string;
      }>('download_binary', {
        url,
        method,
        headers,
        body: opts?.body ?? null,
        timeoutMs: 45000,
        useOkhttpUserAgent: false,
        ...downloadBinaryProxyArgs({
          proxy: resolveYtdlpProxy(this.params.proxy as string | undefined),
        }),
      });
      const text = new TextDecoder().decode(new Uint8Array(result.data));
      const ok = await tryAccept(text, result.status, result.url || url, result.headers || {});
      if (ok) return ok;
      // Accept non-shell bodies even when empty (API empty JSON) so callers can react
      if (result.status > 0 && result.status < 500 && !looksLikeDouyinShell(text)) {
        await this.applySetCookieHeaders(result.url || url, result.headers || {});
        return {
          text,
          status: result.status,
          url: result.url || url,
          headers: result.headers || {},
        };
      }
    } catch {
      /* fall through */
    }

    const text = await this._httpGetText(url, headers, {
      method: opts?.method,
      body: opts?.body,
      impersonate: false,
    });
    if (looksLikeDouyinShell(text)) {
      throw new ExtractorError('Douyin returned anti-bot shell HTML', { expected: true });
    }
    return { text, status: 200, url, headers: {} };
  }

  private async ensureTtwid(): Promise<void> {
    if (this._get_cookies('https://www.douyin.com/').ttwid) return;
    const body = JSON.stringify({
      aid: 1768,
      union: true,
      needFid: false,
      region: 'cn',
      cbUrlProtocol: 'https',
      service: 'www.ixigua.com',
      migrate_info: { ticket: '', source: 'node' },
    });
    const reg = await this.rawFetch('https://ttwid.bytedance.com/ttwid/union/register/', {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json' },
      impersonate: true,
    });
    let ttwid = this._get_cookies('https://www.douyin.com/').ttwid;
    if (!ttwid) {
      try {
        const parsed = JSON.parse(reg.text || '{}') as { redirect_url?: string };
        if (parsed.redirect_url) {
          await this.rawFetch(parsed.redirect_url, { impersonate: true });
          ttwid = this._get_cookies('https://www.douyin.com/').ttwid;
        }
      } catch {
        /* ignore */
      }
    }
    const any =
      ttwid ||
      this._get_cookies('https://ttwid.bytedance.com/').ttwid ||
      this._get_cookies('https://www.ixigua.com/').ttwid;
    if (any) await this._set_cookie('.douyin.com', 'ttwid', any, undefined, '/', true);
  }

  private async bootstrapSession(pageUrl: string, videoId: string): Promise<void> {
    await this.ensureTtwid();
    const ms = randomMsToken();
    await this._set_cookie('.douyin.com', 'msToken', ms, undefined, '/', true);
    if (!this._get_cookies('https://www.douyin.com/').s_v_web_id) {
      await this._set_cookie('.douyin.com', 's_v_web_id', randomVerifyFp(), undefined, '/', true);
    }
    await this.rawFetch(pageUrl, {
      headers: { Accept: 'text/html,application/xhtml+xml' },
      impersonate: true,
    });
    this.to_screen(`${videoId}: Douyin session cookies ready`);
  }

  private buildDetailUrl(videoId: string): string {
    const params = new URLSearchParams({
      aweme_id: videoId,
      device_platform: 'webapp',
      aid: '6383',
      channel: 'channel_pc_web',
      pc_client_type: '1',
      version_code: '190500',
      version_name: '19.5.0',
      cookie_enabled: 'true',
      screen_width: '1920',
      screen_height: '1080',
      browser_language: 'zh-CN',
      browser_platform: 'Win32',
      browser_name: 'Chrome',
      browser_version: '131.0.0.0',
      browser_online: 'true',
      engine_name: 'Blink',
      engine_version: '131.0.0.0',
      os_name: 'Windows',
      os_version: '10',
      platform: 'PC',
    });
    return `https://www.douyin.com/aweme/v1/web/aweme/detail/?${params.toString()}`;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const id = this._match_id(url);
    if (!id) throw new ExtractorError('Unable to extract Douyin id', { expected: true });

    const pageUrl = `https://www.douyin.com/video/${id}`;
    const headers: Record<string, string> = {
      Referer: 'https://www.douyin.com/',
      'User-Agent': DOUYIN_UA,
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    };

    let detail: Record<string, unknown> | undefined;
    let sawReachableHost = false;
    let lastNetworkError: string | undefined;

    // 1) Share / reflow page — no a_bogus; embeds window._ROUTER_DATA
    const shareUrls = [
      `https://www.iesdouyin.com/share/video/${id}`,
      `https://www.douyin.com/share/video/${id}`,
      `https://m.douyin.com/share/video/${id}`,
    ];
    for (const shareUrl of shareUrls) {
      try {
        const page = await this.rawFetch(shareUrl, {
          headers: {
            ...headers,
            'User-Agent': MOBILE_UA,
            Accept: 'text/html,application/xhtml+xml',
          },
          // Share pages work better with normal TLS than forced JA3 in some builds
          impersonate: false,
        });
        sawReachableHost = true;
        detail = extractDouyinDetail(page.text) || undefined;
        if (detail) {
          this.to_screen(`${id}: Douyin share page OK`);
          break;
        }
      } catch (e) {
        const msg = (e as Error).message || String(e);
        lastNetworkError = msg;
        this.report_warning(`Douyin share page failed: ${msg}`);
      }
    }

    // 2) Web detail API (cookies / impersonate) — may yield higher bitrates
    if (!detail || !(detail.video as Record<string, unknown> | undefined)?.bit_rate) {
      try {
        await this.bootstrapSession(pageUrl, id);
      } catch (e) {
        this.report_warning(`Douyin cookie bootstrap failed: ${(e as Error).message || e}`);
      }

      const apiUrl = this.buildDetailUrl(id);
      for (const ua of [DOUYIN_UA, MOBILE_UA]) {
        try {
          const res = await this.rawFetch(apiUrl, {
            headers: { ...headers, 'User-Agent': ua },
            impersonate: true,
          });
          sawReachableHost = true;
          if (res.status < 400 && res.text.trim()) {
            const json = JSON.parse(res.text) as {
              aweme_detail?: Record<string, unknown>;
            };
            if (json.aweme_detail && typeof json.aweme_detail === 'object') {
              detail = json.aweme_detail;
              break;
            }
          }
        } catch (e) {
          lastNetworkError = (e as Error).message || String(e);
          this.report_warning(`Douyin detail API failed: ${lastNetworkError}`);
        }
      }
    }

    // 3) Desktop video page RENDER_DATA
    if (!detail) {
      try {
        const page = await this.rawFetch(pageUrl, {
          headers: { ...headers, Accept: 'text/html' },
          impersonate: true,
        });
        sawReachableHost = true;
        detail = extractDouyinDetail(page.text) || undefined;
      } catch (e) {
        lastNetworkError = (e as Error).message || String(e);
      }
    }

    if (!detail) {
      if (!sawReachableHost && lastNetworkError) {
        throw new ExtractorError(
          `Douyin network error: ${lastNetworkError}`,
          { expected: true },
        );
      }
      const hasSv = !!this._get_cookies('https://www.douyin.com/').s_v_web_id;
      throw new ExtractorError(
        hasSv
          ? 'Douyin returned empty detail JSON (anti-bot). Export browser cookies (s_v_web_id / __ac_*) via cookiesfrombrowser and retry.'
          : 'Fresh cookies (not necessarily logged in) are needed for Douyin — open the video in browser once, or set cookiesfrombrowser.',
        { expected: true },
      );
    }

    const streamHeaders = {
      ...headers,
      'User-Agent': MOBILE_UA,
      Referer: 'https://www.douyin.com/',
      Cookie: this._downloader?.cookiejar?.getCookieHeader('https://www.douyin.com/') || '',
    };
    const formats = parseAwemeFormats(detail, streamHeaders);
    if (!formats.length) throw new ExtractorError('No Douyin media URL', { expected: true });

    const video = (detail.video || {}) as Record<string, unknown>;
    const author = (detail.author || {}) as Record<string, unknown>;
    const stats = (detail.statistics || {}) as Record<string, unknown>;
    const music = (detail.music || {}) as Record<string, unknown>;
    const desc = String(detail.desc || detail.preview_title || id);
    const durRaw = Number(video.duration || detail.duration || music.duration) || 0;
    const duration = durRaw > 1000 ? durRaw / 1000 : durRaw || null;

    const thumbSources = [video.cover, video.origin_cover, video.dynamic_cover] as Array<
      Record<string, unknown> | undefined
    >;
    const thumbnails: Array<{ url: string; width?: number | null; height?: number | null }> = [];
    const seenThumb = new Set<string>();
    for (const src of thumbSources) {
      const list = src?.url_list;
      const urls = Array.isArray(list) ? list.map(String) : [];
      for (const u of urls) {
        if (!u.startsWith('http') || seenThumb.has(u)) continue;
        seenThumb.add(u);
        thumbnails.push({
          url: u,
          width: Number(src?.width) || null,
          height: Number(src?.height) || null,
        });
      }
    }

    return {
      id: String(detail.aweme_id || id),
      title: desc.length > 72 ? desc.slice(0, 72) : desc,
      description: desc,
      duration,
      timestamp: Number(detail.create_time) || null,
      uploader: String(author.unique_id || author.nickname || '') || undefined,
      uploader_id: author.uid != null ? String(author.uid) : null,
      channel: String(author.nickname || '') || null,
      channel_id: String(author.sec_uid || '') || null,
      view_count: Number(stats.play_count) || null,
      like_count: Number(stats.digg_count) || null,
      comment_count: Number(stats.comment_count) || null,
      thumbnail: thumbnails[0]?.url || undefined,
      thumbnails: thumbnails.length ? thumbnails : undefined,
      webpage_url: pageUrl,
      original_url: url,
      formats,
      extractor: 'Douyin',
      extractor_key: 'Douyin',
      http_headers: streamHeaders,
    };
  }
}
