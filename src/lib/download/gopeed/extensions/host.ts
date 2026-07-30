/**
 * Gopeed 兼容扩展宿主：安装 / 开关 / 设置 / 事件触发
 */

import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '@/lib/platform/detect';
import { matchUrlPattern } from '@/lib/download/gopeed/extensions/match';
import {
  buildExtensionIdentity,
  validateManifest,
  type ActivationEvent,
  type Extension,
  type ExtensionManifest,
  type ExtensionSetting,
  type OnResolveContext,
  type OnTaskContext,
} from '@/lib/download/gopeed/extensions/types';

const STORAGE_KEY = 'download.gopeed.extensions.v1';
const EXT_STORAGE_PREFIX = 'download.gopeed.ext-storage.';

export interface ExtensionHostOptions {
  /** 扩展安装根目录（Tauri 侧绝对路径） */
  extensionsDir?: string;
  persistKey?: string;
}

export type ExtensionTriggerResult =
  | { event: 'onResolve'; context: OnResolveContext }
  | { event: 'onStart' | 'onError' | 'onDone'; context: OnTaskContext };

function now(): number {
  return Date.now();
}

function readJsonLocal<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJsonLocal(key: string, value: unknown): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

function settingsToMap(settings: ExtensionSetting[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const s of settings) {
    out[s.name] = s.value;
  }
  return out;
}

/**
 * 注入到 download_engine_eval_js 的 gopeed API prelude。
 * 扩展脚本通过 gopeed.events.onXxx = fn 注册回调；宿主再调用 __gopeed_run(event, ctx)。
 */
export function buildGopeedPrelude(opts: {
  info: { identity: string; name: string; title: string; version: string };
  settings: Record<string, unknown>;
  storage: Record<string, unknown>;
}): string {
  const infoJson = JSON.stringify(opts.info);
  const settingsJson = JSON.stringify(opts.settings);
  const storageJson = JSON.stringify(opts.storage);
  return `
var __gopeed_storage = ${storageJson};
var __gopeed_handlers = {};
var gopeed = {
  info: ${infoJson},
  settings: ${settingsJson},
  storage: {
    get: function(key) { return __gopeed_storage[key]; },
    set: function(key, value) { __gopeed_storage[key] = value; },
    remove: function(key) { delete __gopeed_storage[key]; },
    keys: function() { return Object.keys(__gopeed_storage); }
  },
  logger: {
    debug: function() {},
    info: function() {},
    warn: function() {},
    error: function() {}
  },
  events: {
    onResolve: null,
    onStart: null,
    onError: null,
    onDone: null
  }
};
Object.defineProperty(gopeed.events, 'onResolve', {
  get: function() { return __gopeed_handlers.onResolve; },
  set: function(fn) { __gopeed_handlers.onResolve = fn; },
  configurable: true
});
Object.defineProperty(gopeed.events, 'onStart', {
  get: function() { return __gopeed_handlers.onStart; },
  set: function(fn) { __gopeed_handlers.onStart = fn; },
  configurable: true
});
Object.defineProperty(gopeed.events, 'onError', {
  get: function() { return __gopeed_handlers.onError; },
  set: function(fn) { __gopeed_handlers.onError = fn; },
  configurable: true
});
Object.defineProperty(gopeed.events, 'onDone', {
  get: function() { return __gopeed_handlers.onDone; },
  set: function(fn) { __gopeed_handlers.onDone = fn; },
  configurable: true
});
function __gopeed_run(eventName, ctx) {
  var fn = __gopeed_handlers[eventName];
  if (typeof fn === 'function') {
    return fn(ctx);
  }
  return null;
}
`;
}

export class ExtensionHost {
  private extensions: Extension[] = [];
  private readonly persistKey: string;
  private readonly extensionsDir: string;
  /** per-extension key-value storage */
  private readonly storageMaps = new Map<string, Record<string, unknown>>();

  constructor(opts: ExtensionHostOptions = {}) {
    this.persistKey = opts.persistKey ?? STORAGE_KEY;
    this.extensionsDir = opts.extensionsDir ?? '';
    this.extensions = readJsonLocal<Extension[]>(this.persistKey, []);
    for (const ext of this.extensions) {
      const stored = readJsonLocal<Record<string, unknown>>(
        `${EXT_STORAGE_PREFIX}${ext.identity}`,
        {},
      );
      this.storageMaps.set(ext.identity, stored);
    }
  }

  private persist(): void {
    writeJsonLocal(this.persistKey, this.extensions);
  }

  private persistStorage(identity: string): void {
    writeJsonLocal(
      `${EXT_STORAGE_PREFIX}${identity}`,
      this.storageMaps.get(identity) ?? {},
    );
  }

  list(): Extension[] {
    return this.extensions.map((e) => ({ ...e, settings: e.settings.map((s) => ({ ...s })) }));
  }

  get(identity: string): Extension | undefined {
    return this.extensions.find((e) => e.identity === identity);
  }

  private async readManifestFromFolder(folder: string): Promise<ExtensionManifest> {
    if (!isTauri()) {
      throw new Error('installFromFolder requires Tauri filesystem');
    }
    const { readTextFile } = await import('@tauri-apps/plugin-fs');
    const { join } = await import('@tauri-apps/api/path');
    const manifestPath = await join(folder, 'manifest.json');
    const text = await readTextFile(manifestPath);
    const manifest = JSON.parse(text) as ExtensionManifest;
    validateManifest(manifest);
    return manifest;
  }

  private upsertFromManifest(
    manifest: ExtensionManifest,
    paths: { installPath: string; devMode: boolean; devPath: string },
  ): Extension {
    const identity = buildExtensionIdentity(manifest);
    const existing = this.get(identity);
    const base: Extension = {
      ...manifest,
      identity,
      scripts: manifest.scripts ?? [],
      settings: mergeSettings(existing?.settings ?? [], manifest.settings ?? []),
      disabled: existing?.disabled ?? false,
      devMode: paths.devMode,
      devPath: paths.devPath,
      installPath: paths.installPath,
      createdAt: existing?.createdAt ?? now(),
      updatedAt: now(),
    };
    if (existing) {
      const idx = this.extensions.findIndex((e) => e.identity === identity);
      this.extensions[idx] = base;
    } else {
      this.extensions.push(base);
      if (!this.storageMaps.has(identity)) {
        this.storageMaps.set(identity, {});
      }
    }
    this.persist();
    return { ...base };
  }

  async installFromFolder(folder: string, devMode = false): Promise<Extension> {
    const manifest = await this.readManifestFromFolder(folder);
    const identity = buildExtensionIdentity(manifest);
    let installPath = folder;
    if (!devMode) {
      if (!this.extensionsDir) {
        throw new Error('extensionsDir is not configured for non-dev install');
      }
      if (!isTauri()) {
        throw new Error('installFromFolder copy requires Tauri');
      }
      // 复制目录到安装根：委托 Rust（若不可用则直接使用源路径）
      try {
        installPath = await invoke<string>('download_engine_copy_extension', {
          src: folder,
          identity,
          destRoot: this.extensionsDir,
        });
      } catch {
        installPath = folder;
      }
    }
    return this.upsertFromManifest(manifest, {
      installPath,
      devMode,
      devPath: devMode ? folder : '',
    });
  }

  async installFromGit(repoUrl: string): Promise<Extension> {
    if (!isTauri()) {
      throw new Error('installFromGit requires Tauri shell');
    }
    if (!this.extensionsDir) {
      throw new Error('extensionsDir is not configured');
    }

    let url = repoUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
    }
    const hashIdx = url.indexOf('#');
    let subPath = '';
    if (hashIdx >= 0) {
      subPath = url.slice(hashIdx + 1);
      url = url.slice(0, hashIdx);
    }
    const gitUrl = url.endsWith('.git') ? url : `${url}.git`;

    const { Command } = await import('@tauri-apps/plugin-shell');
    const { join, tempDir } = await import('@tauri-apps/api/path');
    const tmpRoot = await tempDir();
    const cloneDir = await join(
      tmpRoot,
      `reader-ext-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );

    const clone = Command.create('git', ['clone', '--depth', '1', gitUrl, cloneDir]);
    const out = await clone.execute();
    if (out.code !== 0) {
      throw new Error(`git clone failed: ${out.stderr || out.stdout || `code ${out.code}`}`);
    }

    const folder = subPath ? await join(cloneDir, subPath) : cloneDir;
    try {
      return await this.installFromFolder(folder, false);
    } finally {
      try {
        const { remove } = await import('@tauri-apps/plugin-fs');
        await remove(cloneDir, { recursive: true });
      } catch {
        /* ignore cleanup */
      }
    }
  }

  async switch(identity: string, enabled: boolean): Promise<Extension> {
    const ext = this.get(identity);
    if (!ext) throw new Error(`extension not found: ${identity}`);
    ext.disabled = !enabled;
    ext.updatedAt = now();
    this.persist();
    return { ...ext };
  }

  async delete(identity: string): Promise<void> {
    const ext = this.get(identity);
    if (!ext) throw new Error(`extension not found: ${identity}`);
    if (!ext.devMode && isTauri() && ext.installPath) {
      try {
        const { remove } = await import('@tauri-apps/plugin-fs');
        await remove(ext.installPath, { recursive: true });
      } catch {
        /* ignore */
      }
    }
    this.extensions = this.extensions.filter((e) => e.identity !== identity);
    this.storageMaps.delete(identity);
    this.persist();
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`${EXT_STORAGE_PREFIX}${identity}`);
    }
  }

  async updateSettings(
    identity: string,
    settings: Record<string, unknown>,
  ): Promise<Extension> {
    const ext = this.get(identity);
    if (!ext) throw new Error(`extension not found: ${identity}`);
    for (const setting of ext.settings) {
      if (Object.prototype.hasOwnProperty.call(settings, setting.name)) {
        setting.value = coerceSetting(settings[setting.name], setting.type);
      }
    }
    ext.updatedAt = now();
    this.persist();
    return { ...ext, settings: ext.settings.map((s) => ({ ...s })) };
  }

  matchExtensions(
    event: ActivationEvent,
    url: string,
    labels?: Record<string, string>,
  ): Array<{ ext: Extension; entry: string }> {
    const hits: Array<{ ext: Extension; entry: string }> = [];
    for (const ext of this.extensions) {
      if (ext.disabled) continue;
      for (const script of ext.scripts) {
        if (script.event !== event) continue;
        const match = script.match;
        if (!match || ((!match.urls || match.urls.length === 0) && (!match.labels || match.labels.length === 0))) {
          continue;
        }
        let ok = false;
        if (match.urls?.length) {
          ok = match.urls.some((p) => matchUrlPattern(p, url));
        }
        if (!ok && match.labels?.length && labels) {
          ok = match.labels.some((k) => Object.prototype.hasOwnProperty.call(labels, k));
        }
        if (ok) {
          hits.push({ ext, entry: script.entry });
        }
      }
    }
    return hits;
  }

  private async readScript(ext: Extension, entry: string): Promise<string> {
    if (!isTauri()) {
      throw new Error('extension script load requires Tauri');
    }
    const { readTextFile } = await import('@tauri-apps/plugin-fs');
    const { join } = await import('@tauri-apps/api/path');
    const root = ext.devMode && ext.devPath ? ext.devPath : ext.installPath;
    const path = await join(root, entry);
    return readTextFile(path);
  }

  private async evalExtensionScript(
    ext: Extension,
    entry: string,
    event: ActivationEvent,
    ctx: unknown,
  ): Promise<{ result: unknown; storage: Record<string, unknown> }> {
    if (!isTauri()) {
      throw new Error('download_engine_eval_js requires Tauri');
    }
    const source = await this.readScript(ext, entry);
    const storage = { ...(this.storageMaps.get(ext.identity) ?? {}) };
    const prelude = buildGopeedPrelude({
      info: {
        identity: ext.identity,
        name: ext.name,
        title: ext.title,
        version: ext.version,
      },
      settings: settingsToMap(ext.settings),
      storage,
    });
    const code = `${prelude}\n${source}\n;__gopeed_run(${JSON.stringify(event)}, ${JSON.stringify(ctx)});`;
    const raw = await invoke<{
      result?: unknown;
      storage?: Record<string, unknown>;
    }>('download_engine_eval_js', {
      code,
      identity: ext.identity,
      event,
    });
    const nextStorage =
      raw && typeof raw === 'object' && raw.storage && typeof raw.storage === 'object'
        ? (raw.storage as Record<string, unknown>)
        : storage;
    this.storageMaps.set(ext.identity, nextStorage);
    this.persistStorage(ext.identity);
    return { result: raw?.result ?? raw, storage: nextStorage };
  }

  async triggerOnResolve(
    url: string,
    labels?: Record<string, string>,
  ): Promise<OnResolveContext | null> {
    const hits = this.matchExtensions('onResolve', url, labels);
    if (hits.length === 0) return null;

    let ctx: OnResolveContext = {
      req: { url, rawUrl: url, labels: labels ?? {} },
      res: null,
    };

    for (const { ext, entry } of hits) {
      try {
        const { result } = await this.evalExtensionScript(ext, entry, 'onResolve', ctx);
        ctx = mergeResolveContext(ctx, result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // 引擎命令不存在时跳过，避免阻断 probe
        if (/not found|unknown command|does not exist/i.test(msg)) {
          continue;
        }
        throw new Error(`[${ext.identity}] onResolve failed: ${msg}`);
      }
    }
    return ctx.res ? ctx : null;
  }

  async triggerTaskEvent(
    event: 'onStart' | 'onError' | 'onDone',
    taskCtx: OnTaskContext,
  ): Promise<void> {
    const url = taskCtx.task.url;
    const labels = (taskCtx.task.meta?.labels as Record<string, string> | undefined) ?? undefined;
    const hits = this.matchExtensions(event, url, labels);
    for (const { ext, entry } of hits) {
      try {
        await this.evalExtensionScript(ext, entry, event, taskCtx);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/not found|unknown command|does not exist/i.test(msg)) continue;
        console.warn(`[ExtensionHost] ${ext.identity} ${event}:`, msg);
      }
    }
  }
}

function mergeSettings(
  oldSettings: ExtensionSetting[],
  newSettings: ExtensionSetting[],
): ExtensionSetting[] {
  const merged: ExtensionSetting[] = newSettings.map((n) => {
    const prev = oldSettings.find((o) => o.name === n.name);
    if (!prev) return { ...n };
    return {
      ...n,
      value: prev.type === n.type ? prev.value : n.value,
    };
  });
  return merged;
}

function coerceSetting(value: unknown, type: ExtensionSetting['type']): unknown {
  if (type === 'boolean') return Boolean(value);
  if (type === 'number') {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return value == null ? '' : String(value);
}

function mergeResolveContext(ctx: OnResolveContext, result: unknown): OnResolveContext {
  if (!result || typeof result !== 'object') return ctx;
  const r = result as Record<string, unknown>;
  if ('req' in r || 'res' in r) {
    const typed = r as Partial<OnResolveContext>;
    return {
      req: typed.req ? { ...ctx.req, ...typed.req } : ctx.req,
      res: typed.res !== undefined ? typed.res : ctx.res,
    };
  }
  // 部分扩展直接返回 Resource 形态 { name, size, files }
  if ('name' in r || 'files' in r || 'size' in r) {
    return {
      req: ctx.req,
      res: {
        name: typeof r.name === 'string' ? r.name : ctx.res?.name,
        size: typeof r.size === 'number' ? r.size : ctx.res?.size,
        files: Array.isArray(r.files)
          ? (r.files as NonNullable<OnResolveContext['res']>['files'])
          : ctx.res?.files,
      },
    };
  }
  return ctx;
}

let sharedHost: ExtensionHost | null = null;

export function getExtensionHost(opts?: ExtensionHostOptions): ExtensionHost {
  if (!sharedHost) {
    sharedHost = new ExtensionHost(opts);
  }
  return sharedHost;
}

export function resetExtensionHostForTests(): void {
  sharedHost = null;
}
