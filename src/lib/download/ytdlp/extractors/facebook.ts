/**
 * FacebookIE / FacebookReelIE — aligned with yt-dlp facebook.py main paths
 * (relay GraphQL, VideoConfig/tahoe fallback, progressive + DASH/HLS formats).
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

function deepObjects(root: unknown, pred: (k: string, v: unknown) => boolean): Record<string, unknown>[] {
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
    if (pred('', rec)) out.push(rec);
    for (const [k, v] of Object.entries(rec)) {
      if (pred(k, v) && v && typeof v === 'object' && !Array.isArray(v)) {
        out.push(v as Record<string, unknown>);
      }
      walk(v);
    }
  };
  walk(root);
  return out;
}

function relayBlocks(webpage: string, filter: RegExp): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [];
  for (const m of webpage.matchAll(/data-sjs>(\{.*?ScheduledServerJS.*?\})<\/script>/gs)) {
    if (!filter.test(m[1]!)) continue;
    try {
      blocks.push(JSON.parse(m[1]!) as Record<string, unknown>);
    } catch {
      /* skip */
    }
  }
  return blocks;
}

function relayResultData(webpage: string, filter: RegExp): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const block of relayBlocks(webpage, filter)) {
    const require = block.require as unknown;
    if (!require) continue;
    const walkRequire = (node: unknown) => {
      if (!node) return;
      if (Array.isArray(node)) {
        for (const item of node) walkRequire(item);
        return;
      }
      if (typeof node === 'object') {
        const rec = node as Record<string, unknown>;
        if (rec.__bbox && typeof rec.__bbox === 'object') {
          const bbox = rec.__bbox as Record<string, unknown>;
          if (bbox.result && typeof bbox.result === 'object') {
            const result = bbox.result as Record<string, unknown>;
            if (result.data && typeof result.data === 'object') {
              out.push(result.data as Record<string, unknown>);
            }
          }
        }
        for (const v of Object.values(rec)) walkRequire(v);
      }
    };
    walkRequire(require);
  }
  return out;
}

function extractVideoConfigInstances(data: Record<string, unknown>): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const instances = data.instances as unknown[] | undefined;
  if (!Array.isArray(instances)) return out;
  for (const item of instances) {
    if (!Array.isArray(item)) continue;
    if (item[1]?.[0] === 'VideoConfig' && Array.isArray(item[2]?.[0]?.videoData)) {
      out.push(...(item[2][0].videoData as Record<string, unknown>[]));
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

export class FacebookIE extends InfoExtractor {
  static IE_NAME = 'facebook';
  static IE_DESC = 'Facebook videos';
  static _VALID_URL = FB_ID_URL;
  static _TESTS = [
    { url: 'https://www.facebook.com/radiokicksfm/videos/3676516585958356/', only_matching: true },
    { url: 'https://www.facebook.com/video.php?v=637842556329505', only_matching: true },
    { url: 'https://www.facebook.com/watch/?v=647537299265662', only_matching: true },
  ];

  private pageHeaders(): Record<string, string> {
    return {
      'User-Agent': UA,
      'Accept-Language': 'en-US,en;q=0.9',
    };
  }

  private async extractFromUrl(url: string, videoId: string): Promise<VideoInfo> {
    const pageUrl = url.replace('://m.facebook.com/', '://www.facebook.com/');
    const webpage = await this._download_webpage(pageUrl, videoId, 'Downloading Facebook webpage', {
      headers: this.pageHeaders(),
    });

    const formats: Format[] = [];
    let videoMeta: Partial<VideoInfo> = { id: videoId };

    // Relay GraphQL path (playable_url / dash / hls)
    const relayData = relayResultData(
      webpage,
      /"(?:dash_manifest|playable_url(?:_quality_hd)?)/,
    );
    for (const data of relayData) {
      const parsed = await this.parseGraphqlPayload(data, videoId);
      if (parsed.formats.length) {
        formats.push(...parsed.formats);
        videoMeta = { ...videoMeta, ...parsed.info };
      }
    }

    // ServerJS / VideoConfig instances
    if (!formats.length) {
      let videoData: Record<string, unknown>[] = [];
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
            videoData = extractVideoConfigInstances({ instances: jsmods.instances });
          }
        }
      }

      // Tahoe async fallback
      if (!videoData.length) {
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
          const tahoeText = await this._httpGetText(VIDEO_PAGE_TAHOE_TEMPLATE.replace('%s', videoId), {
            ...this.pageHeaders(),
            'Content-Type': 'application/x-www-form-urlencoded',
          }, { method: 'POST', body: tahoeBody });
          const tahoeJson = this._search_regex(/for\s+\(\s*;\s*;\s*\)\s*;(.+)/, tahoeText, 'tahoe js data', '{}', false);
          const tahoeParsed = this._parse_json<Record<string, unknown>>(tahoeJson, videoId, null, false);
          if (tahoeParsed?.jsmods) {
            videoData = extractVideoConfigInstances({ instances: (tahoeParsed.jsmods as Record<string, unknown>).instances });
          }
        } catch {
          /* optional */
        }
      }

      for (const stream of videoData) {
        const streams = Array.isArray(stream) ? stream : [stream];
        for (const s of streams) {
          if (!s || typeof s !== 'object') continue;
          const rec = s as Record<string, unknown>;
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
              });
            }
          }
          const dashUrl = urlOrNone(rec.dash_manifest_url);
          if (dashUrl) {
            formats.push(...(await this._extract_mpd_formats(dashUrl, videoId, 'dash', undefined, false)));
          }
          const dashXml = rec.dash_manifest as Record<string, unknown> | undefined;
          const manifestXml =
            (dashXml?.playlist as Record<string, unknown> | undefined)?.dash_manifest_xml_string ||
            dashXml?.manifest_xml;
          if (typeof manifestXml === 'string' && manifestXml.includes('<MPD')) {
            const blob = decodeURIComponent(manifestXml.replace(/\+/g, '%20'));
            formats.push(...(await this._extract_mpd_formats(`data:application/dash+xml,${encodeURIComponent(blob)}`, videoId, 'dash', undefined, false)));
          }
        }
      }
    }

    if (!formats.length) {
      if (/>\s*You must log in to continue|id="login_form"|id="loginbutton"/.test(webpage)) {
        this.raise_login_required('Facebook login required');
      }
      const interstitial = this._search_regex(
        /class="[^"]*uiInterstitialContent[^"]*"><div>(.*?)<\/div>/,
        webpage,
        'error',
        null,
        false,
      );
      if (interstitial) {
        throw new ExtractorError(`The video is not available, Facebook said: "${interstitial}"`, {
          expected: true,
        });
      }
      throw new ExtractorError('Cannot parse data', { expected: true });
    }

    applyFbFormatHeaders(formats);
    const meta = this.extractPageMetadata(webpage, videoId);
    return {
      ...meta,
      ...videoMeta,
      id: videoId,
      formats: this._sort_formats(formats),
      webpage_url: pageUrl,
      original_url: url,
      extractor: 'facebook',
      extractor_key: 'Facebook',
      http_headers: { 'User-Agent': DL_UA },
    };
  }

  private async parseGraphqlPayload(
    data: Record<string, unknown>,
    videoId: string,
  ): Promise<{ formats: Format[]; info: Partial<VideoInfo> }> {
    const formats: Format[] = [];
    const info: Partial<VideoInfo> = {};
    const videos = deepObjects(data, (k, v) => {
      if (k === 'media' && v && typeof v === 'object') {
        const m = v as Record<string, unknown>;
        return m.__typename === 'Video' && String(m.id || '') === videoId;
      }
      if (k === 'video' || (v && typeof v === 'object' && (v as Record<string, unknown>).__typename === 'Video')) {
        return true;
      }
      return false;
    });

    for (const video of videos.slice(0, 8)) {
      const vId = String(video.videoId || video.id || videoId);
      const fmtData =
        (video.videoDeliveryLegacyFields as Record<string, unknown>) || video;
      for (const [key, fid] of [
        ['playable_url', 'sd'],
        ['playable_url_quality_hd', 'hd'],
        ['browser_native_hd_url', 'hd'],
        ['browser_native_sd_url', 'sd'],
      ] as const) {
        const u = urlOrNone(fmtData[key]);
        if (!u) continue;
        if (extFromUrl(u) === 'mpd') {
          formats.push(...(await this._extract_mpd_formats(u, vId, 'dash', undefined, false)));
        } else {
          formats.push({ format_id: fid, url: u, ext: extFromUrl(u), protocol: 'https' });
        }
      }
      const delivery = video.videoDeliveryResponseFragment as Record<string, unknown> | undefined;
      const deliveryResult = delivery?.videoDeliveryResponseResult as Record<string, unknown> | undefined;
      if (deliveryResult) {
        for (const prog of (deliveryResult.progressive_urls as Record<string, unknown>[]) || []) {
          const u = urlOrNone(prog.progressive_url);
          if (u) {
            formats.push({
              format_id: String((prog.metadata as Record<string, unknown>)?.quality || 'progressive').toLowerCase(),
              url: u,
              ext: extFromUrl(u),
              protocol: 'https',
            });
          }
        }
        for (const mpd of (deliveryResult.dash_manifest_urls as Record<string, unknown>[]) || []) {
          const u = urlOrNone(mpd.manifest_url);
          if (u) formats.push(...(await this._extract_mpd_formats(u, vId, 'dash', undefined, false)));
        }
        for (const hls of (deliveryResult.hls_playlist_urls as Record<string, unknown>[]) || []) {
          const u = urlOrNone(hls.hls_playlist_url);
          if (u) {
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
      }
      if (video.name) info.title = String(video.name);
      if (!info.title && video.savable_description) {
        info.title = String((video.savable_description as Record<string, unknown>).text || '');
      }
      const preferredThumb = video.preferred_thumbnail as Record<string, unknown> | undefined;
      const thumbImage = preferredThumb?.image as Record<string, unknown> | undefined;
      const thumb =
        (video.thumbnailImage as Record<string, unknown>)?.uri || thumbImage?.uri;
      if (thumb) info.thumbnail = String(thumb);
      info.duration =
        intOrNone(video.playable_duration_in_ms) != null
          ? Number(video.playable_duration_in_ms) / 1000
          : intOrNone(video.length_in_second);
      info.uploader_id = String((video.owner as Record<string, unknown>)?.id || '') || undefined;
    }

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
