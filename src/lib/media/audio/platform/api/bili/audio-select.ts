/**
 * B 站 DASH 音频选轨
 */

import type { MusicQuality } from '@/lib/media/audio/lyric-types';

export interface BiliAudioStreamInfo {
  id?: number;
  mimeType: string;
  bitrateKbps: number;
  qualityTag: string | null;
  url: string;
  candidateUrls: string[];
}

function tagFromStream(id: number | undefined, mime: string, kbps: number): string | null {
  if (id === 30250 || /eac3|ec-3|dolby/i.test(mime)) return 'dolby';
  if (id === 30251 || /flac/i.test(mime) || kbps >= 900) return 'hires';
  if (/flac/i.test(mime) || kbps >= 400) return 'lossless';
  return null;
}

export function parseBiliDashAudio(
  audio: Array<Record<string, unknown>> | undefined,
): BiliAudioStreamInfo[] {
  if (!audio?.length) return [];
  const out: BiliAudioStreamInfo[] = [];
  for (const a of audio) {
    const url = String(a.baseUrl ?? a.base_url ?? '');
    if (!url) continue;
    const backups = [
      ...(Array.isArray(a.backupUrl) ? a.backupUrl : []),
      ...(Array.isArray(a.backup_url) ? a.backup_url : []),
    ]
      .map((u) => String(u))
      .filter(Boolean);
    const rawId = typeof a.id === 'number' ? a.id : Number(a.id);
    const id = Number.isFinite(rawId) ? rawId : undefined;
    const bandwidth = Number(a.bandwidth ?? 0);
    const kbps = Math.round(bandwidth / 1000) || 128;
    const mimeType = String(a.mimeType ?? a.mime_type ?? 'audio/mp4');
    out.push({
      id,
      mimeType,
      bitrateKbps: kbps,
      qualityTag: tagFromStream(id, mimeType, kbps),
      url,
      candidateUrls: [url, ...backups],
    });
  }
  return out;
}

function preferenceTags(q?: MusicQuality): string[] {
  switch (q) {
    case 'flac24bit':
      return ['dolby', 'hires', 'lossless', 'high', 'medium', 'low'];
    case 'flac':
      return ['lossless', 'hires', 'dolby', 'high', 'medium', 'low'];
    case '320k':
    case '192k':
      return ['high', 'lossless', 'medium', 'low'];
    default:
      return ['medium', 'high', 'low', 'lossless'];
  }
}

function streamMatchesTag(s: BiliAudioStreamInfo, tag: string): boolean {
  if (s.qualityTag === tag) return true;
  if (tag === 'high') return s.bitrateKbps >= 160 && s.bitrateKbps < 400 && !s.qualityTag;
  if (tag === 'medium') return s.bitrateKbps >= 96 && s.bitrateKbps < 160 && !s.qualityTag;
  if (tag === 'low') return s.bitrateKbps < 96 && !s.qualityTag;
  return false;
}

export function selectBiliAudioStream(
  streams: BiliAudioStreamInfo[],
  quality?: MusicQuality,
): BiliAudioStreamInfo | null {
  if (!streams.length) return null;
  const sorted = [...streams].sort((a, b) => b.bitrateKbps - a.bitrateKbps);
  for (const tag of preferenceTags(quality)) {
    const hit = sorted.find((s) => streamMatchesTag(s, tag));
    if (hit) return hit;
  }
  return sorted[0] ?? null;
}
