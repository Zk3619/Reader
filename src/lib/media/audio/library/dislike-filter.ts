/**
 * dislike 规则过滤
 */

import { listDislikeRules } from '@/lib/database/audio-library';
import type { AudioTrack } from '@/lib/media/audio/track-types';

let cachedRules: Awaited<ReturnType<typeof listDislikeRules>> | null = null;
let cacheAt = 0;
const CACHE_TTL = 30_000;

async function getRules() {
  const now = Date.now();
  if (cachedRules && now - cacheAt < CACHE_TTL) return cachedRules;
  cachedRules = await listDislikeRules();
  cacheAt = now;
  return cachedRules;
}

export function invalidateDislikeRulesCache(): void {
  cachedRules = null;
}

function matchField(track: AudioTrack, field: string, pattern: string): boolean {
  if (!pattern.trim()) return false;
  const re = new RegExp(pattern, 'i');
  switch (field) {
    case 'name':
      return re.test(track.name);
    case 'artist':
      return re.test(track.artist);
    case 'source':
      return re.test(track.source);
    default:
      return re.test(track.name) || re.test(track.artist) || re.test(track.source);
  }
}

export async function isTrackDisliked(track: AudioTrack): Promise<boolean> {
  const rules = await getRules();
  return rules.some((r) => matchField(track, r.field, r.pattern));
}

export async function filterDislikedTracks(tracks: AudioTrack[]): Promise<AudioTrack[]> {
  const rules = await getRules();
  if (rules.length === 0) return tracks;
  const out: AudioTrack[] = [];
  for (const track of tracks) {
    if (!rules.some((r) => matchField(track, r.field, r.pattern))) {
      out.push(track);
    }
  }
  return out;
}
