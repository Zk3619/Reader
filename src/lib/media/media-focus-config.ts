/**
 * 跨模块媒体焦点：模式与策略表（可由主程序设置覆盖）
 */

export type MediaFocusMode = 'pauseAll' | 'smart';

export type MediaFocusOwner = 'music' | 'audiobook' | 'readAloud' | 'video' | 'tv';

export type MediaFocusAction = 'PAUSE' | 'DUCK' | 'NONE';

export type MediaFocusPolicyOverrides = Partial<
  Record<MediaFocusOwner, Partial<Record<MediaFocusOwner, MediaFocusAction>>>
>;

export const DEFAULT_MEDIA_FOCUS_MODE: MediaFocusMode = 'smart';
export const DEFAULT_MEDIA_FOCUS_DUCK_GAIN = 0.2;
export const MEDIA_FOCUS_DUCK_GAIN_MIN = 0.05;
export const MEDIA_FOCUS_DUCK_GAIN_MAX = 0.5;

/** 内置默认矩阵：仅 smart 模式使用；pauseAll 一律 PAUSE */
export const DEFAULT_MEDIA_FOCUS_POLICY: Record<
  MediaFocusOwner,
  Partial<Record<MediaFocusOwner, MediaFocusAction>>
> = {
  video: {
    music: 'PAUSE',
    audiobook: 'PAUSE',
    readAloud: 'PAUSE',
    tv: 'PAUSE',
  },
  tv: {
    music: 'PAUSE',
    audiobook: 'PAUSE',
    readAloud: 'PAUSE',
    video: 'PAUSE',
  },
  audiobook: {
    music: 'PAUSE',
    readAloud: 'PAUSE',
    video: 'PAUSE',
    tv: 'PAUSE',
  },
  music: {
    audiobook: 'PAUSE',
    readAloud: 'PAUSE',
    video: 'PAUSE',
    tv: 'PAUSE',
  },
  readAloud: {
    music: 'DUCK',
    audiobook: 'PAUSE',
    video: 'PAUSE',
    tv: 'PAUSE',
  },
};

export const MEDIA_FOCUS_OWNERS: readonly MediaFocusOwner[] = [
  'music',
  'audiobook',
  'readAloud',
  'video',
  'tv',
] as const;

export const MEDIA_FOCUS_OWNER_LABELS: Record<MediaFocusOwner, string> = {
  music: '音乐',
  audiobook: '听书',
  readAloud: '朗读',
  video: '阅读器视频',
  tv: '影视',
};

export const MEDIA_FOCUS_ACTIONS: readonly MediaFocusAction[] = [
  'PAUSE',
  'DUCK',
  'NONE',
] as const;

export const MEDIA_FOCUS_ACTION_LABELS: Record<MediaFocusAction, string> = {
  PAUSE: '暂停',
  DUCK: '闪避',
  NONE: '忽略',
};

export interface MediaFocusConfigSnapshot {
  mode: MediaFocusMode;
  duckGain: number;
  policyOverrides: MediaFocusPolicyOverrides;
}

const DEFAULT_SNAPSHOT: MediaFocusConfigSnapshot = {
  mode: DEFAULT_MEDIA_FOCUS_MODE,
  duckGain: DEFAULT_MEDIA_FOCUS_DUCK_GAIN,
  policyOverrides: {},
};

let snapshot: MediaFocusConfigSnapshot = { ...DEFAULT_SNAPSHOT, policyOverrides: {} };

const listeners = new Set<(next: MediaFocusConfigSnapshot) => void>();

function isFocusMode(value: unknown): value is MediaFocusMode {
  return value === 'pauseAll' || value === 'smart';
}

function isFocusAction(value: unknown): value is MediaFocusAction {
  return value === 'PAUSE' || value === 'DUCK' || value === 'NONE';
}

function isFocusOwner(value: unknown): value is MediaFocusOwner {
  return (
    value === 'music' ||
    value === 'audiobook' ||
    value === 'readAloud' ||
    value === 'video' ||
    value === 'tv'
  );
}

export function normalizeMediaFocusDuckGain(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_MEDIA_FOCUS_DUCK_GAIN;
  }
  return Math.max(
    MEDIA_FOCUS_DUCK_GAIN_MIN,
    Math.min(MEDIA_FOCUS_DUCK_GAIN_MAX, value),
  );
}

export function normalizeMediaFocusMode(value: unknown): MediaFocusMode {
  return isFocusMode(value) ? value : DEFAULT_MEDIA_FOCUS_MODE;
}

export function normalizeMediaFocusPolicyOverrides(
  value: unknown,
): MediaFocusPolicyOverrides {
  if (!value || typeof value !== 'object') return {};
  const out: MediaFocusPolicyOverrides = {};
  for (const [rawRequester, targets] of Object.entries(value as Record<string, unknown>)) {
    if (!isFocusOwner(rawRequester) || !targets || typeof targets !== 'object') continue;
    const row: Partial<Record<MediaFocusOwner, MediaFocusAction>> = {};
    for (const [rawTarget, action] of Object.entries(targets as Record<string, unknown>)) {
      if (!isFocusOwner(rawTarget) || rawTarget === rawRequester) continue;
      if (!isFocusAction(action)) continue;
      row[rawTarget] = action;
    }
    if (Object.keys(row).length > 0) out[rawRequester] = row;
  }
  return out;
}

export function resolveMediaFocusAction(
  requester: MediaFocusOwner,
  target: MediaFocusOwner,
  overrides: MediaFocusPolicyOverrides = snapshot.policyOverrides,
): MediaFocusAction {
  if (requester === target) return 'NONE';
  const overridden = overrides[requester]?.[target];
  if (overridden) return overridden;
  return DEFAULT_MEDIA_FOCUS_POLICY[requester]?.[target] ?? 'PAUSE';
}

export function getMediaFocusConfig(): Readonly<MediaFocusConfigSnapshot> {
  return snapshot;
}

export function setMediaFocusConfig(next: {
  mode?: MediaFocusMode;
  duckGain?: number;
  policyOverrides?: MediaFocusPolicyOverrides;
}): void {
  snapshot = {
    mode: next.mode ?? snapshot.mode,
    duckGain:
      next.duckGain !== undefined
        ? normalizeMediaFocusDuckGain(next.duckGain)
        : snapshot.duckGain,
    policyOverrides:
      next.policyOverrides !== undefined
        ? normalizeMediaFocusPolicyOverrides(next.policyOverrides)
        : snapshot.policyOverrides,
  };
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch {
      /* ignore */
    }
  }
}

/** 由设置水合 / 更新时同步运行时快照 */
export function syncMediaFocusConfigFromSettings(input: {
  mediaFocusMode?: unknown;
  mediaFocusDuckGain?: unknown;
  mediaFocusPolicyOverrides?: unknown;
}): void {
  setMediaFocusConfig({
    mode: normalizeMediaFocusMode(input.mediaFocusMode),
    duckGain: normalizeMediaFocusDuckGain(input.mediaFocusDuckGain),
    policyOverrides: normalizeMediaFocusPolicyOverrides(input.mediaFocusPolicyOverrides),
  });
}

export function subscribeMediaFocusConfig(
  listener: (next: MediaFocusConfigSnapshot) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
