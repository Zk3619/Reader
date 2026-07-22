/**
 * 跨模块音频焦点调度：可配置 pauseAll / smart（含 Ducking）+ pause 栈恢复。
 * 音乐 Hub 底栏/详情/桌面歌词共用同一引擎，不在此互斥范围内。
 * 互斥对象：音乐 / 听书 / 阅读器视频 / 影视 / 朗读。
 */

import {
  getMediaFocusConfig,
  resolveMediaFocusAction,
  type MediaFocusAction,
  type MediaFocusOwner,
} from '@/lib/media/media-focus-config';

export type PlaybackOwner = MediaFocusOwner;

export type PauseHandler = () => void | Promise<void>;
export type ResumeHandler = () => void | Promise<void>;

export interface PlaybackOwnerHandlers {
  pause: PauseHandler;
  resume?: ResumeHandler;
  /** 运行时增益倍率（1=正常）；勿持久化用户音量 */
  setDuckGain?: (factor: number) => void;
}

const handlers = new Map<PlaybackOwner, PlaybackOwnerHandlers>();
let activeOwner: PlaybackOwner | null = null;
/** 被顶替的焦点持有者（后进先出），abandon 时恢复 */
const pauseStack: PlaybackOwner[] = [];
const duckedOwners = new Set<PlaybackOwner>();

function normalizeHandlers(
  pauseOrHandlers: PauseHandler | PlaybackOwnerHandlers,
): PlaybackOwnerHandlers {
  if (typeof pauseOrHandlers === 'function') {
    return { pause: pauseOrHandlers };
  }
  return pauseOrHandlers;
}

function clearAllDucks(): void {
  for (const id of duckedOwners) {
    try {
      handlers.get(id)?.setDuckGain?.(1);
    } catch {
      /* ignore */
    }
  }
  duckedOwners.clear();
}

function pushPaused(owner: PlaybackOwner): void {
  const idx = pauseStack.indexOf(owner);
  if (idx >= 0) pauseStack.splice(idx, 1);
  pauseStack.push(owner);
}

function resolveAction(
  requester: PlaybackOwner,
  target: PlaybackOwner,
): MediaFocusAction {
  const { mode, policyOverrides } = getMediaFocusConfig();
  if (mode === 'pauseAll') return 'PAUSE';
  return resolveMediaFocusAction(requester, target, policyOverrides);
}

/**
 * @returns 实际执行的动作（DUCK 降级后可能变为 PAUSE）
 */
function applyAction(
  requester: PlaybackOwner,
  target: PlaybackOwner,
): MediaFocusAction {
  const caps = handlers.get(target);
  if (!caps) return 'NONE';

  let action = resolveAction(requester, target);
  if (action === 'NONE') return 'NONE';

  if (action === 'DUCK') {
    if (typeof caps.setDuckGain === 'function') {
      const { duckGain } = getMediaFocusConfig();
      try {
        caps.setDuckGain(duckGain);
        duckedOwners.add(target);
        return 'DUCK';
      } catch {
        action = 'PAUSE';
      }
    } else {
      action = 'PAUSE';
    }
  }

  if (action === 'PAUSE') {
    try {
      void Promise.resolve(caps.pause()).catch(() => undefined);
    } catch {
      /* ignore */
    }
    return 'PAUSE';
  }

  return action;
}

function applyDucksOnly(requester: PlaybackOwner): void {
  if (getMediaFocusConfig().mode === 'pauseAll') return;
  const { duckGain } = getMediaFocusConfig();
  for (const id of handlers.keys()) {
    if (id === requester) continue;
    if (resolveAction(requester, id) !== 'DUCK') continue;
    const caps = handlers.get(id);
    if (!caps?.setDuckGain) continue;
    try {
      caps.setDuckGain(duckGain);
      duckedOwners.add(id);
    } catch {
      /* ignore */
    }
  }
}

function resumeFromStack(): void {
  while (pauseStack.length > 0) {
    const id = pauseStack.pop()!;
    if (id === activeOwner) continue;
    const caps = handlers.get(id);
    if (!caps?.resume) continue;
    // 先占位，避免 resume→play 事件里 claimPlayback 再次打断其它路
    activeOwner = id;
    try {
      void Promise.resolve(caps.resume())
        .then(() => {
          applyDucksOnly(id);
        })
        .catch(() => undefined);
    } catch {
      /* ignore */
    }
    return;
  }
}

/** 注册某路播放器能力；卸载时取消注册 */
export function registerPlaybackOwner(
  owner: PlaybackOwner,
  pauseOrHandlers: PauseHandler | PlaybackOwnerHandlers,
): () => void {
  handlers.set(owner, normalizeHandlers(pauseOrHandlers));
  return () => {
    const current = handlers.get(owner);
    const next = normalizeHandlers(pauseOrHandlers);
    if (current?.pause === next.pause) {
      handlers.delete(owner);
    }
    const stackIdx = pauseStack.indexOf(owner);
    if (stackIdx >= 0) pauseStack.splice(stackIdx, 1);
    duckedOwners.delete(owner);
    if (activeOwner === owner) activeOwner = null;
  };
}

/** 合并更新已注册 owner 的能力（如音乐后挂 setDuckGain） */
export function updatePlaybackOwnerHandlers(
  owner: PlaybackOwner,
  partial: Partial<PlaybackOwnerHandlers>,
): void {
  const current = handlers.get(owner);
  if (!current) {
    if (partial.pause) {
      handlers.set(owner, {
        pause: partial.pause,
        resume: partial.resume,
        setDuckGain: partial.setDuckGain,
      });
    }
    return;
  }
  handlers.set(owner, {
    pause: partial.pause ?? current.pause,
    resume: partial.resume ?? current.resume,
    setDuckGain:
      'setDuckGain' in partial ? partial.setDuckGain : current.setDuckGain,
  });
}

/** 即将起播时请求焦点：按模式 pause / duck 其它播放器 */
export function requestFocus(owner: PlaybackOwner): void {
  if (activeOwner === owner) return;
  clearAllDucks();
  const previous = activeOwner;
  activeOwner = owner;

  for (const id of handlers.keys()) {
    if (id === owner) continue;
    const applied = applyAction(owner, id);
    // 仅将被顶替的上一焦点持有者入栈，避免空闲注册者误恢复
    if (id === previous && applied === 'PAUSE') {
      pushPaused(id);
    }
  }
}

/** @deprecated 兼容旧名；等同 requestFocus */
export function claimPlayback(owner: PlaybackOwner): void {
  requestFocus(owner);
}

export function getActivePlaybackOwner(): PlaybackOwner | null {
  return activeOwner;
}

/** 主动停止 / 用户暂停时放弃焦点，并按栈恢复上一路 */
export function abandonFocus(owner: PlaybackOwner): void {
  if (activeOwner !== owner) return;
  clearAllDucks();
  activeOwner = null;
  const selfIdx = pauseStack.indexOf(owner);
  if (selfIdx >= 0) pauseStack.splice(selfIdx, 1);
  resumeFromStack();
}

/** @deprecated 兼容旧名；等同 abandonFocus */
export function releasePlayback(owner: PlaybackOwner): void {
  abandonFocus(owner);
}

/** 测试用：清空焦点状态 */
export function __resetAudioFocusForTests(): void {
  handlers.clear();
  pauseStack.length = 0;
  duckedOwners.clear();
  activeOwner = null;
}
