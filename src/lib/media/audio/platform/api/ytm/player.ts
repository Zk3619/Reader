/**
 * YouTube Music 取流（InnerTube player + 解签）
 */

import type { AudioTrack } from '@/lib/media/audio/track-types';
import type { MusicQuality } from '@/lib/media/audio/lyric-types';
import { innertubePost, ytmCookies } from '@/lib/media/audio/platform/api/ytm/innertube';
import { buildStreamHeaders } from '@/lib/media/audio/platform/api/ytm/auth-headers';
import {
  applySigToUrl,
  extractPlayerJsUrl,
  parseSignatureCipher,
  resolvePlayerJsUrlFromWatch,
} from '@/lib/media/audio/platform/api/ytm/sig-solver';

export interface YtmStreamResult {
  url: string;
  headers?: Record<string, string>;
}

interface AdaptiveFormat {
  itag?: number;
  url?: string;
  signatureCipher?: string;
  cipher?: string;
  bitrate?: number;
  averageBitrate?: number;
  mimeType?: string;
  audioQuality?: string;
}

function preferBitrate(q?: MusicQuality): number {
  switch (q) {
    case 'flac24bit':
    case 'flac':
    case '320k':
      return 256_000;
    case '192k':
      return 160_000;
    default:
      return 128_000;
  }
}

function pickAudioFormat(formats: AdaptiveFormat[], quality?: MusicQuality): AdaptiveFormat | null {
  const audio = formats.filter((f) => /audio\//i.test(f.mimeType ?? '') || f.audioQuality);
  if (!audio.length) return null;
  const target = preferBitrate(quality);
  const sorted = [...audio].sort((a, b) => {
    const ba = a.averageBitrate ?? a.bitrate ?? 0;
    const bb = b.averageBitrate ?? b.bitrate ?? 0;
    return Math.abs(ba - target) - Math.abs(bb - target);
  });
  // 再优先有直链的
  return sorted.find((f) => f.url) ?? sorted[0] ?? null;
}

async function resolveFormatUrl(
  format: AdaptiveFormat,
  playerJsUrl: string | null,
): Promise<string | null> {
  if (format.url) {
    return applySigToUrl(format.url, playerJsUrl);
  }
  const cipher = format.signatureCipher ?? format.cipher;
  if (!cipher) return null;
  const parsed = parseSignatureCipher(cipher);
  if (!parsed.url) return null;
  let url = parsed.url;
  if (parsed.s && playerJsUrl) {
    const { decipherSignature } = await import('@/lib/media/audio/platform/api/ytm/sig-solver');
    const dec = await decipherSignature(playerJsUrl, parsed.s);
    if (dec) {
      const u = new URL(url);
      u.searchParams.set(parsed.sp ?? 'sig', dec);
      url = u.toString();
    }
  }
  return applySigToUrl(url, playerJsUrl);
}

export async function getYtmSongStream(
  track: AudioTrack,
  quality?: MusicQuality,
): Promise<YtmStreamResult | null> {
  const videoId = String(track.meta.videoId ?? track.meta.songId ?? '');
  if (!videoId) return null;
  const cookies = await ytmCookies();
  const headers = buildStreamHeaders(cookies);

  try {
    const body = await innertubePost<{
      streamingData?: {
        adaptiveFormats?: AdaptiveFormat[];
        formats?: AdaptiveFormat[];
      };
      playerConfig?: unknown;
      microformat?: unknown;
      responseContext?: unknown;
    }>(
      'player',
      {
        videoId,
        contentCheckOk: true,
        racyCheckOk: true,
      },
      cookies,
    );

    const formats = [
      ...(body.streamingData?.adaptiveFormats ?? []),
      ...(body.streamingData?.formats ?? []),
    ];
    const format = pickAudioFormat(formats, quality);
    if (!format) return null;

    let playerJsUrl =
      extractPlayerJsUrl(JSON.stringify(body)) ??
      (await resolvePlayerJsUrlFromWatch(videoId));

    const url = await resolveFormatUrl(format, playerJsUrl);
    if (!url) return null;
    return { url, headers };
  } catch (err) {
    console.warn('[ytm] player failed', err);
    return null;
  }
}

export async function getYtmSongUrl(track: AudioTrack): Promise<string | null> {
  const stream = await getYtmSongStream(track);
  return stream?.url ?? null;
}
