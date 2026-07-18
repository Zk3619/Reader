/**
 * Python Spider 门面：本机 CPython 优先，Pyodide 降级
 */

import type { Result, Site, PyEngineKind } from '../types';
import type {
  CategoryArgs,
  PlayerArgs,
  SearchArgs,
  SpiderEngine,
} from './types';
import { emptyResult, parseResultJson } from './types';
import { getConfigUrl } from '../config/vod-config';
import { resolveConfigAssetUrl } from '../config/decoder';
import {
  destroyNativeWorker,
  nativePyInvoke,
  probeNativePython,
} from './py/native-runtime';
import {
  destroyOdideRuntime,
  odidePyInvoke,
  probePyodide,
} from './py/odide-runtime';

export type { PyEngineKind };

let preferred: PyEngineKind | null = null;
let lastDetail = '';

function isPyApi(api: string): boolean {
  if (!api || api.startsWith('csp_')) return false;
  return /\.py(\?|#|$)/i.test(api);
}

/** 相对路径 ./py/xx.py → 绝对 http(s) */
export function resolvePyApi(api: string, configUrl?: string): string {
  const base = configUrl || getConfigUrl();
  if (!api || api.startsWith('http://') || api.startsWith('https://') || api.startsWith('file:')) {
    return api;
  }
  if (base) return resolveConfigAssetUrl(api, base);
  return api;
}

export async function probePyBackend(force = false): Promise<{
  kind: PyEngineKind;
  detail: string;
}> {
  const native = await probeNativePython(force);
  if (native.ok) {
    preferred = 'native';
    lastDetail = `${native.cmd} ${native.version}`;
    return { kind: 'native', detail: lastDetail };
  }
  const odide = await probePyodide(force);
  if (odide.ok) {
    preferred = 'pyodide';
    lastDetail = 'Pyodide（能力子集，无 lxml）';
    return { kind: 'pyodide', detail: lastDetail };
  }
  preferred = 'unavailable';
  lastDetail = [native.error, odide.error].filter(Boolean).join(' | ');
  return { kind: 'unavailable', detail: lastDetail };
}

export async function getPyEngineKind(): Promise<PyEngineKind> {
  if (preferred) return preferred;
  return (await probePyBackend()).kind;
}

export function getPyEngineDetail(): string {
  return lastDetail;
}

async function invokePy(
  site: Site,
  method: string,
  args: unknown[],
): Promise<string> {
  const api = resolvePyApi(site.api);
  const payload = {
    api,
    ext: site.ext ?? '',
    method,
    args,
    siteKey: site.key,
  };

  const kind = preferred ?? (await probePyBackend()).kind;
  if (kind === 'native') {
    try {
      return await nativePyInvoke(payload);
    } catch (e) {
      // 本机失败时尝试一次 Pyodide
      console.warn('[tv-py] native failed, try pyodide', e);
      const odide = await probePyodide();
      if (odide.ok) {
        preferred = 'pyodide';
        lastDetail = 'Pyodide（native 失败后降级）';
        return await odidePyInvoke(payload);
      }
      throw e;
    }
  }
  if (kind === 'pyodide') {
    return await odidePyInvoke(payload);
  }
  throw new Error(
    lastDetail ||
      'Python 引擎不可用：请安装本机 Python 3，或允许联网以加载 Pyodide 降级运行时',
  );
}

async function call(site: Site, method: string, args: unknown[]): Promise<Result> {
  try {
    const raw = await invokePy(site, method, args);
    return parseResultJson(raw);
  } catch (e) {
    return {
      ...emptyResult(),
      msg: e instanceof Error ? e.message : String(e),
    };
  }
}

export const pyEngine: SpiderEngine = {
  kind: 'py',
  supports(site: Site) {
    return site.type === 3 && isPyApi(site.api);
  },
  homeContent(site, filter) {
    return call(site, 'homeContent', [filter]);
  },
  homeVideoContent(site) {
    return call(site, 'homeVideoContent', []);
  },
  categoryContent(site, args: CategoryArgs) {
    return call(site, 'categoryContent', [
      args.tid,
      args.pg,
      args.filter,
      args.extend,
    ]);
  },
  detailContent(site, ids) {
    return call(site, 'detailContent', [ids]);
  },
  searchContent(site, args: SearchArgs) {
    return call(site, 'searchContent', [args.key, args.quick, args.pg ?? '1']);
  },
  async playerContent(site, args: PlayerArgs) {
    try {
      return await call(site, 'playerContent', [args.flag, args.id, args.vipFlags]);
    } catch (e) {
      return {
        url: '',
        parse: 0,
        msg: e instanceof Error ? e.message : String(e),
      };
    }
  },
};

export function destroyPyWorker(): void {
  destroyNativeWorker();
  destroyOdideRuntime();
  preferred = null;
}
