/**
 * MusicFree 插件 CommonJS 沙箱（对齐桌面/移动 Function + require 白名单，不复用 LX shim）
 */

import * as cheerio from 'cheerio';
import CryptoJS from 'crypto-js';
import dayjs from 'dayjs';
import bigInt from 'big-integer';
import qs from 'qs';
import he from 'he';
import * as webdav from 'webdav';
import {
  MF_PLUGIN_METHODS,
  type MfPluginDefine,
  type MfPluginMethodName,
} from '@/lib/media/audio/online/mf-plugin/types';
import { getMfUserVariables } from '@/lib/media/audio/online/mf-plugin/settings';
import { createMfAxios } from '@/lib/media/audio/online/mf-plugin/http-forwarder';

const mfAxios = createMfAxios();
mfAxios.defaults.timeout = 15_000;

const cookieStub = {
  get: async () => ({}),
  set: async () => false,
  flush: async () => undefined,
  clearAll: async () => undefined,
};

function buildRequireMap(): Record<string, unknown> {
  return {
    cheerio,
    'crypto-js': CryptoJS,
    axios: mfAxios,
    dayjs,
    'big-integer': bigInt,
    qs,
    he,
    webdav,
    '@react-native-cookies/cookies': cookieStub,
    'musicfree/storage': createPluginStorage(),
  };
}

function createPluginStorage() {
  const mem = new Map<string, string>();
  return {
    async getItem(key: string) {
      try {
        return localStorage.getItem(`mf_plugin_store:${key}`) ?? mem.get(key) ?? null;
      } catch {
        return mem.get(key) ?? null;
      }
    },
    async setItem(key: string, value: string) {
      mem.set(key, value);
      try {
        localStorage.setItem(`mf_plugin_store:${key}`, value);
      } catch {
        // ignore
      }
    },
    async removeItem(key: string) {
      mem.delete(key);
      try {
        localStorage.removeItem(`mf_plugin_store:${key}`);
      } catch {
        // ignore
      }
    },
  };
}

function sha256Hex(text: string): string {
  return CryptoJS.SHA256(text).toString(CryptoJS.enc.Hex);
}

export type MfLoadedPlugin = {
  hash: string;
  name: string;
  instance: MfPluginDefine;
  supportedMethods: MfPluginMethodName[];
  path?: string;
};

export type MfLoadPluginOptions = {
  code: string;
  pluginId: string;
  path?: string;
  appVersion?: string;
  os?: string;
  lang?: string;
};

function detectSupportedMethods(instance: MfPluginDefine): MfPluginMethodName[] {
  const out: MfPluginMethodName[] = [];
  for (const name of MF_PLUGIN_METHODS) {
    if (typeof instance[name] === 'function') out.push(name);
  }
  return out;
}

/**
 * 在沙箱中执行插件源码，返回实例与能力位。
 */
export function loadMfPluginCode(options: MfLoadPluginOptions): MfLoadedPlugin {
  const code = options.code.trim();
  if (!code) throw new Error('插件脚本为空');

  const packages = buildRequireMap();
  const _require = (name: string) => {
    const pkg = packages[name];
    if (pkg == null) {
      throw new Error(`MusicFree 插件不可 require: ${name}`);
    }
    if (typeof pkg === 'object' && pkg !== null && !('default' in (pkg as object))) {
      try {
        (pkg as { default?: unknown }).default = pkg;
      } catch {
        // ignore
      }
    }
    return pkg;
  };

  const env = {
    getUserVariables: () => getMfUserVariables(options.pluginId),
    get userVariables() {
      return getMfUserVariables(options.pluginId);
    },
    appVersion: options.appVersion ?? '0.1.0',
    os: options.os ?? detectOs(),
    lang: options.lang ?? 'zh-CN',
  };

  const moduleObj: { exports: unknown; loaded: boolean } = {
    exports: {},
    loaded: false,
  };
  const exportsObj = moduleObj.exports as Record<string, unknown>;

  // eslint-disable-next-line no-new-func -- MusicFree 官方加载方式
  const factory = new Function(
    'require',
    'module',
    'exports',
    'console',
    'env',
    'process',
    'URL',
    `${code}\n;return module.exports;`,
  );

  let exported: unknown;
  try {
    exported = factory(
      _require,
      moduleObj,
      exportsObj,
      console,
      env,
      { platform: env.os, env: { ...env } },
      URL,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`插件解析失败: ${msg}`);
  }

  const instance = (exported && typeof exported === 'object'
    ? exported
    : moduleObj.exports) as MfPluginDefine;

  if (!instance || typeof instance !== 'object') {
    throw new Error('插件未导出有效对象');
  }
  const platform = String(instance.platform ?? '').trim();
  if (!platform) {
    throw new Error('插件缺少 platform 字段');
  }

  const supportedMethods = detectSupportedMethods(instance);
  if (supportedMethods.length === 0) {
    throw new Error('插件未实现任何可识别方法');
  }

  return {
    hash: sha256Hex(code),
    name: platform,
    instance,
    supportedMethods,
    path: options.path,
  };
}

function detectOs(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('android')) return 'android';
  if (ua.includes('win')) return 'win32';
  if (ua.includes('mac')) return 'darwin';
  if (ua.includes('linux')) return 'linux';
  return 'unknown';
}

/** 粗判脚本是否像 MusicFree 插件（与 LX UserApi 区分） */
export function looksLikeMfPluginScript(code: string): boolean {
  const text = code.trim();
  if (!text) return false;
  // LX UserApi 常见特征
  if (
    /@name\s/i.test(text) &&
    (/lx\.|send\(['"]inited|EVENT_NAMES|userApi/i.test(text) ||
      /musicUrl|utils\.buffer\.from/i.test(text))
  ) {
    // 仍可能是 MF；若同时有 module.exports + platform 更偏 MF
    if (!/module\.exports\s*=/.test(text) && !/exports\./.test(text)) return false;
  }
  if (/module\.exports\s*=/.test(text) || /exports\.\w+\s*=/.test(text)) {
    return /platform\s*:/.test(text) && /getMediaSource|search\s*[:(]/.test(text);
  }
  return false;
}
