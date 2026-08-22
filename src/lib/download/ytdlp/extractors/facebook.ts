/**
 * FacebookIE / FacebookReelIE — aligned with yt-dlp facebook.py
 * (_extract_from_url: VideoConfig → RelayPrefetch → tahoe).
 */

import { InfoExtractor, ExtractorError } from '../common';
import type { Format, VideoInfo } from '../types';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DL_UA = 'facebookexternalhit/1.1';

const VIDEO_PAGE_TEMPLATE = 'https://www.facebook.com/video/video.php?v=%s';
const VIDEO_PAGE_TAHOE_TEMPLATE =
  'https://www.facebook.com/video/tahoe/async/%s/?chain=true&isvideo=true&payloadtype=primary';

const FB_VALID_URL =
  /https?:\/\/(?:[\w-]+\.)?(?:facebook\.com|facebookwkhpilnemxj7asaniu7vnjjbiltxjqhye3mhbshg7kx5tfyd\.onion)\/(?:[^#]*?\#!\/)?(?:permalink\.php|video\/video\.php|photo\.php|video\.php|video\/embed|story\.php|watch(?:\/live)?\/?)\?(?:.*?)(?:v|video_id|story_fbid)=|[^/]+\/videos\/(?:[^/]+\/)?|[^/]+\/posts\/|events\/(?:[^/]+\/)?|groups\/[^/]+\/(?:permalink|posts)\/(?:[\da-f]+\/)?|watchparty\/|(?:facebook:)(?<id>pfbid[A-Za-z0-9]+|\d+)/i;

// Grouped pattern for _match_id (covers watch/?v=, /videos/ID/, query v=)
const FB_ID_URL =
  /(?:facebook:|https?:\/\/(?:[\w-]+\.)?(?:facebook\.com|facebookwkhpilnemxj7asaniu7vnjjbiltxjqhye3mhbshg7kx5tfyd\.onion)\/(?:[^#]*?\#!\/)?(?:(?:[^?#]*[?&](?:v|video_id|story_fbid)=)|(?:[^/]+\/videos\/(?:[^/]+\/)?)|(?:[^/]+\/posts\/)|(?:events\/)|(?:groups\/[^/]+\/(?:permalink|posts)\/)|(?:watchparty\/)|(?:watch(?:\/live)?\/?(?:\?[^#]*)?)))(?<id>pfbid[A-Za-z0-9]+|\d+)/i;

const RELAY_MEDIA_FILTER =
  /"(?:dash_manifest|playable_url(?:_quality_hd)?|browser_native_(?:hd|sd)_url|videoDeliveryResponse|progressive_urls|hls_playlist_url)/;

function urlOrNone(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null;
  if (v.startsWith('//')) return `https:${v}`;
  return /^https?:\/\//i.test(v) ? v : null;
}

function intOrNone(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function extFromUrl(u: string): string {
  const m = /\.(\w+)(?:\?|$)/i.exec(u);
  return m?.[1]?.toLowerCase() || 'mp4';
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** yt-dlp yield_all_relay_data：按 filter 扫 data-sjs（整段 script，不强制 ScheduledServerJS） */
function* yieldRelayData(webpage: string, filter: RegExp): Generator<Record<string, unknown>> {
  const re = /data-sjs>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(webpage))) {
    let raw = m[1]!.trim();
    if (!filter.test(raw)) continue;
    // 部分页面把引号写成 \u0022，先还原再 parse
    if (raw.includes('\\u0022') || raw.includes('\\u007b')) {
      raw = raw.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) =>
        String.fromCharCode(parseInt(h, 16)),
      );
    }
    if (!raw.startsWith('{') && !raw.startsWith('[')) continue;
    try {
      yield JSON.parse(raw) as Record<string, unknown>;
    } catch {
      /* skip broken JSON */
    }
  }
}

/**
 * 对齐 yt-dlp extract_relay_prefetched_data：
 * require → RelayPrefetchedStreamCache → __bbox.result.data
 */
function extractRelayPrefetchedData(
  webpage: string,
  filter: RegExp,
  targetKeys?: string[],
): Record<string, unknown> | null {
  for (const block of yieldRelayData(webpage, filter)) {
    const found = findRelayPrefetchData(block, targetKeys);
    if (found) return found;
  }
  return null;
}

function findRelayPrefetchData(
  node: unknown,
  targetKeys?: string[],
  depth = 0,
): Record<string, unknown> | null {
  if (!node || depth > 24) return null;
  if (Array.isArray(node)) {
    // RelayPrefetchedStreamCache 条目常为数组：[name, ...]
    const isPrefetch =
      typeof node[0] === 'string' && String(node[0]).startsWith('RelayPrefetchedStreamCache');
    if (isPrefetch) {
      for (const item of node) {
        const hit = digBboxResultData(item, targetKeys);
        if (hit) return hit;
      }
    }
    for (const item of node) {
      const hit = findRelayPrefetchData(item, targetKeys, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (!isPlainObject(node)) return null;

  // 任意层出现 RelayPrefetchedStreamCache 键
  for (const key of Object.keys(node)) {
    if (key.startsWith('RelayPrefetchedStreamCache')) {
      const hit = digBboxResultData(node[key], targetKeys);
      if (hit) return hit;
    }
  }

  if (node.require != null) {
    const hit = findRelayPrefetchData(node.require, targetKeys, depth + 1);
    if (hit) return hit;
  }
  if (isPlainObject(node.__bbox)) {
    const bbox = node.__bbox;
    if (bbox.require != null) {
      const hit = findRelayPrefetchData(bbox.require, targetKeys, depth + 1);
      if (hit) return hit;
    }
    const hit = digBboxResultData(node, targetKeys);
    if (hit) return hit;
  }

  for (const v of Object.values(node)) {
    const hit = findRelayPrefetchData(v, targetKeys, depth + 1);
    if (hit) return hit;
  }
  return null;
}

function digBboxResultData(
  node: unknown,
  targetKeys?: string[],
  depth = 0,
): Record<string, unknown> | null {
  if (!node || depth > 16) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = digBboxResultData(item, targetKeys, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (!isPlainObject(node)) return null;

  if (isPlainObject(node.__bbox) && isPlainObject(node.__bbox.result)) {
    const data = node.__bbox.result.data;
    if (isPlainObject(data) && matchesTargetKeys(data, targetKeys)) return data;
  }
  if (isPlainObject(node.result) && isPlainObject(node.result.data)) {
    const data = node.result.data;
    if (matchesTargetKeys(data, targetKeys)) return data;
  }
  if ('data' in node && isPlainObject(node.data) && matchesTargetKeys(node.data, targetKeys)) {
    return node.data;
  }

  for (const v of Object.values(node)) {
    const hit = digBboxResultData(v, targetKeys, depth + 1);
    if (hit) return hit;
  }
  return null;
}

function matchesTargetKeys(data: Record<string, unknown>, targetKeys?: string[]): boolean {
  if (!targetKeys?.length) return true;
  return targetKeys.some((k) => k in data);
}

function extractVideoConfigInstances(data: Record<string, unknown>): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const instances = data.instances as unknown[] | undefined;
  if (!Array.isArray(instances)) return out;
  for (const item of instances) {
    if (!Array.isArray(item)) continue;
    if (item[1]?.[0] === 'VideoConfig' && item[2]?.[0]) {
      const videoItem = item[2][0] as Record<string, unknown>;
      const vd = videoItem.videoData;
      if (Array.isArray(vd)) out.push(...(vd as Record<string, unknown>[]));
      else if (isPlainObject(vd)) out.push(vd);
    }
  }
  return out;
}

function applyFbFormatHeaders(formats: Format[]): void {
  for (const f of formats) {
    f.http_headers = { ...(f.http_headers || {}), 'User-Agent': DL_UA };
    f.downloader_options = { ...(f.downloader_options || {}), http_chunk_size: 250 << 20 };
  }
}

function collectVideoNodes(root: unknown, videoId: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const seen = new Set<unknown>();
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    const rec = node as Record<string, unknown>;
    const typename = String(rec.__typename || '');
    const id = rec.id != null ? String(rec.id) : '';
    const vid = rec.videoId != null ? String(rec.videoId) : '';
    if (
      typename === 'Video' ||
      rec.playable_url != null ||
      rec.playable_url_quality_hd != null ||
      rec.browser_native_hd_url != null ||
      rec.browser_native_sd_url != null ||
      rec.videoDeliveryLegacyFields != null ||
      rec.videoDeliveryResponseFragment != null
    ) {
      // 优先匹配目标 id；否则也收集（单视频页常无精确 id 字段）
      if (!videoId || !id || id === videoId || vid === videoId || !out.length) {
        out.push(rec);
      }
    }
    for (const v of Object.values(rec)) walk(v);
  };
  walk(root);
  return out;
}

function unescapeFbUrl(raw: string): string {
  return raw
    .replace(/\\u0026/gi, '&')
    .replace(/\\u003d/gi, '=')
    .replace(/\\u002f/gi, '/')
    .replace(/\\u003f/gi, '?')
    .replace(/\\\//g, '/')
    .replace(/\\&/g, '&');
}

/**
 * 当 Relay JSON 解析失败时，直接从 HTML 刮取媒体 URL（游客页常见）。
 * FB CDN 常无 .mp4 后缀，不能只认扩展名。
 */
function scrapePlayableFromHtml(html: string): Array<{ formatId: string; url: string }> {
  const found = new Map<string, string>();
  const add = (fid: string, rawUrl: string) => {
    let u = unescapeFbUrl(rawUrl);
    if (u.startsWith('/')) u = `https://www.facebook.com${u}`;
    if (!/^https?:\/\//i.test(u)) return;
    // 跳过纯图片 / lookaside 缩略图
    if (/lookaside\.fbsbx\.com|\/safe_image\.php|\.(?:jpg|png|webp)(?:\?|$)/i.test(u)) return;
    if (!found.has(u)) found.set(u, fid || 'progressive');
  };

  const patterns: RegExp[] = [
    /"(playable_url(?:_quality_hd)?|playable_url_dash|browser_native_(?:hd|sd)_url|progressive_url|hd_src(?:_no_ratelimit)?|sd_src(?:_no_ratelimit)?)"\s*:\s*"([^"]+)"/g,
    /\\"(playable_url(?:_quality_hd)?|playable_url_dash|browser_native_(?:hd|sd)_url|progressive_url|hd_src(?:_no_ratelimit)?|sd_src(?:_no_ratelimit)?)\\"\s*:\s*\\"([^"\\]+)\\"/g,
    /\\u0022(playable_url(?:_quality_hd)?|playable_url_dash|browser_native_(?:hd|sd)_url|progressive_url|hd_src(?:_no_ratelimit)?|sd_src(?:_no_ratelimit)?)\\u0022\s*:\s*\\u0022((?:[^\\]|\\(?!u0022))+?)\\u0022/gi,
  ];
  for (const re of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      add(m[1]!, m[2]!);
    }
  }

  // dash / hls playlist urls
  for (const re of [
    /"manifest_url"\s*:\s*"(https?:[^"]+\.mpd[^"]*)"/gi,
    /"hls_playlist_url"\s*:\s*"(https?:[^"]+\.m3u8[^"]*)"/gi,
    /"(https?:\\\/\\\/[^"]+\.mpd[^"]*)"/gi,
  ]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      add(m[0].includes('m3u8') ? 'hls' : 'dash', m[1]!);
    }
  }

  return [...found.entries()].map(([url, formatId]) => ({ formatId, url }));
}

function candidateFacebookPages(url: string, videoId: string): string[] {
  const cleaned = url
    .replace('://m.facebook.com/', '://www.facebook.com/')
    .replace(/[?#].*$/, '');
  const watch = `https://www.facebook.com/watch/?v=${videoId}`;
  const videoPhp = VIDEO_PAGE_TEMPLATE.replace('%s', videoId);
  const embed = `https://www.facebook.com/video/embed?video_id=${videoId}`;
  const plugin = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(watch)}&show_text=false&width=auto`;
  const mbasic = `https://mbasic.facebook.com/watch/?v=${videoId}`;
  // watch / embed / crawler-friendly 优先；带追踪参数的 permalink 常只有登录浮层壳
  const out: string[] = [];
  for (const u of [watch, embed, plugin, videoPhp, mbasic, cleaned]) {
    if (!out.includes(u)) out.push(u);
  }
  return out;
}

export class FacebookIE extends InfoExtractor {
  static IE_NAME = 'facebook';
  static IE_DESC = 'Facebook videos';
  static _VALID_URL = FB_ID_URL;
  static _TESTS = [
    { url: 'https://www.facebook.com/radiokicksfm/videos/3676516585958356/', only_matching: true },
    { url: 'https://www.facebook.com/video.php?v=637842556329505', only_matching: true },
    { url: 'https://www.facebook.com/watch/?v=647537299265662', only_matching: true },
  ];

  /** 浏览器 UA：拿完整 comet 页（可能含登录浮层壳） */
  private pageHeaders(): Record<string, string> {
    return {
      'User-Agent': UA,
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: 'https://www.facebook.com/',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    };
  }

  /**
   * 爬虫 UA：FB 对 externalhit 常直接返回 og:video 直链，
   * 避开「关登录浮层后才播」的游客壳页面。
   */
  private crawlerHeaders(): Record<string, string> {
    return {
      'User-Agent': 'facebookexternalhit/1.1; (+http://www.facebook.com/externalhit_uatext.php)',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    };
  }

  private async extractFromUrl(url: string, videoId: string): Promise<VideoInfo> {
    const pages = candidateFacebookPages(url, videoId);
    const headerPasses: Array<{ name: string; headers: Record<string, string> }> = [
      { name: 'crawler', headers: this.crawlerHeaders() },
      { name: 'browser', headers: this.pageHeaders() },
    ];

    let lastWebpage = '';
    let lastPageUrl = pages[0]!;
    let formats: Format[] = [];
    let videoMeta: Partial<VideoInfo> = { id: videoId };

    for (const pass of headerPasses) {
      for (const pageUrl of pages) {
        lastPageUrl = pageUrl;
        const webpage = await this._download_webpage(
          pageUrl,
          videoId,
          `Downloading Facebook webpage (${pass.name})`,
          { headers: pass.headers, fatal: false },
        );
        if (!webpage || webpage.length < 200) continue;
        lastWebpage = webpage;

        const got = await this.extractFormatsFromWebpage(webpage, videoId);
        if (got.formats.length) {
          formats = got.formats;
          videoMeta = { ...videoMeta, ...got.info };
          break;
        }
      }
      if (formats.length) break;
    }

    if (!formats.length) {
      // 登录浮层 ≠ 必须登录：浮层关掉后游客可播。勿因 login_form 误判。
      const hardLoginWall =
        lastWebpage &&
        /You must log in to continue/i.test(lastWebpage) &&
        !/playable_url|browser_native_|og:video|hd_src|sd_src/i.test(lastWebpage) &&
        /id="login_form"|id="loginbutton"/i.test(lastWebpage);
      if (hardLoginWall) {
        this.raise_login_required('Facebook login required');
      }
      const interstitial = lastWebpage
        ? this._search_regex(
            /class="[^"]*uiInterstitialContent[^"]*"><div>(.*?)<\/div>/,
            lastWebpage,
            'error',
            null,
            false,
          )
        : null;
      if (interstitial) {
        throw new ExtractorError(`The video is not available, Facebook said: "${interstitial}"`, {
          expected: true,
        });
      }
      throw new ExtractorError(
        'Cannot parse data（游客页含登录浮层时请重试；仍失败可配置 Cookie）',
        { expected: true },
      );
    }

    applyFbFormatHeaders(formats);
    const meta = this.extractPageMetadata(lastWebpage || '', videoId);
    return {
      ...meta,
      ...videoMeta,
      id: String(videoMeta.id || videoId),
      formats: this._sort_formats(formats),
      webpage_url: lastPageUrl,
      original_url: url,
      extractor: 'facebook',
      extractor_key: 'Facebook',
      http_headers: { 'User-Agent': DL_UA },
    };
  }

  private async extractFormatsFromWebpage(
    webpage: string,
    videoId: string,
  ): Promise<{ formats: Format[]; info: Partial<VideoInfo> }> {
    let videoData: Record<string, unknown>[] = [];
    let formats: Format[] = [];
    let info: Partial<VideoInfo> = { id: videoId };

    // 爬虫/OG 页：优先静默取 og:video（不走会刷屏的 _html_search_meta）
    const ogVideo = this.silentOgVideoUrl(webpage);
    if (ogVideo && !/\.(?:jpg|png|webp|gif)(?:\?|$)/i.test(ogVideo)) {
      formats.push({
        format_id: 'og',
        url: ogVideo,
        ext: /\.m3u8/i.test(ogVideo) ? 'mp4' : extFromUrl(ogVideo) || 'mp4',
        protocol: /\.m3u8/i.test(ogVideo) ? 'm3u8_native' : 'https',
      });
      if (formats.length) return { formats, info };
    }

    // 1) handleServerJS / s.handle VideoConfig
    const serverJs = this._search_regex(
      [/handleServerJS\(({.+})(?:\);|,")/, /\bs\.handle\(({.+?})\);/],
      webpage,
      'server js data',
      '{}',
      false,
    );
    if (serverJs) {
      const parsed = this._parse_json<Record<string, unknown>>(serverJs, videoId, null, false);
      if (parsed) videoData = extractVideoConfigInstances(parsed);
    }

    // 2) bigPipe.onPageletArrive
    if (!videoData.length) {
      const bigPipe = this._search_regex(
        [
          /bigPipe\.onPageletArrive\(({.+?})\)\s*;\s*}\s*\)\s*,\s*['"]onPageletArrive/,
          /bigPipe\.onPageletArrive\(({.*?id\s*:\s*"(?:pagelet_group_mall|permalink_video_pagelet|hyperfeed_story_id_[0-9a-f]+)".*?})\);/,
        ],
        webpage,
        'js data',
        '{}',
        false,
      );
      if (bigPipe) {
        const parsed = this._parse_json<Record<string, unknown>>(bigPipe, videoId, null, false);
        const jsmods = parsed?.jsmods as Record<string, unknown> | undefined;
        if (jsmods?.instances) {
          videoData = extractVideoConfigInstances({ instances: jsmods.instances as unknown[] });
        }
      }
    }

    // 3) RelayPrefetchedStreamCache
    if (!videoData.length) {
      const data =
        extractRelayPrefetchedData(webpage, RELAY_MEDIA_FILTER, [
          'video',
          'event',
          'nodes',
          'node',
          'mediaset',
        ]) || extractRelayPrefetchedData(webpage, RELAY_MEDIA_FILTER);
      if (data) {
        const parsed = await this.parseGraphqlVideoTree(data, videoId, webpage);
        if (parsed.formats.length) {
          formats = parsed.formats;
          info = { ...info, ...parsed.info };
        }
      }
    }

    // 4) tahoe async fallback
    if (!formats.length && !videoData.length) {
      const tahoeBody = new URLSearchParams({
        __a: '1',
        __pc:
          this._search_regex(/pkg_cohort["']\s*:\s*["'](.+?)["']/, webpage, 'pkg cohort', 'PHASED:DEFAULT', false) ||
          'PHASED:DEFAULT',
        __rev:
          this._search_regex(/client_revision["']\s*:\s*(\d+),/, webpage, 'client revision', '3944515', false) ||
          '3944515',
        fb_dtsg:
          this._search_regex(
            /"DTSGInitialData"\s*,\s*\[\]\s*,\s*{\s*"token"\s*:\s*"([^"]+)"/,
            webpage,
            'dtsg token',
            '',
            false,
          ) || '',
      }).toString();
      try {
        const tahoeText = await this._httpGetText(
          VIDEO_PAGE_TAHOE_TEMPLATE.replace('%s', videoId),
          {
            ...this.pageHeaders(),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          { method: 'POST', body: tahoeBody },
        );
        const tahoeJson = this._search_regex(
          /for\s+\(\s*;\s*;\s*\)\s*;(.+)/,
          tahoeText,
          'tahoe js data',
          '{}',
          false,
        );
        const tahoeParsed = this._parse_json<Record<string, unknown>>(tahoeJson, videoId, null, false);
        if (tahoeParsed?.jsmods) {
          videoData = extractVideoConfigInstances({
            instances: (tahoeParsed.jsmods as Record<string, unknown>).instances as unknown[],
          });
        }
      } catch {
        /* optional */
      }
    }

    if (!formats.length && videoData.length) {
      for (const stream of videoData) {
        const streams = Array.isArray(stream) ? stream : [stream];
        for (const s of streams) {
          if (!isPlainObject(s)) continue;
          formats.push(...(await this.formatsFromVideoConfig(s, videoId)));
        }
      }
    }

    if (!formats.length) {
      for (const block of yieldRelayData(webpage, RELAY_MEDIA_FILTER)) {
        const parsed = await this.parseGraphqlVideoTree(block, videoId, webpage);
        if (parsed.formats.length) {
          formats.push(...parsed.formats);
          info = { ...info, ...parsed.info };
          break;
        }
      }
    }

    // HTML 正则刮取
    if (!formats.length) {
      for (const hit of scrapePlayableFromHtml(webpage)) {
        const u = hit.url;
        if (/\.mpd(\?|$)/i.test(u)) {
          formats.push(...(await this._extract_mpd_formats(u, videoId, 'dash', undefined, false)));
        } else if (/\.m3u8(\?|$)/i.test(u)) {
          formats.push(
            ...(await this._extract_m3u8_formats(
              u,
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
        } else {
          formats.push({
            format_id: /hd/i.test(hit.formatId) ? 'hd' : /sd/i.test(hit.formatId) ? 'sd' : 'progressive',
            url: u,
            ext: 'mp4',
            protocol: 'https',
            quality: /hd/i.test(hit.formatId) ? -2 : -3,
          });
        }
      }
    }

    // fbcdn 直链兜底（crawler 页偶发只给裸 URL）
    if (!formats.length) {
      const cdnRe =
        /https?:\\?\/\\?\/(?:video|scontent)[^"'\\\s<>]+(?:fbcdn\.net|facebook\.com)[^"'\\\s<>]*/gi;
      let m: RegExpExecArray | null;
      const seen = new Set<string>();
      while ((m = cdnRe.exec(webpage))) {
        const u = unescapeFbUrl(m[0]!).replace(/&amp;/g, '&');
        if (seen.has(u)) continue;
        if (/\.(?:jpg|png|webp|gif)(?:\?|$)/i.test(u)) continue;
        if (!/\/v\/t\d|\/o1\/v\/t|\/v\/t42\.|video\.|\.mp4|\.m3u8|\.mpd/i.test(u)) continue;
        seen.add(u);
        formats.push({ format_id: 'cdn', url: u, ext: 'mp4', protocol: 'https' });
        if (formats.length >= 4) break;
      }
    }

    return { formats, info };
  }

  /** 静默提取 og:video，避免 Unable to extract 警告刷屏 */
  private silentOgVideoUrl(webpage: string): string | null {
    const props = ['og:video:secure_url', 'og:video:url', 'og:video', 'twitter:player:stream'];
    for (const key of props) {
      const u = urlOrNone(
        this._search_regex(
          [
            new RegExp(
              `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`,
              'i',
            ),
            new RegExp(
              `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`,
              'i',
            ),
          ],
          webpage,
          key,
          null,
          false,
        ),
      );
      if (u) return u;
    }
    return null;
  }

  private async formatsFromVideoConfig(
    rec: Record<string, unknown>,
    videoId: string,
  ): Promise<Format[]> {
    const formats: Format[] = [];
    const formatId = String(rec.stream_type || 'progressive');
    for (const quality of ['sd', 'hd'] as const) {
      for (const srcType of ['src', 'src_no_ratelimit'] as const) {
        const src = urlOrNone(rec[`${quality}_${srcType}`]);
        if (!src) continue;
        formats.push({
          format_id: `${formatId}_${quality}_${srcType}`,
          url: src,
          ext: extFromUrl(src),
          protocol: 'https',
          height: quality === 'hd' ? 720 : null,
          quality: quality === 'hd' ? -2 : -3,
        });
      }
    }
    formats.push(...(await this.extractDashFromObj(rec, videoId)));
    return formats;
  }

  private async extractDashFromObj(
    vidData: Record<string, unknown>,
    videoId: string,
  ): Promise<Format[]> {
    const formats: Format[] = [];
    const dashUrl = urlOrNone(vidData.dash_manifest_url);
    if (dashUrl) {
      formats.push(...(await this._extract_mpd_formats(dashUrl, videoId, 'dash', undefined, false)));
    }
    const candidates = [
      vidData.dash_manifest,
      vidData.playlist,
      vidData.dash_manifest_xml_string,
      vidData.manifest_xml,
    ];
    for (const c of candidates) {
      let xml: string | null = null;
      if (typeof c === 'string' && c.includes('<MPD')) xml = c;
      else if (isPlainObject(c)) {
        const nested =
          c.dash_manifest_xml_string || c.manifest_xml || c.dash_manifest;
        if (typeof nested === 'string' && nested.includes('<MPD')) xml = nested;
      }
      if (!xml) continue;
      try {
        const blob = decodeURIComponent(String(xml).replace(/\+/g, '%20'));
        formats.push(
          ...(await this._extract_mpd_formats(
            `data:application/dash+xml,${encodeURIComponent(blob)}`,
            videoId,
            'dash',
            undefined,
            false,
          )),
        );
      } catch {
        /* ignore */
      }
    }
    return formats;
  }

  private async parseGraphqlVideoTree(
    data: Record<string, unknown>,
    videoId: string,
    webpage: string,
  ): Promise<{ formats: Format[]; info: Partial<VideoInfo> }> {
    const formats: Format[] = [];
    const info: Partial<VideoInfo> = {};

    const tryParse = async (video: Record<string, unknown>) => {
      const r = await this.parseGraphqlVideo(video, videoId, webpage);
      if (r.formats.length) {
        formats.push(...r.formats);
        Object.assign(info, r.info);
      }
    };

    // attachments（posts / stories）
    const nodes = [] as unknown[];
    if (data.nodes) nodes.push(...(Array.isArray(data.nodes) ? data.nodes : [data.nodes]));
    if (data.node) nodes.push(data.node);

    for (const node of nodes) {
      if (!isPlainObject(node)) continue;
      const story =
        (node.comet_sections as Record<string, unknown> | undefined)?.content &&
        ((node.comet_sections as Record<string, unknown>).content as Record<string, unknown>)
          ?.story;
      const stories = [story, isPlainObject(story) ? story.attached_story : null].filter(isPlainObject);
      for (const st of stories) {
        const atts = (st.attachments as unknown[]) || [];
        for (const att of atts) {
          if (!isPlainObject(att)) continue;
          const attachment =
            (att.styles as Record<string, unknown> | undefined)?.attachment ||
            (att.style_type_renderer as Record<string, unknown> | undefined)?.attachment ||
            att.attachment ||
            att;
          if (isPlainObject(attachment)) {
            if (isPlainObject(attachment.media)) await tryParse(attachment.media);
            const targetAtts =
              (attachment.target as Record<string, unknown> | undefined)?.attachments || [];
            for (const t of targetAtts as unknown[]) {
              const media = isPlainObject(t)
                ? ((t.styles as Record<string, unknown> | undefined)?.attachment as Record<
                    string,
                    unknown
                  > | undefined)?.media || (t as Record<string, unknown>).media
                : null;
              if (isPlainObject(media)) await tryParse(media);
            }
          }
        }
      }
    }

    // mediaset edges
    const edges =
      ((data.mediaset as Record<string, unknown> | undefined)?.currMedia as Record<string, unknown> | undefined)
        ?.edges || [];
    for (const edge of edges as unknown[]) {
      if (isPlainObject(edge) && isPlainObject(edge.node)) await tryParse(edge.node);
    }

    // event / video root
    const cover =
      ((data.event as Record<string, unknown> | undefined)?.cover_media_renderer as Record<
        string,
        unknown
      > | undefined)?.cover_video;
    if (isPlainObject(cover)) await tryParse(cover);
    if (isPlainObject(data.video)) await tryParse(data.video);

    // 深度兜底：任意 Video / playable_url 节点
    if (!formats.length) {
      for (const video of collectVideoNodes(data, videoId).slice(0, 12)) {
        await tryParse(video);
        if (formats.length) break;
      }
    }

    return { formats, info };
  }

  private async parseGraphqlVideo(
    videoIn: Record<string, unknown>,
    videoId: string,
    webpage: string,
  ): Promise<{ formats: Format[]; info: Partial<VideoInfo> }> {
    let video = { ...videoIn };

    // Reels：creation_story.short_form_video_context.playback_video
    const reelInfo = (
      (video.creation_story as Record<string, unknown> | undefined)?.short_form_video_context as
        | Record<string, unknown>
        | undefined
    )?.playback_video;
    if (isPlainObject(reelInfo)) {
      const story = video.creation_story as Record<string, unknown>;
      video = {
        ...story,
        ...reelInfo,
        owner:
          (story.short_form_video_context as Record<string, unknown> | undefined)?.video_owner ||
          video.owner,
      };
    }

    if (video.__typename && video.__typename !== 'Video' && !video.playable_url && !video.videoDeliveryLegacyFields) {
      // 非视频 attachment
      if (!video.videoDeliveryResponseFragment && !video.browser_native_hd_url) {
        return { formats: [], info: {} };
      }
    }

    const vId = String(video.videoId || video.id || videoId);
    const formats: Format[] = [];
    const info: Partial<VideoInfo> = { id: vId };

    // Legacy fields
    const fmtData = isPlainObject(video.videoDeliveryLegacyFields)
      ? (video.videoDeliveryLegacyFields as Record<string, unknown>)
      : video;

    for (const [key, fid] of [
      ['playable_url', 'sd'],
      ['playable_url_quality_hd', 'hd'],
      ['playable_url_dash', ''],
      ['browser_native_hd_url', 'hd'],
      ['browser_native_sd_url', 'sd'],
    ] as const) {
      const playable = urlOrNone(fmtData[key]);
      if (!playable) continue;
      if (extFromUrl(playable) === 'mpd' || key === 'playable_url_dash') {
        formats.push(...(await this._extract_mpd_formats(playable, vId, 'dash', undefined, false)));
      } else {
        formats.push({
          format_id: fid || 'dash',
          url: playable,
          ext: extFromUrl(playable),
          protocol: 'https',
          quality: fid === 'hd' ? -2 : -3,
        });
      }
    }
    formats.push(...(await this.extractDashFromObj(fmtData, vId)));

    // New videoDeliveryResponse
    const delivery = video.videoDeliveryResponseFragment as Record<string, unknown> | undefined;
    const deliveryResult = delivery?.videoDeliveryResponseResult as Record<string, unknown> | undefined;
    if (deliveryResult) {
      const mpdUrls = ((deliveryResult.dash_manifest_urls as Record<string, unknown>[]) || [])
        .map((x) => urlOrNone(x.manifest_url))
        .filter(Boolean) as string[];
      const dashManifests = (deliveryResult.dash_manifests as Record<string, unknown>[]) || [];
      for (let i = 0; i < dashManifests.length; i++) {
        const dm = dashManifests[i]!;
        formats.push(
          ...(await this.extractDashFromObj(
            { ...dm, dash_manifest_url: mpdUrls[i] },
            vId,
          )),
        );
      }
      if (!dashManifests.length) {
        for (const u of mpdUrls) {
          formats.push(...(await this._extract_mpd_formats(u, vId, 'dash', undefined, false)));
        }
      }
      for (const prog of (deliveryResult.progressive_urls as Record<string, unknown>[]) || []) {
        const u = urlOrNone(prog.progressive_url);
        if (!u) continue;
        const q = String(
          ((prog.metadata as Record<string, unknown> | undefined)?.quality as string) || 'progressive',
        ).toLowerCase();
        formats.push({
          format_id: q,
          url: u,
          ext: extFromUrl(u),
          protocol: 'https',
          quality: q === 'hd' ? -2 : -3,
        });
      }
      for (const hls of (deliveryResult.hls_playlist_urls as Record<string, unknown>[]) || []) {
        const u = urlOrNone(hls.hls_playlist_url);
        if (!u) continue;
        formats.push(
          ...(await this._extract_m3u8_formats(
            u,
            vId,
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
    }

    if (!formats.length) return { formats: [], info: {} };

    if (video.name) info.title = String(video.name);
    const desc = (video.savable_description as Record<string, unknown> | undefined)?.text;
    if (desc) {
      if (!info.title) info.title = String(desc);
      else info.description = String(desc);
    }
    const preferredThumb = video.preferred_thumbnail as Record<string, unknown> | undefined;
    const thumbImage = preferredThumb?.image as Record<string, unknown> | undefined;
    const thumb =
      (video.thumbnailImage as Record<string, unknown> | undefined)?.uri || thumbImage?.uri;
    if (thumb) info.thumbnail = String(thumb);
    info.duration =
      intOrNone(video.playable_duration_in_ms) != null
        ? Number(video.playable_duration_in_ms) / 1000
        : intOrNone(video.length_in_second);
    info.uploader_id = String((video.owner as Record<string, unknown> | undefined)?.id || '') || undefined;
    info.timestamp = intOrNone(video.publish_time ?? video.creation_time) ?? undefined;

    // locale captions (optional)
    void webpage;

    return { formats, info };
  }

  private extractPageMetadata(webpage: string, videoId: string): Partial<VideoInfo> {
    let ld: Record<string, unknown> = {};
    try {
      ld = this._search_json_ld(webpage, videoId, { fatal: false });
    } catch {
      /* ignore */
    }
    const title =
      this._og_search_title(webpage) ||
      this._html_search_meta(['twitter:title'], webpage) ||
      String(ld.name || ld.headline || '') ||
      `Facebook video #${videoId}`;
    const cleanTitle = title.replace(/\s*\|\s*Facebook$/i, '').trim() || `Facebook video #${videoId}`;
    return {
      title: cleanTitle,
      description:
        this._og_search_description(webpage) ||
        this._html_search_meta(['description', 'og:description'], webpage) ||
        undefined,
      thumbnail: this._og_search_thumbnail(webpage) || undefined,
      uploader:
        this._html_search_regex(/ownerName\s*:\s*"([^"]+)"/, webpage, 'uploader', null, false) ||
        undefined,
      timestamp: intOrNone(
        this._search_regex(/<abbr[^>]+data-utime=["'](\d+)/, webpage, 'timestamp', null, false),
      ),
      view_count: intOrNone(
        this._search_regex(/\bviewCount\s*:\s*["']([\d,.]+)/, webpage, 'view count', null, false)?.replace(
          /,/g,
          '',
        ),
      ),
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    let videoId = this._match_id(url);
    if (!videoId) {
      const m = url.match(FB_VALID_URL);
      videoId = m?.groups?.id || m?.[1] || '';
    }
    if (!videoId) throw new ExtractorError('Unable to extract Facebook video id', { expected: true });

    const realUrl = url.startsWith('facebook:')
      ? VIDEO_PAGE_TEMPLATE.replace('%s', videoId)
      : url;
    return this.extractFromUrl(realUrl, videoId);
  }
}

export class FacebookReelIE extends InfoExtractor {
  static IE_NAME = 'facebook:reel';
  static IE_DESC = 'Facebook Reels';
  static _VALID_URL = /https?:\/\/(?:[\w-]+\.)?facebook\.com\/reel\/(?<id>\d+)/i;
  static _TESTS = [{ url: 'https://www.facebook.com/reel/1195289147628387', only_matching: true }];

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    return this.url_result(
      `https://m.facebook.com/watch/?v=${videoId}&_rdr`,
      'Facebook',
      videoId,
    );
  }
}
