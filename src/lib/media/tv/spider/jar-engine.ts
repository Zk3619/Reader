/**
 * JAR Spider 引擎：桌面 → tv-jar-host；Android → 真 DexClassLoader 插件
 */

import type { Result, Site, JarEngineKind } from '../types';
import type {
  CategoryArgs,
  PlayerArgs,
  SearchArgs,
  SpiderEngine,
} from './types';
import { emptyResult, parseResultJson } from './types';
import { resolveTvExtUrl } from './tv-js-module';

const JAR_INVOKE_TIMEOUT_MS = 75_000;

function siteExtForJar(site: Site, configUrl = ''): string {
  if (site.ext == null) return '';
  if (typeof site.ext === 'object') return JSON.stringify(site.ext);
  const raw = String(site.ext);
  if (!raw) return '';
  // 相对路径（如 ./lib/token.json）解析成绝对 URL，供 Spider.init 拉取
  if (
    configUrl &&
    !raw.trim().startsWith('{') &&
    !/^https?:\/\//i.test(raw) &&
    !raw.startsWith('file://')
  ) {
    // token.json$$$url 这类复合 ext：只解析第一段路径
    const parts = raw.split('$$$');
    parts[0] = resolveTvExtUrl(parts[0]!.trim(), configUrl);
    return parts.join('$$$');
  }
  return raw;
}

async function invokeJar(
  cmd: string,
  payload: Record<string, unknown>,
): Promise<string> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const out = await Promise.race([
        invoke<string>(cmd, payload),
        new Promise<string>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  `JAR 调用超时（${Math.round(JAR_INVOKE_TIMEOUT_MS / 1000)}s）：${payload.method ?? cmd}`,
                ),
              ),
            JAR_INVOKE_TIMEOUT_MS,
          );
        }),
      ]);
      return out ?? '';
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Tauri/RPC 常把 error 序列化为 {"message":"..."}；区分「引擎未就绪」与「Spider 运行失败」
    let detail = msg;
    try {
      const parsed = JSON.parse(msg) as { message?: string };
      if (parsed?.message) detail = parsed.message;
    } catch {
      /* keep raw */
    }
    if (/未找到 tv-jar-host|启动 tv-jar-host|连接 jar-host|unavailable|未就绪/i.test(detail)) {
      throw new Error(`JAR 引擎不可用: ${detail}`);
    }
    throw new Error(`JAR Spider 调用失败: ${detail}`);
  }
}

export async function getJarEngineKind(): Promise<JarEngineKind> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const kind = await invoke<string>('tv_jar_engine_kind');
    if (kind === 'dex-native' || kind === 'dex2jar-host') return kind;
    return 'unavailable';
  } catch {
    return 'unavailable';
  }
}

async function callSpider(
  site: Site,
  method: string,
  args: unknown[],
): Promise<Result> {
  try {
    let configUrl = '';
    try {
      const { getConfigUrl } = await import('../config/vod-config');
      configUrl = getConfigUrl() || '';
    } catch {
      /* */
    }
    const ext = siteExtForJar(site, configUrl);
    const raw = await invokeJar('tv_jar_invoke', {
      siteKey: site.key,
      api: site.api,
      ext,
      jar: site.jar ?? '',
      method,
      argsJson: JSON.stringify(args),
    });
    return parseResultJson(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // 盘搜等源缺 token / API 字段时 Gson NPE — 软失败，不抛给 searchAll
    if (/getAsString\(\).*null|JsonObject\.get\(String\).*null|NullPointerException/i.test(msg)) {
      const soft =
        '该源返回数据缺少必要字段（常见于未配置阿里/夸克 token 的盘搜类源）。请在站点 ext 填写 token，或换带登录配置的源。';
      console.warn('[TV] JAR Spider', method, site.key, soft);
      return { ...emptyResult(), msg: soft };
    }
    // homeContent 返回 HTML/空串等非 JSON —— 软失败，避免整页红字
    if (
      /JSONException|JSONObject text must begin|not a JSONObject|Unexpected character/i.test(msg)
    ) {
      const soft = '该源 home 返回非 JSON（源站异常、需登录或 jar/api 不匹配）';
      console.warn('[TV] JAR Spider', method, site.key, soft, msg);
      return { ...emptyResult(), msg: soft };
    }
    console.error('[TV] JAR Spider', method, site.key, e);
    return {
      ...emptyResult(),
      msg,
    };
  }
}

export const jarEngine: SpiderEngine = {
  kind: 'jar',
  supports(site) {
    return site.type === 3 && site.api.startsWith('csp_');
  },
  homeContent(site, filter) {
    return callSpider(site, 'homeContent', [filter]);
  },
  homeVideoContent(site) {
    return callSpider(site, 'homeVideoContent', []);
  },
  categoryContent(site, args: CategoryArgs) {
    return callSpider(site, 'categoryContent', [
      args.tid,
      args.pg,
      args.filter,
      args.extend,
    ]);
  },
  detailContent(site, ids) {
    return callSpider(site, 'detailContent', [ids]);
  },
  searchContent(site, args: SearchArgs) {
    return callSpider(site, 'searchContent', [args.key, args.quick, args.pg ?? '1']);
  },
  playerContent(site, args: PlayerArgs) {
    return callSpider(site, 'playerContent', [args.flag, args.id, args.vipFlags]);
  },
};

/** 无侧车时的降级引擎：明确报错 */
export const jarUnavailableEngine: SpiderEngine = {
  kind: 'jar-unavailable',
  supports(site) {
    return jarEngine.supports(site);
  },
  async homeContent() {
    return {
      ...emptyResult(),
      msg: '当前平台 JAR/Dex 引擎未就绪（桌面需构建并放置 tv-jar-host.jar，Android 需 TvSpiderPlugin）。此配置多为 csp_* JAR 源，无法在引擎未就绪时拉取首页。',
    };
  },
  async homeVideoContent() {
    return emptyResult();
  },
  async categoryContent() {
    return emptyResult();
  },
  async detailContent() {
    return {
      ...emptyResult(),
      msg: '当前平台 JAR/Dex 引擎未就绪，无法拉取详情。',
    };
  },
  async searchContent() {
    return emptyResult();
  },
  async playerContent() {
    return { url: '', parse: 0, msg: 'JAR 引擎不可用' };
  },
};
