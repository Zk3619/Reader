/**
 * YouTubeIE — basic watch URL extractor via ytInitialPlayerResponse / Innertube.
 */

import { InfoExtractor, ExtractorError } from '../common';
import type { Format, Subtitle, VideoInfo } from '../types';

const YT_ID = '(?<id>[0-9A-Za-z_-]{11})';

export class YoutubeIE extends InfoExtractor {
  static IE_NAME = 'youtube';
  static IE_DESC = 'YouTube';
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

    let playerResponse = extractPlayerResponse(webpage);
    if (!playerResponse) {
      playerResponse = await this._fetchInnertubePlayer(videoId);
    }
    if (!playerResponse) {
      throw new ExtractorError('Unable to extract YouTube player response', { expected: true });
    }

    const vd = (playerResponse.videoDetails || {}) as Record<string, unknown>;
    const micro = ((playerResponse.microformat as Record<string, unknown>)?.playerMicroformatRenderer ||
      {}) as Record<string, unknown>;
    const streaming = (playerResponse.streamingData || {}) as Record<string, unknown>;

    const playability = playerResponse.playabilityStatus as Record<string, unknown> | undefined;
    if (playability?.status && playability.status !== 'OK') {
      const reason =
        (playability.reason as string) ||
        ((playability.errorScreen as Record<string, unknown>)?.playerErrorMessageRenderer as Record<string, unknown>)
          ?.reason as Record<string, unknown> | undefined;
      const msg =
        (typeof reason === 'object' && reason && 'simpleText' in reason
          ? String(reason.simpleText)
          : String(playability.reason || playability.status)) || 'Video unavailable';
      throw new ExtractorError(msg, { expected: true });
    }

    const formats = [
      ...parseFormats((streaming.formats as Record<string, unknown>[]) || []),
      ...parseFormats((streaming.adaptiveFormats as Record<string, unknown>[]) || []),
    ].filter((f) => !!f.url);

    if (!formats.length) {
      // Sometimes only signature cipher — report clearly
      const hasCipher = [
        ...((streaming.formats as unknown[]) || []),
        ...((streaming.adaptiveFormats as unknown[]) || []),
      ].some((f) => f && typeof f === 'object' && ('signatureCipher' in f || 'cipher' in f));
      if (hasCipher) {
        this.report_warning(
          'YouTube formats use signatureCipher; nsig decode not implemented — trying innertube android',
        );
        const android = await this._fetchInnertubePlayer(videoId, 'ANDROID');
        const sd = (android?.streamingData || {}) as Record<string, unknown>;
        formats.push(
          ...parseFormats((sd.formats as Record<string, unknown>[]) || []),
          ...parseFormats((sd.adaptiveFormats as Record<string, unknown>[]) || []),
        );
      }
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
      },
    };
  }

  private async _fetchInnertubePlayer(
    videoId: string,
    clientName: 'WEB' | 'ANDROID' = 'WEB',
  ): Promise<Record<string, unknown> | null> {
    const clients = {
      WEB: {
        clientName: 'WEB',
        clientVersion: '2.20240101.00.00',
        apiKey: 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8',
      },
      ANDROID: {
        clientName: 'ANDROID',
        clientVersion: '19.09.37',
        apiKey: 'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w',
      },
    } as const;
    const c = clients[clientName];
    const endpoint = `https://www.youtube.com/youtubei/v1/player?key=${c.apiKey}&prettyPrint=false`;
    try {
      const json = await this._download_json<Record<string, unknown>>(
        endpoint,
        videoId,
        `Downloading ${clientName} player API JSON`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-YouTube-Client-Name': clientName === 'WEB' ? '1' : '3',
            'X-YouTube-Client-Version': c.clientVersion,
            Origin: 'https://www.youtube.com',
          },
          data: JSON.stringify({
            context: {
              client: {
                clientName: c.clientName,
                clientVersion: c.clientVersion,
                hl: 'en',
                gl: 'US',
              },
            },
            videoId,
            contentCheckOk: true,
            racyCheckOk: true,
          }),
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
      const params = new URLSearchParams(it.signatureCipher);
      url = params.get('url') || undefined;
      // Without decipher, skip cipher-only
      if (params.get('s') || params.get('sig')) {
        if (!url) continue;
        // Prefer skipping unsigned cipher URLs — they usually 403
        continue;
      }
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
