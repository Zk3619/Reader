/**
 * Artplayer 弹幕插件封装 —— 对齐官方用法
 * @see https://artplayer.org/document/plugin/danmuku.html
 *
 * 调度完全交给插件原生 readys（±0.1s）与 antiOverlap 分布；
 * 我们只做：时间字段规范化、过大库软采样、密度/区域 prefs、播放器面板扩展。
 *
 * 不再劫持 readys / 追赶窗 / 永久删队列（那些会破坏时间对齐）。
 */

import Artplayer from 'artplayer';
import type { Danmu } from 'artplayer-plugin-danmuku';
import artplayerPluginDanmuku from 'artplayer-plugin-danmuku';
import { sampleDanmakuEvenly } from '@/lib/media/video/danmaku/sample';
import {
  ARTPLAYER_DANMAKU_SPEED_OPTION,
  DANMAKU_DENSITY_OPTIONS,
  danmakuPrefsToArtplayerOpts,
  getDanmakuPrefs,
  marginToDanmakuArea,
  nearestDanmakuSpeedStep,
  resolveArtplayerFontSize,
  resolveDanmakuSpeedFactor,
  resolveEffectiveDanmakuDensity,
  setDanmakuPrefs,
  type DanmakuDensity,
} from '@/lib/media/video/danmaku/danmaku-prefs';
import { pickDanmuTop } from '@/lib/media/video/danmaku/pick-danmu-top';
import { normalizeDanmuForArtplayer } from '@/lib/media/video/danmaku/to-artplayer';
import { lucideIconHtml } from '@/lib/media/video/artplayer/lucide-icons';
import { showAppToast } from '@/components/shared/AppToasts';

export type ArtDanmukuPlugin = {
  name?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emit?: (...args: any[]) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  load?: (...args: any[]) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config?: (...args: any[]) => any;
  hide?: () => unknown;
  show?: () => unknown;
  reset?: () => unknown;
  option?: unknown;
  isHide?: boolean;
  isStop?: boolean;
};

type DanmuQueueItem = Danmu & {
  $state: string;
  $index: number;
  $ref: HTMLElement | null;
  $restTime: number;
  $lastStartTime: number;
};

type DanmukuInstance = {
  art: Artplayer;
  queue: DanmuQueueItem[];
  states: {
    wait: DanmuQueueItem[];
    ready: DanmuQueueItem[];
    emit: DanmuQueueItem[];
    stop: DanmuQueueItem[];
  };
  option: {
    color?: string;
    mode?: number;
    filter?: (d: Danmu) => boolean;
    danmuku?: unknown;
    speed?: number;
    fontSize?: number | string;
    synchronousPlayback?: boolean;
  };
  index: number;
  isStop?: boolean;
  $refs: HTMLElement[];
  $danmuku: HTMLElement;
  $player: HTMLElement;
  filter: (state: string, cb: (d: DanmuQueueItem) => void) => void;
  setState: (danmu: DanmuQueueItem, state: string) => void;
  reset: () => void;
  makeWait: (danmu: DanmuQueueItem) => void;
  emit: (danmu: Danmu) => Promise<unknown> | unknown;
  load: (danmuku?: unknown) => Promise<unknown>;
  getLeft: ($ref: HTMLElement) => number;
  postMessage?: (message?: Record<string, unknown>) => Promise<{ result?: unknown }>;
};

const instanceByArt = new WeakMap<Artplayer, DanmukuInstance>();

/**
 * 播放器层软上限：过大库拖慢原生每帧 wait 扫描。
 * 按密度分档；0 = 不在此层再裁。
 */
function resolveArtQueueSoftCap(density: DanmakuDensity = resolveEffectiveDanmakuDensity()): number {
  if (density === 'less') return 6_000;
  if (density === 'more') return 20_000;
  return 12_000;
}

export function getArtDanmukuPlugin(art: Artplayer | null | undefined): ArtDanmukuPlugin | null {
  if (!art) return null;
  return (
    (
      art.plugins as {
        artplayerPluginDanmuku?: ArtDanmukuPlugin;
      }
    )?.artplayerPluginDanmuku ?? null
  );
}

function isDanmukuInstance(v: unknown): v is DanmukuInstance {
  if (!v || typeof v !== 'object') return false;
  const o = v as Partial<DanmukuInstance>;
  return (
    Array.isArray(o.queue) &&
    !!o.states &&
    Array.isArray(o.states.wait) &&
    typeof o.filter === 'function' &&
    typeof o.setState === 'function' &&
    typeof o.makeWait === 'function'
  );
}

/**
 * 安装弹幕插件（官方路径 + 轻量修补）：
 * - 捕获实例仅用于快速入队（避免上万次 await emit）
 * - 不改 readys / makeWait / 时间窗
 * - emit：区分「库弹幕 time=0」与「用户发送无 time」
 */
export function installArtDanmukuPlugin(
  option: Parameters<typeof artplayerPluginDanmuku>[0],
): (art: Artplayer) => ArtDanmukuPlugin {
  return (art: Artplayer) => {
    const box: { inst: DanmukuInstance | null } = { inst: null };
    const origBind = Function.prototype.bind;
    Function.prototype.bind = function bindPatched(
      this: unknown,
      thisArg: unknown,
      ...args: unknown[]
    ) {
      if (isDanmukuInstance(thisArg)) {
        box.inst = thisArg;
      }
      return (origBind as typeof Function.prototype.bind).call(
        this as CallableFunction,
        thisArg,
        ...(args as []),
      );
    };
    let api: ArtDanmukuPlugin;
    try {
      api = artplayerPluginDanmuku(option)(art) as unknown as ArtDanmukuPlugin;
    } finally {
      Function.prototype.bind = origBind;
    }

    const captured = box.inst;
    if (captured) {
      instanceByArt.set(art, captured);
      patchEmitTimeSemantics(captured);
      patchDanmuTopPicker(captured);
      patchFontSizeNoReset(captured);
      patchRuntimeSpeedFactor(captured);
      patchMarginBottomForSubtitle(captured);
      mountDanmakuHoverCopy(art, captured);
    } else {
      console.warn('[tv-danmaku] instance capture failed; using stock plugin only');
    }

    mountDanmakuDensityPanel(art);
    mountDanmakuRematchButton(art);
    mountDanmakuExtraPrefs(art);

    const rawLoad = api.load?.bind(api);
    if (rawLoad) {
      api.load = async (danmuku?: unknown) => {
        const target = danmuku !== undefined ? danmuku : (captured?.option.danmuku ?? option.danmuku);

        if (typeof target === 'string') {
          await rawLoad(target);
          return api;
        }

        let list: Danmu[] = [];
        if (typeof target === 'function') {
          list = (await target()) as Danmu[];
        } else if (
          target &&
          typeof target === 'object' &&
          typeof (target as { then?: unknown }).then === 'function'
        ) {
          list = (await (target as Promise<Danmu[]>)) as Danmu[];
        } else if (Array.isArray(target)) {
          list = target as Danmu[];
        }

        const prepared = prepareDanmuList(list);
        if (captured) {
          // 快速入队：与官方 emit 入 wait 等价，但不逐条 await
          bulkEnqueueWait(captured, prepared);
          return api;
        }
        await rawLoad(prepared);
        return api;
      };
    }

    // 插件对外暴露的是 config.bind(原方法)；必须接到打过补丁的 inst.config，
    // 否则 applyArtDanmakuVisualPrefs / 面板改字号会走原版 → fontSize 触发 reset 清屏。
    const instConfig =
      captured &&
      (
        captured as DanmukuInstance & {
          config?: (option?: Record<string, unknown>, isInit?: boolean) => unknown;
        }
      ).config?.bind(captured);
    const rawConfig = instConfig ?? api.config?.bind(api);
    if (rawConfig) {
      api.config = (opt: Record<string, unknown>) => {
        const next: Record<string, unknown> = Array.isArray(opt.danmuku)
          ? { ...opt, danmuku: prepareDanmuList(opt.danmuku as Danmu[]) }
          : { ...opt };
        if (typeof next.speed === 'number') {
          next.speed = nearestDanmakuSpeedStep(next.speed).value;
        }
        return rawConfig(next);
      };
    }

    return api;
  };
}

/**
 * 改字号时插件默认会 reset() 清空屏上弹幕并卡住设置面板。
 * 仅更新 option.fontSize：已上屏保持原字号，后续新弹幕用新字号。
 */
function patchFontSizeNoReset(inst: DanmukuInstance): void {
  try {
    const instAny = inst as DanmukuInstance & {
      config?: (option?: Record<string, unknown>, isInit?: boolean) => unknown;
    };
    const origConfig = instAny.config?.bind(inst);
    if (!origConfig) return;
    instAny.config = (option: Record<string, unknown> = {}, isInit = false) => {
      const hasFs = Object.prototype.hasOwnProperty.call(option, 'fontSize');
      const fs = option.fontSize;
      if (hasFs && !isInit) {
        const keys = Object.keys(option);
        if (keys.length === 1) {
          (inst.option as { fontSize?: number | string }).fontSize = fs as
            | number
            | string;
          try {
            inst.art.emit('artplayerPluginDanmuku:config', inst.option);
          } catch {
            /* */
          }
          // 刷新面板右侧读数（插件 slider 已先写了，这里兜底）
          try {
            const player = (inst.art.template as { $player?: HTMLElement }).$player;
            const $val = player?.querySelector('.apd-config-font-size .apd-value');
            if ($val && typeof fs === 'number') $val.textContent = `${fs}px`;
          } catch {
            /* */
          }
          return inst;
        }
        const rest = { ...option };
        delete rest.fontSize;
        const result = origConfig(rest, isInit);
        (inst.option as { fontSize?: number | string }).fontSize = fs as
          | number
          | string;
        return result;
      }
      return origConfig(option, isInit);
    };
  } catch (e) {
    console.warn('[tv-danmaku] patchFontSizeNoReset failed', e);
  }
}

function refreshSpeedPanelUi(art: Artplayer | null | undefined, speed: number): void {
  if (!art) return;
  try {
    const step = nearestDanmakuSpeedStep(speed);
    const idx = ARTPLAYER_DANMAKU_SPEED_OPTION.steps.findIndex(
      (s) => s.value === step.value,
    );
    const player = (art.template as { $player?: HTMLElement }).$player;
    const root = player?.querySelector('.apd-config-speed') as HTMLElement | null;
    if (!root) return;
    const $val = root.querySelector('.apd-value');
    if ($val) $val.textContent = step.name;
    if (idx >= 0) {
      const $dot = root.querySelector('.apd-slider-dot') as HTMLElement | null;
      if ($dot) {
        $dot.style.left = `${(idx / Math.max(1, ARTPLAYER_DANMAKU_SPEED_OPTION.max)) * 100}%`;
      }
    }
  } catch {
    /* */
  }
}

/**
 * 较多/重叠：缩短实际 restTime，但不改 option.speed（面板档位保持精确匹配）。
 */
function patchRuntimeSpeedFactor(inst: DanmukuInstance): void {
  try {
    const proto = Object.getPrototypeOf(inst) as {
      speed?: PropertyDescriptor | number;
    };
    const desc = Object.getOwnPropertyDescriptor(proto, 'speed');
    if (!desc?.get) return;
    const origGet = desc.get;
    Object.defineProperty(inst, 'speed', {
      configurable: true,
      enumerable: false,
      get() {
        const base = Number(origGet.call(inst)) || 5;
        const factor = resolveDanmakuSpeedFactor();
        return factor > 1 ? base / factor : base;
      },
    });
  } catch (e) {
    console.warn('[tv-danmaku] patchRuntimeSpeedFactor failed', e);
  }
}

/** 规范化 + 密度感知软采样 */
export function prepareDanmuList(list: Danmu[]): Danmu[] {
  const normalized = normalizeDanmuForArtplayer(list);
  const cap = resolveArtQueueSoftCap();
  if (normalized.length <= cap) return normalized;
  const sampled = sampleDanmakuEvenly(normalized, cap);
  console.info('[tv-danmaku] soft-sampled for artplayer', {
    from: normalized.length,
    to: sampled.length,
    cap,
  });
  return sampled;
}

/**
 * 插件 `if (danmu.time)` 会把 0 当成无时间 → currentTime+0.5。
 * 库弹幕 time=0 改为 0.001；真正缺 time 的用户发送仍走官方「当前+0.5」。
 */
function patchEmitTimeSemantics(inst: DanmukuInstance): void {
  const orig = inst.emit.bind(inst);
  inst.emit = (danmu: Danmu & { time?: number }) => {
    if (danmu && Object.prototype.hasOwnProperty.call(danmu, 'time')) {
      const t = Number(danmu.time);
      if (Number.isFinite(t) && t <= 0) {
        danmu.time = 0.001;
      }
    }
    return orig(danmu);
  };
}

/**
 * 拦截 getDanmuTop：在可用空隙/复用行中随机选轨，缓解上密下空与斜阶梯。
 */
function patchDanmuTopPicker(inst: DanmukuInstance): void {
  const orig = inst.postMessage?.bind(inst);
  if (!orig) return;
  inst.postMessage = async (message: Record<string, unknown> = {}) => {
    if (message.type === 'getDanmuTop') {
      try {
        const result = pickDanmuTop({
          target: message.target as {
            mode: number;
            height: number;
            speed: number;
          },
          visibles: (message.visibles as []) ?? [],
          clientWidth: Number(message.clientWidth) || 0,
          clientHeight: Number(message.clientHeight) || 0,
          marginBottom: Number(message.marginBottom) || 0,
          marginTop: Number(message.marginTop) || 0,
          antiOverlap: Boolean(message.antiOverlap),
          density: resolveEffectiveDanmakuDensity(),
        });
        return { result, id: message.id };
      } catch (e) {
        console.warn('[tv-danmaku] pickDanmuTop failed, fallback worker', e);
      }
    }
    return orig(message);
  };
}

/** 与官方 load→emit 入队语义一致，供大批量库弹幕使用 */
function bulkEnqueueWait(inst: DanmukuInstance, list: Danmu[]): void {
  try {
    inst.reset();
  } catch {
    /* */
  }
  inst.queue = [];
  inst.states = { wait: [], ready: [], emit: [], stop: [] };
  inst.$refs = [];
  try {
    inst.$danmuku.textContent = '';
  } catch {
    /* */
  }

  const filter = inst.option.filter ?? (() => true);
  const defaultColor = inst.option.color ?? '#FFFFFF';
  const defaultMode = (inst.option.mode ?? 0) as 0 | 1 | 2;

  for (const danmu of list) {
    const text = String(danmu.text ?? '').trim();
    if (!text) continue;
    let time = Number(danmu.time);
    if (!Number.isFinite(time) || time < 0) continue;
    if (time <= 0) time = 0.001;

    const item: DanmuQueueItem = {
      text,
      time,
      mode: ([0, 1, 2].includes(Number(danmu.mode))
        ? Number(danmu.mode)
        : defaultMode) as 0 | 1 | 2,
      color: danmu.color ?? defaultColor,
      border: Boolean(danmu.border),
      style: { ...(danmu.style ?? {}) },
      $state: 'wait',
      $index: inst.index++,
      $ref: null,
      $restTime: 0,
      $lastStartTime: 0,
    };
    if (!filter(item)) continue;
    inst.setState(item, 'wait');
    inst.queue.push(item);
  }

  try {
    inst.art.emit('artplayerPluginDanmuku:loaded', inst.queue);
  } catch {
    /* */
  }

  const times = inst.queue.map((d) => Number(d.time)).filter(Number.isFinite);
  const unique = new Set(times.map((t) => t.toFixed(3))).size;
  console.info('[tv-danmaku] loaded (native schedule)', {
    count: inst.queue.length,
    timeRange: times.length ? [Math.min(...times), Math.max(...times)] : [0, 0],
    uniqueTimes: unique,
    sample: inst.queue.slice(0, 3).map((d) => ({ t: d.time, text: d.text.slice(0, 16) })),
    currentTime: inst.art.currentTime,
  });
}

const DENSITY_PANEL_STYLE_ID = 'reader-apd-density-style';
/** bump 后强制刷新已注入的 style（避免 HMR/旧内容缺规则） */
const DENSITY_PANEL_STYLE_VER = '13';

function ensureDensityPanelStyle(): void {
  if (typeof document === 'undefined') return;
  let el = document.getElementById(DENSITY_PANEL_STYLE_ID) as HTMLStyleElement | null;
  if (el?.dataset.ver === DENSITY_PANEL_STYLE_VER) return;
  if (!el) {
    el = document.createElement('style');
    el.id = DENSITY_PANEL_STYLE_ID;
    document.head.appendChild(el);
  }
  el.dataset.ver = DENSITY_PANEL_STYLE_VER;
  el.textContent = `
.apd-config-density {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  margin-top: 8px;
  margin-bottom: 15px;
  box-sizing: border-box;
}
.apd-config-density .apd-density-label { margin-bottom: 0; flex-shrink: 0; }
.apd-config-density .apd-density-opts {
  display: flex;
  flex-wrap: nowrap;
  gap: 4px;
  width: 100%;
  box-sizing: border-box;
}
.apd-config-density .apd-density-opt {
  flex: 1 1 0;
  min-width: 0;
  text-align: center;
  white-space: nowrap;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
  border: 1px solid rgba(255,255,255,0.25);
  opacity: 0.75;
  user-select: none;
  font-size: 12px;
  box-sizing: border-box;
}
.apd-config-density .apd-density-opt:hover { opacity: 1; }
.apd-config-density .apd-density-opt.apd-active {
  opacity: 1; border-color: #00aeec; color: #00aeec;
}
.apd-config-rematch {
  margin-top: 10px; padding-top: 8px;
  border-top: 1px solid rgba(255,255,255,0.12);
}
.apd-config-rematch-btn {
  display: flex; width: 100%; align-items: center; justify-content: center;
  padding: 6px 10px; cursor: pointer; user-select: none;
  border-radius: 3px; border: 1px solid rgba(255,255,255,0.25);
  background: transparent; color: #fff; font-size: 12px; opacity: 0.85;
}
.apd-config-rematch-btn:hover { opacity: 1; border-color: #00aeec; color: #00aeec; }
.apd-config-other {
  flex-wrap: wrap;
  row-gap: 6px;
}
/* 与插件 apd-sync-video 一致：同一时刻只显示 on/off 其一 */
.reader-apd-scale-screen .apd-check-on,
.reader-apd-avoid-subtitle .apd-check-on { display: none !important; }
.reader-apd-scale-screen .apd-check-off,
.reader-apd-avoid-subtitle .apd-check-off { display: block !important; }
.reader-apd-scale-screen.is-on .apd-check-on,
.reader-apd-avoid-subtitle.is-on .apd-check-on { display: block !important; }
.reader-apd-scale-screen.is-on .apd-check-off,
.reader-apd-avoid-subtitle.is-on .apd-check-off { display: none !important; }
.reader-danmu-hover-tip {
  position: absolute;
  z-index: 60;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  width: 36px;
  height: 36px;
  padding: 0;
  margin: 0;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.18);
  pointer-events: auto;
  overflow: visible;
}
/* 朝弹幕一侧伸出透明桥，斜移进 tip 时不断开 */
.reader-danmu-hover-tip::before {
  content: '';
  position: absolute;
  left: 50%;
  width: 56px;
  height: 20px;
  transform: translateX(-50%);
  pointer-events: auto;
  background: transparent;
}
.reader-danmu-hover-tip[data-side='below']::before {
  bottom: 100%;
}
.reader-danmu-hover-tip[data-side='above']::before {
  top: 100%;
}
.reader-danmu-hover-tip-btn {
  position: relative;
  z-index: 1;
  display: block;
  box-sizing: border-box;
  width: 36px;
  height: 36px;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #fff;
  cursor: pointer;
  opacity: 0.85;
  line-height: 0;
  font-size: 0;
}
.reader-danmu-hover-tip-btn:hover { opacity: 1; background: rgba(255,255,255,0.12); }
.reader-danmu-hover-tip-btn svg {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 16px;
  height: 16px;
  margin: 0;
  padding: 0;
  transform: translate(-50%, -50%);
  display: block;
  stroke: currentColor;
  fill: none;
  stroke-width: 2;
  pointer-events: none;
}
/* 悬停锁定：其它弹幕不抢指针，避免滚动经过时切换目标 */
.reader-artplayer-stage.reader-danmu-hover-lock .art-danmuku > div {
  pointer-events: none !important;
}
.reader-artplayer-stage.reader-danmu-hover-lock .art-danmuku > div.reader-danmu-hover-target {
  pointer-events: auto !important;
  z-index: 55 !important;
}
/* 弹幕层：子项可命中（父层仍 none，不挡控件） */
.reader-artplayer-stage .art-danmuku > div {
  pointer-events: auto !important;
  cursor: pointer;
}
`;
}

function syncAntiOverlapPanel(art: Artplayer): void {
  try {
    const player = (art.template as { $player?: HTMLElement }).$player;
    if (!player) return;
    const on = getDanmakuPrefs().danmakuAntiOverlap !== false;
    player.dataset.danmukuAntiOverlap = String(on);
  } catch {
    /* */
  }
}

/** 底部留白：开启防挡字幕时至少保留画面高度 15% */
function patchMarginBottomForSubtitle(inst: DanmukuInstance): void {
  try {
    const proto = Object.getPrototypeOf(inst) as {
      marginBottom?: PropertyDescriptor;
    };
    const desc = Object.getOwnPropertyDescriptor(proto, 'marginBottom');
    if (!desc?.get) return;
    const origGet = desc.get;
    Object.defineProperty(inst, 'marginBottom', {
      configurable: true,
      enumerable: false,
      get() {
        const base = Number(origGet.call(inst)) || 0;
        if (!getDanmakuPrefs().danmakuAvoidSubtitle) return base;
        const h = inst.$player?.clientHeight ?? 0;
        return Math.max(base, Math.round(h * 0.15));
      },
    });
  } catch (e) {
    console.warn('[tv-danmaku] patchMarginBottomForSubtitle failed', e);
  }
}

const CHECK_ON_SVG =
  '<svg class="apd-icon apd-check-on" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32"><path d="m13 18.25-1.8-1.8c-.6-.6-1.65-.6-2.25 0s-.6 1.5 0 2.25l2.85 2.85c.318.318.762.468 1.2.448.438.02.882-.13 1.2-.448l8.85-8.85c.6-.6.6-1.65 0-2.25s-1.65-.6-2.25 0l-7.8 7.8zM8 4h16c2.21 0 4 1.79 4 4v16c0 2.21-1.79 4-4 4H8c-2.21 0-4-1.79-4-4V8c0-2.21 1.79-4 4-4z" fill="#FFFFFF"></path></svg>';
const CHECK_OFF_SVG =
  '<svg class="apd-icon apd-check-off" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32"><path d="M8 4h16c2.21 0 4 1.79 4 4v16c0 2.21-1.79 4-4 4H8c-2.21 0-4-1.79-4-4V8c0-2.21 1.79-4 4-4zm0 2c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2H8z" fill="#FFFFFF"></path></svg>';

function syncExtraPrefsPanel(art: Artplayer): void {
  try {
    const prefs = getDanmakuPrefs();
    const player = (art.template as { $player?: HTMLElement }).$player;
    if (!player) return;
    player.dataset.readerDanmakuScale = String(prefs.danmakuScaleWithScreen);
    player.dataset.readerDanmakuAvoidSub = String(prefs.danmakuAvoidSubtitle);
    const scaleEl = player.querySelector('.reader-apd-scale-screen');
    const avoidEl = player.querySelector('.reader-apd-avoid-subtitle');
    scaleEl?.classList.toggle('is-on', prefs.danmakuScaleWithScreen);
    avoidEl?.classList.toggle('is-on', prefs.danmakuAvoidSubtitle);
  } catch {
    /* */
  }
}

function mountDanmakuExtraPrefs(art: Artplayer): void {
  ensureDensityPanelStyle();
  const tryMount = () => {
    try {
      const player = (art.template as { $player?: HTMLElement }).$player;
      const other = player?.querySelector('.apd-config-other') as HTMLElement | null;
      if (!other) return false;
      if (other.querySelector('.reader-apd-scale-screen')) {
        syncExtraPrefsPanel(art);
        return true;
      }

const mkToggle = (className: string, label: string) => {
        const el = document.createElement('div');
        el.className = `apd-other ${className}`;
        const syncSample = other.querySelector('.apd-sync-video');
        const onSvg =
          syncSample?.querySelector('.apd-check-on')?.outerHTML ?? CHECK_ON_SVG;
        const offSvg =
          syncSample?.querySelector('.apd-check-off')?.outerHTML ?? CHECK_OFF_SVG;
        el.innerHTML = `${onSvg}${offSvg}${label}`;
        return el;
      };

      const scaleEl = mkToggle('reader-apd-scale-screen', '弹幕随屏幕缩放');
      const avoidEl = mkToggle('reader-apd-avoid-subtitle', '防挡字幕');
      Artplayer.utils.tooltip(avoidEl, '视频底部15%部分为空白保留区', 'top');

      scaleEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const next = !getDanmakuPrefs().danmakuScaleWithScreen;
        setDanmakuPrefs({ danmakuScaleWithScreen: next });
        syncExtraPrefsPanel(art);
      });
      avoidEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const next = !getDanmakuPrefs().danmakuAvoidSubtitle;
        setDanmakuPrefs({ danmakuAvoidSubtitle: next });
        syncExtraPrefsPanel(art);
      });

      const syncRow = other.querySelector('.apd-sync-video');
      if (syncRow?.nextSibling) {
        other.insertBefore(scaleEl, syncRow.nextSibling);
        other.insertBefore(avoidEl, scaleEl.nextSibling);
      } else {
        other.appendChild(scaleEl);
        other.appendChild(avoidEl);
      }
      syncExtraPrefsPanel(art);
      return true;
    } catch {
      return false;
    }
  };

  if (!tryMount()) {
    window.setTimeout(() => tryMount(), 0);
    window.setTimeout(() => tryMount(), 200);
  }
}

/** 悬停暂停滚动的最长时长；离开弹幕/tip 立即收起 tip */
const HOVER_PAUSE_MS = 5000;

type HoverPauseState = {
  danmu: DanmuQueueItem;
  timer: number;
  tip: HTMLElement;
  ref: HTMLElement;
};

function pauseScrollDanmu(inst: DanmukuInstance, danmu: DanmuQueueItem): void {
  if (danmu.mode !== 0 || !danmu.$ref) return;
  const elapsed = (Date.now() - (danmu.$lastStartTime || Date.now())) / 1000;
  if (Number.isFinite(elapsed) && elapsed > 0) {
    danmu.$restTime = Math.max(0.05, danmu.$restTime - elapsed);
  }
  danmu.$lastStartTime = Date.now();
  try {
    inst.setState(danmu, 'stop');
  } catch {
    /* */
  }
  const clientWidth = inst.$player?.clientWidth ?? 0;
  const translateX =
    clientWidth - (inst.getLeft(danmu.$ref) - inst.getLeft(inst.$player));
  danmu.$ref.style.transform = `translateX(${-translateX}px)`;
  danmu.$ref.style.transition = 'transform 0s linear 0s';
}

function resumeScrollDanmu(inst: DanmukuInstance, danmu: DanmuQueueItem): void {
  if (danmu.mode !== 0 || !danmu.$ref) return;
  if (inst.isStop || inst.art?.video?.paused) return;
  try {
    inst.setState(danmu, 'emit');
  } catch {
    /* */
  }
  danmu.$lastStartTime = Date.now();
  const distance =
    (inst.$player?.clientWidth ?? 0) + danmu.$ref.clientWidth;
  danmu.$ref.style.transform = `translateX(${-distance}px)`;
  danmu.$ref.style.transition = `transform ${Math.max(0.05, danmu.$restTime)}s linear 0s`;
}

async function copyDanmuText(text: string): Promise<void> {
  const t = text.trim();
  if (!t) return;
  try {
    await navigator.clipboard.writeText(t);
    showAppToast({ title: '已复制弹幕', variant: 'success' });
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = t;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      showAppToast({ title: '已复制弹幕', variant: 'success' });
    } catch {
      showAppToast({ title: '复制失败', variant: 'error' });
    }
  }
}

function isNodeInside(root: Node | null | undefined, node: EventTarget | null): boolean {
  if (!root || !(node instanceof Node)) return false;
  return root === node || root.contains(node);
}

function mountDanmakuHoverCopy(art: Artplayer, inst: DanmukuInstance): void {
  ensureDensityPanelStyle();
  let active: HoverPauseState | null = null;

  const stage =
    (art.template as { $player?: HTMLElement }).$player?.closest(
      '.reader-artplayer-stage',
    ) ?? null;

  const clearActive = (resume: boolean) => {
    if (!active) return;
    window.clearTimeout(active.timer);
    active.tip.remove();
    active.ref.classList.remove('reader-danmu-hover-target');
    stage?.classList.remove('reader-danmu-hover-lock');
    if (resume) resumeScrollDanmu(inst, active.danmu);
    active = null;
  };

  const host =
    (art.template as { $player?: HTMLElement }).$player ??
    inst.$player ??
    null;

  const placeTip = (tip: HTMLElement, ref: HTMLElement) => {
    if (!host) return;
    const hr = host.getBoundingClientRect();
    const rr = ref.getBoundingClientRect();
    const tipW = 36;
    const tipH = 36;
    const gap = 4;
    const spaceBelow = hr.bottom - rr.bottom;
    const spaceAbove = rr.top - hr.top;
    const preferBelow = spaceBelow >= tipH + gap || spaceBelow >= spaceAbove;

    let top = preferBelow
      ? rr.bottom - hr.top + gap
      : rr.top - hr.top - tipH - gap;
    // 弹幕水平中心对齐 tip 中心
    let left = rr.left - hr.left + rr.width / 2 - tipW / 2;
    left = Math.max(4, Math.min(left, hr.width - tipW - 4));
    top = Math.max(4, Math.min(top, hr.height - tipH - 4));
    tip.dataset.side = preferBelow ? 'below' : 'above';
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    if (tip.parentElement !== host) host.appendChild(tip);
  };

  const showTip = (danmu: DanmuQueueItem) => {
    const ref = danmu.$ref;
    if (!ref || !host) return;
    // 已锁定其它目标时不切换（后续滚动弹幕不得抢走悬停）
    if (active && active.ref !== ref) return;
    if (active?.danmu === danmu && active.ref === ref) {
      window.clearTimeout(active.timer);
      active.timer = window.setTimeout(() => clearActive(true), HOVER_PAUSE_MS);
      placeTip(active.tip, ref);
      return;
    }
    clearActive(true);

    const tip = document.createElement('div');
    tip.className = 'reader-danmu-hover-tip';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'reader-danmu-hover-tip-btn';
    btn.setAttribute('aria-label', '复制弹幕');
    btn.innerHTML = lucideIconHtml('copy', { size: 16 });
    Artplayer.utils.tooltip(btn, '复制弹幕', 'top');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void copyDanmuText(String(danmu.text ?? ref.textContent ?? ''));
    });
    tip.appendChild(btn);

    ref.classList.add('reader-danmu-hover-target');
    stage?.classList.add('reader-danmu-hover-lock');
    placeTip(tip, ref);

    if (danmu.mode === 0) {
      pauseScrollDanmu(inst, danmu);
    }

    const timer = window.setTimeout(() => {
      clearActive(true);
    }, HOVER_PAUSE_MS);

    active = { danmu, timer, tip, ref };

    tip.addEventListener('mouseenter', () => {
      if (active?.timer) window.clearTimeout(active.timer);
    });
    tip.addEventListener('mouseleave', (e) => {
      if (!active || active.tip !== tip) return;
      if (isNodeInside(active.ref, e.relatedTarget)) return;
      clearActive(true);
    });
  };

  const onVisible = (danmu: DanmuQueueItem & { $ref?: HTMLElement | null }) => {
    const ref = danmu.$ref;
    if (!ref) return;
    if (
      !stage?.classList.contains('reader-danmu-hover-lock') ||
      ref.classList.contains('reader-danmu-hover-target')
    ) {
      ref.style.pointerEvents = 'auto';
    }
    ref.style.cursor = 'pointer';
    if (ref.dataset.readerHoverBound === '1') return;
    ref.dataset.readerHoverBound = '1';
    ref.addEventListener('mouseenter', () => {
      if (active && active.ref !== ref) return;
      const current =
        inst.queue.find(
          (d) =>
            d.$ref === ref &&
            (d.$state === 'emit' || d.$state === 'stop'),
        ) ?? danmu;
      if (current.$ref) showTip(current);
    });
    ref.addEventListener('mouseleave', (e) => {
      if (!active || active.ref !== ref) return;
      if (isNodeInside(active.tip, e.relatedTarget)) return;
      clearActive(true);
    });
  };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (art as any).on('artplayerPluginDanmuku:visible', onVisible);
    art.on('destroy', () => clearActive(false));
  } catch (e) {
    console.warn('[tv-danmaku] mount hover copy failed', e);
  }
}

function syncDensityPanel(art: Artplayer): void {
  try {
    ensureDensityPanelStyle();
    const player = (art.template as { $player?: HTMLElement }).$player;
    const panel = player?.querySelector('.apd-config-density') as HTMLElement | null;
    if (!panel) return;
    const cur = getDanmakuPrefs().danmakuDensity;
    panel.querySelectorAll<HTMLElement>('.apd-density-opt').forEach((btn) => {
      btn.classList.toggle('apd-active', btn.dataset.density === cur);
    });
  } catch {
    /* */
  }
}

function mountDanmakuDensityPanel(art: Artplayer): void {
  ensureDensityPanelStyle();
  const tryMount = () => {
    try {
      const player = (art.template as { $player?: HTMLElement }).$player;
      const marginRow = player?.querySelector('.apd-config-margin') as HTMLElement | null;
      if (!marginRow?.parentElement) return false;
      if (marginRow.parentElement.querySelector('.apd-config-density')) {
        syncDensityPanel(art);
        return true;
      }
      const wrap = document.createElement('div');
      wrap.className = 'apd-config-density';
      wrap.innerHTML = `<div class="apd-density-label">弹幕密度</div><div class="apd-density-opts"></div>`;
      const opts = wrap.querySelector('.apd-density-opts')!;
      for (const item of DANMAKU_DENSITY_OPTIONS) {
        const btn = document.createElement('div');
        btn.className = 'apd-density-opt';
        btn.dataset.density = item.value;
        btn.textContent = item.label.replace(/（.*）/, '');
        btn.title = item.label;
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const v = btn.dataset.density as DanmakuDensity;
          setDanmakuPrefs({ danmakuDensity: v });
          // 同步立即应用到当前实例（不依赖动态 import 的异步路径）
          applyArtDanmakuVisualPrefs(art);
          syncDensityPanel(art);
        });
        opts.appendChild(btn);
      }
      marginRow.insertAdjacentElement('afterend', wrap);
      syncDensityPanel(art);
      return true;
    } catch {
      return false;
    }
  };

  if (!tryMount()) {
    window.setTimeout(() => tryMount(), 0);
    window.setTimeout(() => tryMount(), 200);
  }

  const onConfig = (option: {
    margin?: unknown;
    speed?: unknown;
    fontSize?: unknown;
    opacity?: unknown;
    antiOverlap?: unknown;
    synchronousPlayback?: unknown;
  }) => {
    const area = marginToDanmakuArea(option?.margin);
    const patch: Parameters<typeof setDanmakuPrefs>[0] = {};
    if (area != null && area !== getDanmakuPrefs().danmakuArea) {
      patch.danmakuArea = area;
    }
    if (typeof option?.antiOverlap === 'boolean') {
      if (option.antiOverlap !== getDanmakuPrefs().danmakuAntiOverlap) {
        patch.danmakuAntiOverlap = option.antiOverlap;
      }
    }
    if (typeof option?.synchronousPlayback === 'boolean') {
      if (option.synchronousPlayback !== getDanmakuPrefs().danmakuFollowSpeed) {
        patch.danmakuFollowSpeed = option.synchronousPlayback;
      }
    }
    if (typeof option?.opacity === 'number' && Number.isFinite(option.opacity)) {
      // 面板滑块 0–100% → option.opacity ∈ [0,1]；必须写回 prefs，否则重载回落默认
      const op = Math.round(Math.min(1, Math.max(0.1, option.opacity)) * 100) / 100;
      if (Math.abs(op - getDanmakuPrefs().danmakuOpacity) >= 0.005) {
        patch.danmakuOpacity = op;
      }
    }
    if (typeof option?.fontSize === 'number' && Number.isFinite(option.fontSize)) {
      // 面板滑块给出解析后的 px；只写偏好，热更新走 patchFontSizeNoReset（不 reset）
      const px = Math.round(Math.min(120, Math.max(12, option.fontSize)));
      if (px !== getDanmakuPrefs().danmakuFontSize) {
        patch.danmakuFontSize = px;
      }
    }
    if (Object.keys(patch).length) setDanmakuPrefs(patch);
    // speed：等我们的 config 包装把 >10 写回后再同步 prefs，避免读到 clamp 后的 10
    if (option && 'speed' in option) {
      queueMicrotask(() => {
        const inst = instanceByArt.get(art);
        const raw = inst?.option.speed;
        if (typeof raw !== 'number') return;
        const snapped = nearestDanmakuSpeedStep(raw).value;
        if (inst) inst.option.speed = snapped;
        refreshSpeedPanelUi(art, snapped);
        if (snapped !== getDanmakuPrefs().danmakuSpeed) {
          setDanmakuPrefs({ danmakuSpeed: snapped });
        }
      });
    }
    syncDensityPanel(art);
    syncAntiOverlapPanel(art);
    syncExtraPrefsPanel(art);
  };
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (art as any).on('artplayerPluginDanmuku:config', onConfig);
  } catch {
    /* */
  }
}

function mountDanmakuRematchButton(art: Artplayer): void {
  ensureDensityPanelStyle();
  const tryMount = () => {
    try {
      const player = (art.template as { $player?: HTMLElement }).$player;
      const panelInner = player?.querySelector(
        '.apd-config-panel-inner',
      ) as HTMLElement | null;
      if (!panelInner) return false;
      if (panelInner.querySelector('.apd-config-rematch')) return true;

      const wrap = document.createElement('div');
      wrap.className = 'apd-config-rematch';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'apd-config-rematch-btn';
      btn.textContent = '匹配弹幕';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        void import('@/lib/media/tv/play/tv-vod-tool-handlers').then((m) => {
          const h = m.getTvVodToolHandlers();
          if (!h?.showRematch) return;
          h.openRematch();
        });
      });
      wrap.appendChild(btn);
      panelInner.appendChild(wrap);
      syncDanmakuRematchButton(art);
      return true;
    } catch {
      return false;
    }
  };

  if (!tryMount()) {
    window.setTimeout(() => tryMount(), 0);
    window.setTimeout(() => tryMount(), 200);
  }
}

export function syncDanmakuRematchButton(art?: Artplayer | null): void {
  try {
    const root =
      (art?.template as { $player?: HTMLElement } | undefined)?.$player ??
      document.querySelector('.reader-artplayer-stage .art-video-player');
    const wrap = root?.querySelector('.apd-config-rematch') as HTMLElement | null;
    if (!wrap) return;
    void import('@/lib/media/tv/play/tv-vod-tool-handlers').then((m) => {
      const show = m.getTvVodToolHandlers()?.showRematch === true;
      wrap.hidden = !show;
    });
  } catch {
    /* */
  }
}

/** 清空并载入新弹幕（规范化 → 原生时间轴调度） */
export async function replaceArtDanmaku(
  art: Artplayer | null | undefined,
  danmu: Danmu[] | string,
): Promise<'loaded' | 'no-plugin' | 'no-art'> {
  if (!art) return 'no-art';
  const plugin = getArtDanmukuPlugin(art);
  if (!plugin?.load) return 'no-plugin';

  try {
    if (typeof danmu === 'string') {
      plugin.config?.({ danmuku: danmu });
      await plugin.load();
      return 'loaded';
    }

    const prepared = prepareDanmuList(danmu);
    plugin.config?.({ danmuku: prepared });
    await plugin.load(prepared);
    return 'loaded';
  } catch (e) {
    console.warn('[tv-danmaku] replace failed', e);
    return 'no-plugin';
  }
}

export function setArtDanmukuEmitter(
  art: Artplayer | null | undefined,
  enabled: boolean,
): void {
  const plugin = getArtDanmukuPlugin(art);
  try {
    plugin?.config?.({ emitter: enabled });
  } catch (e) {
    console.warn('[tv-danmaku] set emitter failed', e);
  }
  try {
    const player = (art?.template as { $player?: HTMLElement } | undefined)?.$player;
    if (player) {
      player.dataset.danmukuEmitter = String(enabled);
    }
    const mount = document.querySelector(
      '.reader-artplayer-stage .artplayer-plugin-danmuku',
    ) as HTMLElement | null;
    const host = mount?.parentElement;
    if (host?.dataset) {
      host.dataset.danmukuEmitter = String(enabled);
    }
  } catch {
    /* */
  }
}

/** 将当前 prefs 的区域 / 密度 / 观感应用到已挂载的弹幕插件 */
export function applyArtDanmakuVisualPrefs(art: Artplayer | null | undefined): void {
  const plugin = getArtDanmukuPlugin(art);
  if (!plugin?.config) return;
  try {
    const player = (art?.template as { $player?: HTMLElement } | undefined)?.$player;
    const prefs = getDanmakuPrefs();
    const opts = danmakuPrefsToArtplayerOpts(prefs);
    // 随屏缩放时按当前播放器高度换算百分比
    const fontSize = resolveArtplayerFontSize(prefs, player?.clientHeight);
    const prev = (plugin.option ?? {}) as {
      fontSize?: number | string;
    };
    const fontChanged = prev.fontSize !== fontSize;

    // 字号单独走 no-reset 路径，避免与其它字段一起进原版 config 触发清屏
    const patch: Record<string, unknown> = {
      antiOverlap: opts.antiOverlap,
      margin: opts.margin,
      opacity: opts.opacity,
      speed: opts.speed,
      modes: opts.modes,
      synchronousPlayback: opts.synchronousPlayback,
    };
    plugin.config(patch);
    if (fontChanged) {
      plugin.config({ fontSize });
    }
    // 密度/防重叠切换只影响后续弹幕，不清屏、不 reset
    if (art) {
      syncDensityPanel(art);
      syncAntiOverlapPanel(art);
      syncExtraPrefsPanel(art);
    }
  } catch (e) {
    console.warn('[tv-danmaku] apply visual prefs failed', e);
  }
}

export function waitArtReady(art: Artplayer, timeoutMs = 2500): Promise<void> {
  return new Promise((resolve) => {
    try {
      if ((art as Artplayer & { isReady?: boolean }).isReady) {
        resolve();
        return;
      }
    } catch {
      /* */
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    try {
      art.once('ready', finish);
    } catch {
      finish();
      return;
    }
    setTimeout(finish, timeoutMs);
  });
}
