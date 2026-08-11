/**
 * YouTubeIE — basic watch URL extractor via ytInitialPlayerResponse / Innertube.
 */

import { InfoExtractor, ExtractorError } from '../common';
import type { Format, Subtitle, VideoInfo } from '../types';
import {
  decipherFormatList,
  extractPlayerJsUrl,
  getCachedSolvers,
  type PlayerSolvers,
} from './youtube-sig';
import { decipherFormatsWithEjs } from './youtube-ejs';
import {
  buildIntegrityDimensions,
  extractEmbeddedPoToken,
  extractVisitorData,
  getCachedPoToken,
  cachePoToken,
  parseConfiguredPoToken,
} from './youtube-pot';
import { appendGvsPoToken, isColdStartPoToken, mintWebPoToken } from './youtube-webpo';
import { normalizeYoutubeUrl, parseYoutubeQuery } from './youtube/shared';

const YT_ID = '(?<id>[0-9A-Za-z_-]{11})';

export class YoutubeIE extends InfoExtractor {
  static IE_NAME = 'youtube';
  static IE_DESC = 'YouTube';

  /** Leave watch?v=…&list=… to YoutubeTabIE (respects noplaylist inside Tab IE). */
  static suitable(url: string): boolean {
    if (!super.suitable(url)) return false;
    try {
      const { list } = parseYoutubeQuery(normalizeYoutubeUrl(url));
      if (list) return false;
    } catch {
      if (/[?&]list=/.test(url)) return false;
    }
    return true;
  }

  static _VALID_URL = new RegExp(
    String.raw`(?:` +
      String.raw`(?:https?:)?\/\/(?:(?:www|m|music|gaming)\.)?(?:youtube\.com|youtube-nocookie\.com)\/` +
      String.raw`(?:(?:watch|embed|live|shorts|v|e)\/|watch\?(?:[^#]*&)?v=|attribution_link\?(?:[^#]*&)?u=%2Fwatch%3Fv%3D)` +
      String.raw`|https?:\/\/youtu\.be\/` +
      String.raw`|(?:https?:)?\/\/(?:www\.)?youtube\.com\/shorts\/` +
      String.raw`)` +
      YT_ID +
      String.raw`(?:[?#&/]|$)`,
    'i',
  );

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url) || extractNakedId(url);
    if (!videoId) throw new ExtractorError('Unable to extract YouTube video id', { expected: true });

    const watchUrl = `https://www.youtube.com/watch?v=${videoId}&hl=en&bpctr=9999999999&has_verified=1`;
    const webpage = await this._download_webpage(watchUrl, videoId, 'Downloading watch webpage', {
      headers: {
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    const visitorDataEarly = extractVisitorData(webpage);
    const embeddedPotEarly = extractEmbeddedPoToken(webpage);
    if (embeddedPotEarly) cachePoToken('WEB', embeddedPotEarly);

    // WebPO：配置注入 → 页面内嵌 → 进程内 BotGuard mint（bgutils-js）
    const configuredPo = String(
      (this.params as { extractor_args?: { youtube?: { po_token?: string } } }).extractor_args
        ?.youtube?.po_token || '',
    );
    let webPo =
      parseConfiguredPoToken(configuredPo, 'web', 'gvs') ||
      getCachedPoToken('WEB') ||
      embeddedPotEarly;
    if (!webPo && visitorDataEarly) {
      webPo = await mintWebPoToken({
        visitorData: visitorDataEarly,
        videoId,
        context: 'gvs',
        webpage,
      });
    }
    let playerPo =
      parseConfiguredPoToken(configuredPo, 'web', 'player') || getCachedPoToken('webpo:player');
    if (!playerPo && videoId) {
      playerPo = await mintWebPoToken({
        visitorData: visitorDataEarly,
        videoId,
        context: 'player',
        webpage,
      });
    }

    let playerResponse = extractPlayerResponse(webpage);
    if (!playerResponse) {
      playerResponse = await this._fetchInnertubePlayer(videoId, 'WEB', {
        visitorData: visitorDataEarly,
        poToken: playerPo || webPo || getCachedPoToken('WEB'),
      });
    }
    if (!playerResponse) {
      throw new ExtractorError('Unable to extract YouTube player response', { expected: true });
    }

    const vd = (playerResponse.videoDetails || {}) as Record<string, unknown>;
    const micro = ((playerResponse.microformat as Record<string, unknown>)?.playerMicroformatRenderer ||
      {}) as Record<string, unknown>;
    let streaming = (playerResponse.streamingData || {}) as Record<string, unknown>;

    // 进程内求解 signatureCipher / n：优先 ejs，回退正则抽取
    let solvers: PlayerSolvers = { decipherSig: null, transformN: null };
    let playerJs = '';
    const playerJsUrl = extractPlayerJsUrl(webpage);
    if (playerJsUrl) {
      try {
        playerJs =
          (await this._download_webpage(playerJsUrl, videoId, 'Downloading player JS', {
            fatal: false,
          })) || '';
        if (playerJs) {
          solvers = await getCachedSolvers(playerJsUrl, async () => playerJs);
        }
      } catch (e) {
        this.report_warning(
          `YouTube player solvers failed: ${(e as Error)?.message || e}`,
        );
      }
    }

    const visitorData = extractVisitorData(webpage);
    const embeddedPot = extractEmbeddedPoToken(webpage);
    if (embeddedPot) cachePoToken('WEB', embeddedPot);

    const playability = playerResponse.playabilityStatus as Record<string, unknown> | undefined;
    if (playability?.status && playability.status !== 'OK') {
      const status = String(playability.status || '');
      // Age-gate / login: try alternate clients before giving up
      if (
        status === 'LOGIN_REQUIRED' ||
        status === 'AGE_CHECK_REQUIRED' ||
        status === 'CONTENT_CHECK_REQUIRED' ||
        /age|sign in|login|confirm your age/i.test(String(playability.reason || ''))
      ) {
        this.report_warning(
          `YouTube playability ${status}; retrying with ANDROID/TV clients (age-gate / login wall)`,
        );
        let recovered = false;
        for (const client of ['ANDROID_VR', 'ANDROID', 'TVHTML5', 'IOS'] as const) {
          const alt = await this._fetchInnertubePlayer(videoId, client, {
            visitorData,
            poToken: undefined,
          });
          const altPlay = alt?.playabilityStatus as Record<string, unknown> | undefined;
          if (altPlay?.status === 'OK' && alt?.streamingData) {
            playerResponse = alt;
            streaming = (alt.streamingData || {}) as Record<string, unknown>;
            recovered = true;
            break;
          }
        }
        if (!recovered) {
          this.raise_login_required(
            String(playability.reason || status) || 'Age-restricted or login-required video',
          );
        }
      } else {
        const reason =
          (playability.reason as string) ||
          ((playability.errorScreen as Record<string, unknown>)?.playerErrorMessageRenderer as Record<
            string,
            unknown
          >)?.reason as Record<string, unknown> | undefined;
        const msg =
          (typeof reason === 'object' && reason && 'simpleText' in reason
            ? String(reason.simpleText)
            : String(playability.reason || playability.status)) || 'Video unavailable';
        throw new ExtractorError(msg, { expected: true });
      }
    }

    // SABR / server-side ad insertion: prefer progressive / HLS when SABR-only adaptive
    const serverAbr = streaming.serverAbrStreamingUrl
      ? String(streaming.serverAbrStreamingUrl)
      : '';
    if (serverAbr) {
      this.report_warning(
        'YouTube SABR streaming detected; preferring HLS / progressive formats when available',
      );
    }

    let rawFormats = [
      ...((streaming.formats as Record<string, unknown>[]) || []),
      ...((streaming.adaptiveFormats as Record<string, unknown>[]) || []),
    ];
    if (playerJs) {
      try {
        rawFormats = await decipherFormatsWithEjs(rawFormats, playerJs);
      } catch (e) {
        this.report_warning(`ejs decipher failed, fallback regex: ${(e as Error)?.message || e}`);
        rawFormats = decipherFormatList(rawFormats, solvers);
      }
    } else {
      rawFormats = decipherFormatList(rawFormats, solvers);
    }

    const formats = parseFormats(rawFormats).filter((f) => !!f.url);

    const pushStreaming = async (sd: Record<string, unknown> | undefined) => {
      if (!sd) return;
      let rows = [
        ...((sd.formats as Record<string, unknown>[]) || []),
        ...((sd.adaptiveFormats as Record<string, unknown>[]) || []),
      ];
      if (playerJs) {
        try {
          rows = await decipherFormatsWithEjs(rows, playerJs);
        } catch {
          rows = decipherFormatList(rows, solvers);
        }
      } else {
        rows = decipherFormatList(rows, solvers);
      }
      formats.push(...parseFormats(rows));
      const hls = sd.hlsManifestUrl ? String(sd.hlsManifestUrl) : '';
      if (hls) {
        formats.push({
          format_id: 'hls',
          url: hls,
          ext: 'mp4',
          protocol: 'm3u8_native',
          format_note: 'HLS',
          vcodec: 'unknown',
          acodec: 'unknown',
        });
      }
    };

    if (!formats.length) {
      const hasCipher = [
        ...((streaming.formats as unknown[]) || []),
        ...((streaming.adaptiveFormats as unknown[]) || []),
      ].some((f) => f && typeof f === 'object' && ('signatureCipher' in f || 'cipher' in f));
      if (hasCipher && !solvers.decipherSig) {
        this.report_warning(
          'YouTube signatureCipher present but player decipher not extracted — trying alternate clients',
        );
      }
    } else {
      const hls = streaming.hlsManifestUrl ? String(streaming.hlsManifestUrl) : '';
      if (hls) {
        formats.push({
          format_id: 'hls',
          url: hls,
          ext: 'mp4',
          protocol: 'm3u8_native',
          format_note: 'HLS',
          vcodec: 'unknown',
          acodec: 'unknown',
        });
      }
    }

    // WEB SABR / pot 不稳：用 android_vr / ios / android（勿塞 cold-start pot，否则 400）
    for (const client of ['ANDROID_VR', 'IOS', 'ANDROID', 'TVHTML5'] as const) {
      const alt = await this._fetchInnertubePlayer(videoId, client, {
        visitorData,
        // 移动端 / VR：不要用 WEB cold-start；仅真实 player pot
        poToken:
          client === 'TVHTML5'
            ? playerPo && !isColdStartPoToken(playerPo)
              ? playerPo
              : undefined
            : undefined,
      });
      const before = formats.length;
      await pushStreaming((alt?.streamingData || {}) as Record<string, unknown>);
      if (formats.length > before) break;
    }

    // GVS：仅真实 WebPO 附加 pot=（cold-start 在 sps=3 无效且可能污染 ANDROID 直链）
    if (webPo && !isColdStartPoToken(webPo)) {
      for (const f of formats) {
        if (f.url && /googlevideo\.com/i.test(f.url)) {
          f.url = appendGvsPoToken(f.url, webPo);
        }
      }
    }

    // de-dupe by format_id+url
    const seen = new Set<string>();
    const unique = formats.filter((f) => {
      const key = `${f.format_id}|${f.url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    formats.length = 0;
    formats.push(...unique);

    const streamHeaders = {
      Referer: 'https://www.youtube.com/',
      Origin: 'https://www.youtube.com',
      'Accept-Encoding': 'identity',
    };
    for (const f of formats) {
      f.http_headers = { ...streamHeaders, ...(f.http_headers || {}) };
    }

    if (!formats.length) {
      throw new ExtractorError(
        '未获取到可下载的 YouTube 直链（签名/n 变换失败或需更新 player 求解）。请稍后重试',
        { expected: true },
      );
    }

    const thumbnails = parseThumbnails(vd.thumbnail as Record<string, unknown>);
    const subtitles = parseCaptions(
      (playerResponse.captions as Record<string, unknown>)?.playerCaptionsTracklistRenderer as
        | Record<string, unknown>
        | undefined,
    );

    const title = String(vd.title || micro.title || videoId);
    const duration = Number(vd.lengthSeconds || micro.lengthSeconds) || null;

    return {
      id: videoId,
      title,
      fulltitle: title,
      description: String(vd.shortDescription || micro.description || '') || null,
      uploader: String(vd.author || micro.ownerChannelName || '') || null,
      uploader_id: String(vd.channelId || micro.externalChannelId || '') || null,
      channel: String(vd.author || '') || null,
      channel_id: String(vd.channelId || '') || null,
      channel_url: vd.channelId
        ? `https://www.youtube.com/channel/${vd.channelId}`
        : undefined,
      duration,
      view_count: Number(vd.viewCount) || null,
      webpage_url: watchUrl,
      original_url: url,
      thumbnail: thumbnails[0]?.url,
      thumbnails,
      formats,
      subtitles,
      is_live: vd.isLiveContent === true && streaming.hlsManifestUrl != null,
      live_status: vd.isLive ? 'is_live' : vd.isLiveContent ? 'was_live' : 'not_live',
      extractor: 'youtube',
      extractor_key: 'Youtube',
      http_headers: {
        Referer: 'https://www.youtube.com/',
        Origin: 'https://www.youtube.com',
        // googlevideo 大文件若协商 gzip/br，reqwest 易 “error decoding response body”
        'Accept-Encoding': 'identity',
      },
    };
  }

  private async _fetchInnertubePlayer(
    videoId: string,
    clientName: 'WEB' | 'ANDROID' | 'ANDROID_VR' | 'IOS' | 'TVHTML5' = 'WEB',
    opts?: { visitorData?: string | null; poToken?: string | null },
  ): Promise<Record<string, unknown> | null> {
    type ClientCfg = {
      clientName: string;
      clientVersion: string;
      clientNameHeader: string;
      apiKey?: string;
      userAgent?: string;
      extraClient?: Record<string, unknown>;
    };
    // 对齐 yt-dlp INNERTUBE_CLIENTS（2026.07+）；过旧 19.x 会 Precondition check failed
    const clients: Record<string, ClientCfg> = {
      WEB: {
        clientName: 'WEB',
        clientVersion: '2.20260708.00.00',
        clientNameHeader: '1',
        apiKey: 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8',
      },
      ANDROID: {
        clientName: 'ANDROID',
        clientVersion: '21.26.364',
        clientNameHeader: '3',
        userAgent: 'com.google.android.youtube/21.26.364 (Linux; U; Android 11) gzip',
        extraClient: {
          androidSdkVersion: 30,
          osName: 'Android',
          osVersion: '11',
        },
      },
      ANDROID_VR: {
        clientName: 'ANDROID_VR',
        clientVersion: '1.65.10',
        clientNameHeader: '28',
        userAgent:
          'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
        extraClient: {
          deviceMake: 'Oculus',
          deviceModel: 'Quest 3',
          androidSdkVersion: 32,
          osName: 'Android',
          osVersion: '12L',
        },
      },
      IOS: {
        clientName: 'IOS',
        clientVersion: '21.26.4',
        clientNameHeader: '5',
        userAgent:
          'com.google.ios.youtube/21.26.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
        extraClient: {
          deviceMake: 'Apple',
          deviceModel: 'iPhone16,2',
          osName: 'iPhone',
          osVersion: '18.3.2.22D82',
        },
      },
      TVHTML5: {
        clientName: 'TVHTML5',
        clientVersion: '7.20240701.15.00',
        clientNameHeader: '7',
        apiKey: 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8',
      },
    };
    const c = clients[clientName] || clients.WEB!;
    const endpoint = c.apiKey
      ? `https://www.youtube.com/youtubei/v1/player?key=${c.apiKey}&prettyPrint=false`
      : 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
    const integrity = buildIntegrityDimensions(
      opts?.poToken && !isColdStartPoToken(opts.poToken) ? opts.poToken : undefined,
    );
    try {
      const clientCtx: Record<string, unknown> = {
        clientName: c.clientName,
        clientVersion: c.clientVersion,
        hl: 'en',
        gl: 'US',
        ...(c.extraClient || {}),
      };
      if (c.userAgent) clientCtx.userAgent = c.userAgent;
      if (opts?.visitorData) clientCtx.visitorData = opts.visitorData;
      const body: Record<string, unknown> = {
        context: { client: clientCtx },
        videoId,
        contentCheckOk: true,
        racyCheckOk: true,
      };
      if (integrity) body.serviceIntegrityDimensions = integrity;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-YouTube-Client-Name': c.clientNameHeader,
        'X-YouTube-Client-Version': c.clientVersion,
        Origin: 'https://www.youtube.com',
      };
      if (c.userAgent) headers['User-Agent'] = c.userAgent;
      const json = await this._download_json<Record<string, unknown>>(
        endpoint,
        videoId,
        `Downloading ${clientName} player API JSON`,
        {
          method: 'POST',
          headers,
          data: JSON.stringify(body),
          fatal: false,
        },
      );
      return json && Object.keys(json).length ? json : null;
    } catch {
      return null;
    }
  }
}

function extractNakedId(url: string): string | null {
  const m = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})(?:[&#?/]|$)/);
  return m?.[1] ?? null;
}

function extractPlayerResponse(webpage: string): Record<string, unknown> | null {
  const patterns = [
    /ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;\s*(?:var\s+(?:meta|head)|<\/script|\n)/s,
    /ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/s,
    /var\s+ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/s,
  ];
  for (const re of patterns) {
    const m = webpage.match(re);
    if (!m?.[1]) continue;
    try {
      return JSON.parse(m[1]) as Record<string, unknown>;
    } catch {
      // try to balance braces
      const sliced = extractBalancedObject(webpage, webpage.indexOf('ytInitialPlayerResponse'));
      if (sliced) {
        try {
          return JSON.parse(sliced) as Record<string, unknown>;
        } catch {
          /* continue */
        }
      }
    }
  }
  return null;
}

function extractBalancedObject(src: string, fromIdx: number): string | null {
  const start = src.indexOf('{', fromIdx);
  if (start < 0) return null;
  let depth = 0;
  let inStr: string | null = null;
  let escape = false;
  for (let i = start; i < src.length; i++) {
    const ch = src[i]!;
    if (inStr) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === inStr) {
        inStr = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}

function parseFormats(list: Record<string, unknown>[]): Format[] {
  const out: Format[] = [];
  for (const it of list) {
    let url = it.url as string | undefined;
    if (!url && typeof it.signatureCipher === 'string') {
      // 未 decipher 的 cipher 跳过（应由 decipherFormatList 先处理）
      continue;
    }
    if (!url) continue;
    const mime = String(it.mimeType || '');
    const ext = mime.includes('webm') ? 'webm' : mime.includes('mp4') ? 'mp4' : 'mp4';
    const isAudio = mime.startsWith('audio/');
    const isVideo = mime.startsWith('video/');
    const qualityLabel = it.qualityLabel as string | undefined;
    const height =
      Number(it.height) ||
      (qualityLabel ? Number(String(qualityLabel).replace(/p.*/, '')) : null) ||
      null;
    out.push({
      format_id: String(it.itag ?? out.length),
      url,
      ext,
      protocol: 'https',
      format_note: qualityLabel || (it.quality as string) || undefined,
      width: Number(it.width) || null,
      height,
      fps: Number(it.fps) || null,
      tbr: Number(it.averageBitrate || it.bitrate) ? Math.round(Number(it.averageBitrate || it.bitrate) / 1000) : null,
      vbr: isVideo && !isAudio ? Math.round(Number(it.averageBitrate || it.bitrate || 0) / 1000) || null : null,
      abr: isAudio ? Math.round(Number(it.averageBitrate || it.bitrate || 0) / 1000) || null : null,
      asr: Number(it.audioSampleRate) || null,
      vcodec: isAudio ? 'none' : mime.match(/codecs="([^"]+)"/)?.[1]?.split(',')[0] || 'unknown',
      acodec: isVideo && !mime.includes('mp4a') && !String(it.audioQuality || '') ? (isAudio ? 'unknown' : 'none') : isAudio || mime.includes('mp4a') || it.audioQuality ? mime.match(/codecs="([^"]+)"/)?.[1]?.split(',').pop()?.trim() || 'unknown' : 'none',
      filesize: Number(it.contentLength) || null,
      language: (it.audioTrack as Record<string, unknown>)?.displayName as string | undefined,
      quality: Number(it.itag) || null,
    });
  }
  // Attach HLS / DASH manifests as formats if present in streamingData — handled by caller
  return out;
}

function parseThumbnails(thumbnail: Record<string, unknown> | undefined): { url: string; width?: number; height?: number }[] {
  const thumbs = (thumbnail?.thumbnails as Array<Record<string, unknown>>) || [];
  return thumbs
    .filter((t) => t.url)
    .map((t) => ({
      url: String(t.url),
      width: Number(t.width) || undefined,
      height: Number(t.height) || undefined,
    }));
}

function parseCaptions(
  renderer: Record<string, unknown> | undefined,
): Record<string, Subtitle[]> | undefined {
  if (!renderer) return undefined;
  const tracks = (renderer.captionTracks as Array<Record<string, unknown>>) || [];
  const out: Record<string, Subtitle[]> = {};
  for (const t of tracks) {
    const lang = String(t.languageCode || 'und');
    const base = String(t.baseUrl || '');
    if (!base) continue;
    out[lang] = [
      { ext: 'srv3', url: base, name: String((t.name as Record<string, unknown>)?.simpleText || lang) },
      { ext: 'json3', url: `${base}&fmt=json3`, name: String((t.name as Record<string, unknown>)?.simpleText || lang) },
      { ext: 'vtt', url: `${base}&fmt=vtt`, name: String((t.name as Record<string, unknown>)?.simpleText || lang) },
    ];
  }
  return Object.keys(out).length ? out : undefined;
}
