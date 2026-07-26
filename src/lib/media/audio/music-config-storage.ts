/**
 * 音乐长期配置：settings.json（getStorage）+ sessionStorage peek
 */

import { getStorage, setStorage } from '@/lib/platform/storage';
import type { AudioPlayConfig } from '@/lib/media/audio/types';
import { AudioPlayMode, DEFAULT_PLAY_SPEED } from '@/lib/media/audio/types';
import {
  clampPlaySpeed,
  normalizePlayMode,
} from '@/lib/media/audio/book-audio-config';
import {
  DEFAULT_MUSIC_HOTKEYS,
  normalizeMusicHotkeys,
  type MusicHotkeys,
} from '@/lib/media/audio/platform/music-hotkeys';
import type { MusicHubSection } from '@/stores/viewer/base-state';

export const MUSIC_CONFIG_STORAGE_KEY = 'music_config_v1';
const SESSION_MIRROR_KEY = 'music_config_v1_mirror';
const LEGACY_SETTINGS_KEY = 'reader_music_settings';
const LEGACY_PLAY_CONFIG_KEY = 'reader_music_play_config';
const LEGACY_HOTKEYS_KEY = 'reader.music.hotkeys';
const LEGACY_HUB_SECTION_KEY = 'reader_music_hub_section';
const LEGACY_SEARCH_HISTORY_KEY = 'reader.music.searchHistory';
const LEGACY_GAIN_KEY = 'reader_web_audio_gain';
const WEB_STORAGE_PREFIX = 'store_settings.json_';

export const MUSIC_CONFIG_VERSION = 1;

export interface MusicConfigSnapshot {
  version: typeof MUSIC_CONFIG_VERSION;
  /** 归一化后的 MusicSettings JSON */
  settings: Record<string, unknown>;
  playConfig: AudioPlayConfig;
  hotkeys: MusicHotkeys;
  volumeGain: number;
  hubSection: MusicHubSection;
  searchHistory: string[];
}

type SettingsNormalizer = (input: unknown) => Record<string, unknown>;

let settingsNormalizer: SettingsNormalizer | null = null;
let cached: MusicConfigSnapshot | null = null;
/** patch 代数：warm 期间若发生过 patch，禁止用过期 getStorage 结果覆盖内存 */
let configPatchEpoch = 0;

export function bindMusicSettingsNormalizer(fn: SettingsNormalizer): void {
  settingsNormalizer = fn;
}

function normalizeSettingsBlob(input: unknown): Record<string, unknown> {
  if (settingsNormalizer) {
    return settingsNormalizer(input);
  }
  if (input && typeof input === 'object') return input as Record<string, unknown>;
  return {};
}

function normalizeSection(section: unknown): MusicHubSection {
  switch (section) {
    case 'recommend':
    case 'search':
    case 'songlist':
    case 'leaderboard':
    case 'artist':
    case 'album':
    case 'list':
    case 'download':
    case 'settings':
    case 'nowPlaying':
      return section;
    default:
      // 无持久化记录时首次进入落在推荐页
      return 'recommend';
  }
}

function readPlayConfigLegacy(): AudioPlayConfig {
  try {
    const raw = localStorage.getItem(LEGACY_PLAY_CONFIG_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<AudioPlayConfig>) : {};
    return {
      openCredits: 0,
      closeCredits: 0,
      playMode: normalizePlayMode(parsed.playMode ?? AudioPlayMode.listLoop),
      playSpeed: clampPlaySpeed(
        typeof parsed.playSpeed === 'number' ? parsed.playSpeed : DEFAULT_PLAY_SPEED,
      ),
    };
  } catch {
    return {
      openCredits: 0,
      closeCredits: 0,
      playMode: AudioPlayMode.listLoop,
      playSpeed: DEFAULT_PLAY_SPEED,
    };
  }
}

function readLegacySnapshot(): MusicConfigSnapshot {
  let settings: Record<string, unknown> = {};
  try {
    const raw = localStorage.getItem(LEGACY_SETTINGS_KEY);
    if (raw) settings = normalizeSettingsBlob(JSON.parse(raw));
    else settings = normalizeSettingsBlob({});
  } catch {
    settings = normalizeSettingsBlob({});
  }
  let hotkeys = normalizeMusicHotkeys(null);
  try {
    const raw = localStorage.getItem(LEGACY_HOTKEYS_KEY);
    hotkeys = normalizeMusicHotkeys(raw ? JSON.parse(raw) : null);
  } catch {
    /* */
  }
  let volumeGain = 1;
  try {
    const g = Number(localStorage.getItem(LEGACY_GAIN_KEY));
    if (Number.isFinite(g) && g > 0) volumeGain = g;
  } catch {
    /* */
  }
  let hubSection: MusicHubSection = 'recommend';
  try {
    hubSection = normalizeSection(localStorage.getItem(LEGACY_HUB_SECTION_KEY));
  } catch {
    /* */
  }
  let searchHistory: string[] = [];
  try {
    const raw = localStorage.getItem(LEGACY_SEARCH_HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        searchHistory = parsed.filter((x): x is string => typeof x === 'string');
      }
    }
  } catch {
    /* */
  }
  return {
    version: MUSIC_CONFIG_VERSION,
    settings,
    playConfig: readPlayConfigLegacy(),
    hotkeys,
    volumeGain,
    hubSection,
    searchHistory,
  };
}

function mirrorToSession(snap: MusicConfigSnapshot): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(SESSION_MIRROR_KEY, JSON.stringify(snap));
  } catch {
    /* */
  }
}

function readSessionMirror(): MusicConfigSnapshot | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SESSION_MIRROR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MusicConfigSnapshot;
    if (!parsed || parsed.version !== MUSIC_CONFIG_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function mirrorLegacyLs(snap: MusicConfigSnapshot): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LEGACY_SETTINGS_KEY, JSON.stringify(snap.settings));
    localStorage.setItem(LEGACY_PLAY_CONFIG_KEY, JSON.stringify(snap.playConfig));
    localStorage.setItem(LEGACY_HOTKEYS_KEY, JSON.stringify(snap.hotkeys));
    localStorage.setItem(LEGACY_GAIN_KEY, String(snap.volumeGain));
    localStorage.setItem(LEGACY_HUB_SECTION_KEY, snap.hubSection);
    localStorage.setItem(LEGACY_SEARCH_HISTORY_KEY, JSON.stringify(snap.searchHistory));
  } catch {
    /* */
  }
}

export function peekMusicConfigSync(): MusicConfigSnapshot {
  if (cached) return cached;
  const session = readSessionMirror();
  if (session) {
    cached = {
      ...session,
      settings: normalizeSettingsBlob(session.settings),
      hubSection: normalizeSection(session.hubSection),
    };
    return cached;
  }
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(`${WEB_STORAGE_PREFIX}${MUSIC_CONFIG_STORAGE_KEY}`);
      if (raw) {
        const parsed = JSON.parse(raw) as MusicConfigSnapshot;
        if (parsed?.version === MUSIC_CONFIG_VERSION) {
          cached = {
            ...parsed,
            settings: normalizeSettingsBlob(parsed.settings),
            hubSection: normalizeSection(parsed.hubSection),
          };
          mirrorToSession(cached);
          return cached;
        }
      }
    } catch {
      /* */
    }
  }
  cached = readLegacySnapshot();
  return cached;
}

export function getMusicConfigCache(): MusicConfigSnapshot {
  return peekMusicConfigSync();
}

export async function warmMusicConfigCache(): Promise<MusicConfigSnapshot> {
  const epochAtStart = configPatchEpoch;
  const preWarmCached = cached;
  try {
    const stored = await getStorage<MusicConfigSnapshot>(MUSIC_CONFIG_STORAGE_KEY);
    // await 期间若已有 patch（如切换分区/来源），保留内存权威并回写，避免旧快照冲掉
    if (configPatchEpoch !== epochAtStart && preWarmCached) {
      cached = preWarmCached;
      mirrorToSession(preWarmCached);
      mirrorLegacyLs(preWarmCached);
      try {
        await setStorage(MUSIC_CONFIG_STORAGE_KEY, preWarmCached);
      } catch (e) {
        console.warn('[music-config] re-save after warm race failed', e);
      }
      return preWarmCached;
    }
    if (stored?.version === MUSIC_CONFIG_VERSION) {
      let next: MusicConfigSnapshot = {
        ...stored,
        settings: normalizeSettingsBlob(stored.settings),
        hotkeys: normalizeMusicHotkeys(stored.hotkeys),
        hubSection: normalizeSection(stored.hubSection),
        searchHistory: Array.isArray(stored.searchHistory) ? stored.searchHistory : [],
        playConfig: {
          openCredits: 0,
          closeCredits: 0,
          playMode: normalizePlayMode(stored.playConfig?.playMode ?? AudioPlayMode.listLoop),
          playSpeed: clampPlaySpeed(stored.playConfig?.playSpeed ?? DEFAULT_PLAY_SPEED),
        },
      };
      // LS 是同步镜像：刷新可能打断异步 setStorage，导致 settings.json 落后于 LS
      next = reconcileWithSyncLegacyMirror(next);
      cached = next;
      mirrorToSession(next);
      mirrorLegacyLs(next);
      if (JSON.stringify(next) !== JSON.stringify({ ...stored, version: MUSIC_CONFIG_VERSION })) {
        try {
          await setStorage(MUSIC_CONFIG_STORAGE_KEY, next);
        } catch (e) {
          console.warn('[music-config] heal lagging store failed', e);
        }
      }
      return next;
    }
  } catch (e) {
    console.warn('[music-config] load failed', e);
  }
  if (configPatchEpoch !== epochAtStart && preWarmCached) {
    cached = preWarmCached;
    mirrorToSession(preWarmCached);
    mirrorLegacyLs(preWarmCached);
    try {
      await setStorage(MUSIC_CONFIG_STORAGE_KEY, preWarmCached);
    } catch (e) {
      console.warn('[music-config] re-save after warm race failed', e);
    }
    return preWarmCached;
  }
  const legacy = readLegacySnapshot();
  cached = legacy;
  mirrorToSession(legacy);
  mirrorLegacyLs(legacy);
  try {
    await setStorage(MUSIC_CONFIG_STORAGE_KEY, legacy);
  } catch (e) {
    console.warn('[music-config] migrate write failed', e);
  }
  return legacy;
}

/** 用同步 LS 镜像修补可能落后的 settings.json 快照 */
function reconcileWithSyncLegacyMirror(snap: MusicConfigSnapshot): MusicConfigSnapshot {
  if (typeof localStorage === 'undefined') return snap;
  let next = snap;
  try {
    const lsSection = localStorage.getItem(LEGACY_HUB_SECTION_KEY);
    if (lsSection) {
      const normalized = normalizeSection(lsSection);
      if (normalized !== next.hubSection) {
        next = { ...next, hubSection: normalized };
      }
    }
  } catch {
    /* */
  }
  try {
    const raw = localStorage.getItem(LEGACY_SETTINGS_KEY);
    if (!raw) return next;
    const lsSettings = JSON.parse(raw) as Record<string, unknown>;
    if (!lsSettings || typeof lsSettings !== 'object') return next;
    const preferKeys = [
      'defaultSource',
      'defaultSearchTab',
      'musicSongListBrowseSource',
      'musicSingerListSource',
      'musicAlbumListSource',
      'musicSearchSourceControl',
      'musicSearchTabControl',
      'musicSearchPaginationPreference',
    ] as const;
    const overlay: Record<string, unknown> = {};
    let changed = false;
    for (const key of preferKeys) {
      const lsVal = lsSettings[key];
      if (lsVal === undefined) continue;
      if (JSON.stringify(lsVal) !== JSON.stringify(next.settings[key])) {
        overlay[key] = lsVal;
        changed = true;
      }
    }
    if (changed) {
      next = {
        ...next,
        settings: normalizeSettingsBlob({ ...next.settings, ...overlay }),
      };
    }
  } catch {
    /* */
  }
  return next;
}

export function patchMusicConfig(
  partial: Partial<Omit<MusicConfigSnapshot, 'version'>>,
): MusicConfigSnapshot {
  const cur = peekMusicConfigSync();
  const next: MusicConfigSnapshot = {
    ...cur,
    ...partial,
    version: MUSIC_CONFIG_VERSION,
    settings: partial.settings
      ? normalizeSettingsBlob(partial.settings)
      : cur.settings,
    hotkeys: partial.hotkeys
      ? normalizeMusicHotkeys(partial.hotkeys)
      : cur.hotkeys,
    hubSection: partial.hubSection
      ? normalizeSection(partial.hubSection)
      : cur.hubSection,
    searchHistory: partial.searchHistory ?? cur.searchHistory,
    playConfig: partial.playConfig ?? cur.playConfig,
    volumeGain: partial.volumeGain ?? cur.volumeGain,
  };
  cached = next;
  configPatchEpoch += 1;
  mirrorToSession(next);
  mirrorLegacyLs(next);
  void setStorage(MUSIC_CONFIG_STORAGE_KEY, next).catch((e) => {
    console.warn('[music-config] patch save failed', e);
  });
  return next;
}

export async function saveMusicConfigSnapshot(snap: MusicConfigSnapshot): Promise<void> {
  const next = patchMusicConfig(snap);
  try {
    await setStorage(MUSIC_CONFIG_STORAGE_KEY, next);
  } catch (e) {
    console.warn('[music-config] save failed', e);
  }
}

export { DEFAULT_MUSIC_HOTKEYS };
