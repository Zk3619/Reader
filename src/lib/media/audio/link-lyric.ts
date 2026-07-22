/**
 * 关联歌词（对齐 MusicFree link-lyric / associatedLrc）
 */

import type { AudioTrack } from '@/lib/media/audio/track-types';
import { trackToMfMusicItem, mfMusicItemToTrack } from '@/lib/media/audio/online/mf-plugin/media-adapter';
import type { MfMusicItem } from '@/lib/media/audio/online/mf-plugin/types';
import { isMfSourceKey, parseMfPluginId } from '@/lib/media/audio/online/mf-plugin/types';
import { upsertAudioTrack } from '@/lib/database/audio-library';

const STORAGE_KEY = 'reader_audio_link_lyric';

export type LinkedLyricRef = {
  platform: string;
  id: string;
  title?: string;
  artist?: string;
  /** 完整 MF 项（若有） */
  mfMusicItem?: MfMusicItem;
  /** MF 插件 ID（关联 MF 曲目时） */
  mfPluginId?: string;
  /** LX 五源等歌词来源 */
  lyricSource?: AudioTrack['source'];
};

type LinkLyricStore = Record<string, LinkedLyricRef>;

function trackLinkKey(track: Pick<AudioTrack, 'id'>): string {
  return track.id;
}

function readStore(): LinkLyricStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as LinkLyricStore;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: LinkLyricStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}

const listeners = new Set<() => void>();

export function subscribeLinkLyric(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const l of listeners) l();
}

function refFromTrackMeta(track: AudioTrack): LinkedLyricRef | null {
  const raw = track.meta?.associatedLrc;
  if (!raw || typeof raw !== 'object') return null;
  const ref = raw as LinkedLyricRef;
  if (!ref.platform || !ref.id) return null;
  return ref;
}

async function persistAssociatedLrc(
  track: AudioTrack,
  ref: LinkedLyricRef | null,
): Promise<void> {
  const nextMeta = { ...track.meta };
  if (ref) nextMeta.associatedLrc = ref;
  else delete nextMeta.associatedLrc;
  const next: AudioTrack = { ...track, meta: nextMeta };
  try {
    await upsertAudioTrack(next);
  } catch {
    // ignore db errors; localStorage still holds fallback
  }
}

export function getLinkedLyricRef(track: AudioTrack): LinkedLyricRef | null {
  const fromMeta = refFromTrackMeta(track);
  if (fromMeta) return fromMeta;
  const store = readStore();
  return store[trackLinkKey(track)] ?? null;
}

export function linkLyricToTrack(
  from: AudioTrack,
  to: Pick<AudioTrack, 'id' | 'name' | 'artist' | 'source' | 'meta'> | LinkedLyricRef,
): void {
  const store = readStore();
  const target = to as AudioTrack;
  const ref: LinkedLyricRef =
    'platform' in to && 'id' in to && !('source' in to)
      ? (to as LinkedLyricRef)
      : {
          platform:
            (typeof target.meta?.mfPlatform === 'string' && target.meta.mfPlatform) ||
            String(target.source).replace(/^mf:/, '') ||
            String(target.source),
          id: String(target.meta?.songId ?? target.id),
          title: target.name,
          artist: target.artist,
          mfMusicItem: trackToMfMusicItem(target),
          mfPluginId: isMfSourceKey(String(target.source))
            ? parseMfPluginId(String(target.source)) ?? undefined
            : undefined,
          lyricSource:
            target.source !== 'local' && target.source !== 'userApi'
              ? target.source
              : undefined,
        };
  store[trackLinkKey(from)] = ref;
  writeStore(store);
  void persistAssociatedLrc(from, ref);
  notify();
}

export function unlinkLyricFromTrack(track: AudioTrack): void {
  const store = readStore();
  delete store[trackLinkKey(track)];
  writeStore(store);
  void persistAssociatedLrc(track, null);
  notify();
}

export function linkedLyricRefToTrack(ref: LinkedLyricRef, sourceTrack: AudioTrack): AudioTrack {
  if (ref.mfMusicItem && ref.mfPluginId) {
    const linked = mfMusicItemToTrack(ref.mfMusicItem, ref.mfPluginId);
    return {
      ...linked,
      meta: {
        ...linked.meta,
        linkedLyricFor: sourceTrack.id,
      },
    };
  }
  if (ref.mfMusicItem) {
    return {
      ...sourceTrack,
      id: `${sourceTrack.id}__linked_lyric`,
      name: ref.title ?? ref.mfMusicItem.title ?? sourceTrack.name,
      artist: ref.artist ?? ref.mfMusicItem.artist ?? sourceTrack.artist,
      meta: {
        ...sourceTrack.meta,
        mfMusicItem: ref.mfMusicItem,
        mfPlatform: ref.platform,
        songId: ref.id,
        linkedLyricFor: sourceTrack.id,
      },
    };
  }
  const lyricSource = ref.lyricSource;
  if (lyricSource && lyricSource !== 'local' && lyricSource !== 'userApi') {
    return {
      ...sourceTrack,
      id: `${sourceTrack.id}__linked_lyric`,
      name: ref.title ?? sourceTrack.name,
      artist: ref.artist ?? sourceTrack.artist,
      source: lyricSource,
      meta: {
        ...sourceTrack.meta,
        mfPlatform: ref.platform,
        songId: ref.id,
        linkedLyricFor: sourceTrack.id,
      },
    };
  }
  return {
    ...sourceTrack,
    id: `${sourceTrack.id}__linked_lyric`,
    meta: {
      ...sourceTrack.meta,
      mfPlatform: ref.platform,
      songId: ref.id,
      linkedLyricFor: sourceTrack.id,
    },
  };
}

export function exportLinkLyricStore(): LinkLyricStore {
  return readStore();
}

export function importLinkLyricStore(store: LinkLyricStore, merge = true): void {
  if (merge) {
    writeStore({ ...readStore(), ...store });
  } else {
    writeStore(store);
  }
  notify();
}
