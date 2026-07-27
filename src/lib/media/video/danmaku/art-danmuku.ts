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
  isDanmakuFullArea,
  marginToDanmakuArea,
  nearestDanmakuSpeedStep,
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
  if (density === 'normal') return 12_000;
  if (density === 'more') return 20_000;
  return 30_000;
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
      patchSpeedClamp(captured);
      patchRuntimeSpeedFactor(captured);
      patchMarginBottomForSubtitle(captured);
      mountDanmakuHoverCopy(art, captured);
    } else {
      console.warn('[tv-danmaku] instance capture failed; using stock plugin only');
    }

    mountDanmakuDensityPanel(art);
    mountDanmakuRematchButton(art);
    mountDanmakuExtraPrefs(art);
    hideDanmakuAntiOverlapUi(art);

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

    const rawConfig = api.config;
    if (rawConfig) {
      api.config = (opt: Record<string, unknown>) => {
        const next: Record<string, unknown> = Array.isArray(opt.danmuku)
          ? { ...opt, danmuku: prepareDanmuList(opt.danmuku as Danmu[]) }
          : { ...opt };
        const intendedSpeed =
          typeof next.speed === 'number'
            ? nearestDanmakuSpeedStep(next.speed).value
            : undefined;
        if (intendedSpeed != null) next.speed = intendedSpeed;
        const result = rawConfig(next);
        // 插件内置 clamp(1,10)；新档位含 12.5/15，写回真实值（须在 emit 后立刻恢复）
        if (captured && intendedSpeed != null) {
          captured.option.speed = intendedSpeed;
        }
        return result;
      };
    }

    return api;
  };
}

/** 放宽 speed 上限，允许「极慢/较慢」>10，并刷新面板文案/滑块 */
function patchSpeedClamp(inst: DanmukuInstance): void {
  try {
    const desired = nearestDanmakuSpeedStep(getDanmakuPrefs().danmakuSpeed).value;
    inst.option.speed = desired;
    refreshSpeedPanelUi(inst.art, desired);
  } catch {
    /* */
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
/**  bump 后强制刷新已注入的 style（避免 HMR/旧内容缺规则） */
const DENSITY_PANEL_STYLE_VER = '3';

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
.apd-config-density { display: none; margin-top: 8px; }
.apd-config-density.apd-density-visible { display: block; }
.apd-config-density .apd-density-label { margin-bottom: 6px; }
.apd-config-density .apd-density-opts {
  display: flex; flex-wrap: wrap; gap: 6px;
}
.apd-config-density .apd-density-opt {
  cursor: pointer; padding: 2px 8px; border-radius: 3px;
  border: 1px solid rgba(255,255,255,0.25); opacity: 0.75; user-select: none;
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
/* 防重叠已由密度统一管理，隐藏插件自带开关 */
.apd-anti-overlap { display: none !important; }
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
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 4px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.18);
  pointer-events: auto;
  transform: translate(-50%, -100%);
  margin-top: -6px;
}
.reader-danmu-hover-tip-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #fff;
  cursor: pointer;
  opacity: 0.85;
}
.reader-danmu-hover-tip-btn:hover { opacity: 1; background: rgba(255,255,255,0.12); }
.reader-danmu-hover-tip-btn svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
  fill: none;
  stroke-width: 2;
}
`;
}

function hideDanmakuAntiOverlapUi(art: Artplayer): void {
  ensureDensityPanelStyle();
  const tryHide = () => {
    try {
      const player = (art.template as { $player?: HTMLElement }).$player;
      player?.querySelectorAll('.apd-anti-overlap').forEach((el) => {
        (el as HTMLElement).style.display = 'none';
      });
      return Boolean(player?.querySelector('.apd-config-panel-inner'));
    } catch {
      return false;
    }
  };
  if (!tryHide()) {
    window.setTimeout(() => tryHide(), 0);
    window.setTimeout(() => tryHide(), 200);
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

const HOVER_PAUSE_MS = 5000;

type HoverPauseState = {
  danmu: DanmuQueueItem;
  timer: number;
  tip: HTMLElement;
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

function mountDanmakuHoverCopy(art: Artplayer, inst: DanmukuInstance): void {
  ensureDensityPanelStyle();
  let active: HoverPauseState | null = null;

  const clearActive = (resume: boolean) => {
    if (!active) return;
    window.clearTimeout(active.timer);
    active.tip.remove();
    if (resume) resumeScrollDanmu(inst, active.danmu);
    active = null;
  };

  const showTip = (danmu: DanmuQueueItem) => {
    const ref = danmu.$ref;
    if (!ref) return;
    clearActive(true);

    const tip = document.createElement('div');
    tip.className = 'reader-danmu-hover-tip';
    tip.style.left = `${ref.offsetWidth / 2}px`;
    tip.style.top = '0';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'reader-danmu-hover-tip-btn';
    btn.innerHTML = lucideIconHtml('copy', { size: 16 });
    Artplayer.utils.tooltip(btn, '复制弹幕', 'top');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void copyDanmuText(String(danmu.text ?? ref.textContent ?? ''));
    });
    tip.appendChild(btn);
    // 相对弹幕定位
    if (getComputedStyle(ref).position === 'static') {
      ref.style.position = 'relative';
    }
    ref.appendChild(tip);

    if (danmu.mode === 0) {
      pauseScrollDanmu(inst, danmu);
    }

    const timer = window.setTimeout(() => {
      clearActive(true);
    }, HOVER_PAUSE_MS);

    active = { danmu, timer, tip };

    const onLeave = () => {
      // 离开 tip/弹幕：若仍在暂停窗内，保留冻结直到超时，便于点复制
      // tip 自身 mouseenter 会阻止过早 resume
    };
    tip.addEventListener('mouseleave', onLeave);
  };

  const onVisible = (danmu: DanmuQueueItem & { $ref?: HTMLElement | null }) => {
    const ref = danmu.$ref;
    if (!ref || ref.dataset.readerHoverBound === '1') return;
    ref.dataset.readerHoverBound = '1';
    ref.style.pointerEvents = 'auto';
    ref.style.cursor = 'pointer';
    ref.addEventListener('mouseenter', () => {
      showTip(danmu);
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
    const panel = (
      art.template as { $player?: HTMLElement }
    ).$player?.querySelector('.apd-config-density') as HTMLElement | null;
    if (!panel) return;
    const prefs = getDanmakuPrefs();
    const full = isDanmakuFullArea(prefs.danmakuArea);
    panel.classList.toggle('apd-density-visible', full);
    const cur = prefs.danmakuDensity;
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
      wrap.className = 'apd-config-slider apd-config-density';
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
    synchronousPlayback?: unknown;
  }) => {
    const area = marginToDanmakuArea(option?.margin);
    const patch: Parameters<typeof setDanmakuPrefs>[0] = {};
    if (area != null && area !== getDanmakuPrefs().danmakuArea) {
      patch.danmakuArea = area;
    }
    if (typeof option?.synchronousPlayback === 'boolean') {
      if (option.synchronousPlayback !== getDanmakuPrefs().danmakuFollowSpeed) {
        patch.danmakuFollowSpeed = option.synchronousPlayback;
      }
    }
    if (typeof option?.fontSize === 'number' && Number.isFinite(option.fontSize)) {
      // 面板滑块给出的是解析后的 px；写回偏好字号（随屏缩放开启时会再转成 %）
      if (option.fontSize !== getDanmakuPrefs().danmakuFontSize) {
        patch.danmakuFontSize = option.fontSize;
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
    const opts = danmakuPrefsToArtplayerOpts();
    const prev = (plugin.option ?? {}) as {
      fontSize?: number | string;
    };
    const patch: Record<string, unknown> = {
      antiOverlap: opts.antiOverlap,
      margin: opts.margin,
      opacity: opts.opacity,
      speed: opts.speed,
      modes: opts.modes,
      synchronousPlayback: opts.synchronousPlayback,
      fontSize: opts.fontSize,
    };
    // 字号可能在 number / 百分比之间切换，始终写入
    if (prev.fontSize === opts.fontSize) {
      delete patch.fontSize;
    }
    plugin.config(patch);
    // 插件 config 会把 speed 夹到 ≤10；写回真实五档并刷新面板
    if (typeof patch.speed === 'number') {
      const inst = art ? instanceByArt.get(art) : null;
      const snapped = nearestDanmakuSpeedStep(patch.speed).value;
      if (inst) inst.option.speed = snapped;
      refreshSpeedPanelUi(art, snapped);
    }
    if (art) {
      syncDensityPanel(art);
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
