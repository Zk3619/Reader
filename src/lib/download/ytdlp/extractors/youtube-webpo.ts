/**
 * YouTube WebPO — 进程内 BotGuard mint（bgutils-js），不依赖外部 yt-dlp/bgutil 服务。
 *
 * 1. YouTube/Google API 必须走 `@/lib/http`（后端），禁止浏览器 fetch（CORS）。
 * 2. BotGuard VM 在隔离 iframe 中加载，避免污染主 WebView。
 * 3. att/get 用 YouTube Innertube 头；GenerateIT 才用 bgutils getHeaders（protobuf）。
 * 4. cold-start token 仅用于 GVS URL 的 pot=，禁止写入 WEB 缓存 / 禁止塞进 player API。
 */

import { BotGuardClient } from 'bgutils-js/botguard';
import { WebPoMinter, decodeColdStartToken } from 'bgutils-js/webpo';
import { buildURL, getHeaders } from 'bgutils-js/utils';
import type { IntegrityTokenData, WebPoSignalOutput } from 'bgutils-js/shared-types';
import {
  cachePoToken,
  extractVisitorData,
  getCachedPoToken,
} from './youtube-pot';

const REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo';
const BG_SNAPSHOT_TIMEOUT_MS = 20_000;

export type WebPoContext = 'gvs' | 'player' | 'subs';

export interface MintPoTokenOptions {
  visitorData?: string | null;
  videoId?: string;
  /** gvs 默认用 visitorData；player/subs 用 videoId */
  context?: WebPoContext;
  webpage?: string;
  clientName?: string;
  clientVersion?: string;
}

function contentBinding(opts: MintPoTokenOptions): string | null {
  const ctx = opts.context || 'gvs';
  if (ctx === 'player' || ctx === 'subs') {
    return opts.videoId || null;
  }
  return (
    opts.visitorData ||
    (opts.webpage ? extractVisitorData(opts.webpage) : null) ||
    null
  );
}

/** cold-start 不能用于 Innertube serviceIntegrityDimensions */
export function isColdStartPoToken(token: string | null | undefined): boolean {
  const t = token?.trim();
  if (!t) return false;
  try {
    decodeColdStartToken(t);
    return true;
  } catch {
    return false;
  }
}

type BotGuardSandbox = {
  window: Window & typeof globalThis;
  dispose: () => void;
};

/** 隔离 Realm：写入 youtube base，降低 BotGuard 空文档 attestation 失败率 */
function openBotGuardSandbox(): BotGuardSandbox | null {
  if (typeof document === 'undefined') return null;
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
  iframe.setAttribute('title', 'ytdlp-botguard-sandbox');
  iframe.style.cssText =
    'position:fixed;left:-99999px;top:-99999px;width:1px;height:1px;opacity:0;pointer-events:none;border:0;';
  document.documentElement.appendChild(iframe);
  const w = iframe.contentWindow;
  const d = iframe.contentDocument;
  if (!w || !d) {
    iframe.remove();
    return null;
  }
  try {
    d.open();
    d.write(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><base href="https://www.youtube.com/"></head><body></body></html>',
    );
    d.close();
  } catch {
    /* keep empty doc */
  }
  return {
    window: w as Window & typeof globalThis,
    dispose: () => {
      iframe.remove();
    },
  };
}

/** 绕过 CORS：与 ytdlp `_httpGetText` 同路 */
async function backendRequest(opts: {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
}) {
  const { request } = await import('@/lib/http');
  return request(opts.url, {
    method: opts.method || 'GET',
    headers: opts.headers,
    body: opts.body,
    useBackendHttp: true,
    ignorePageNavigationAbort: true,
  });
}

function parseIntegrityTokenPayload(raw: unknown): IntegrityTokenData {
  if (Array.isArray(raw)) {
    return {
      integrityToken: typeof raw[0] === 'string' ? raw[0] : undefined,
      estimatedTtlSecs: typeof raw[1] === 'number' ? raw[1] : undefined,
      mintRefreshThreshold: typeof raw[2] === 'number' ? raw[2] : undefined,
      websafeFallbackToken: typeof raw[3] === 'string' ? raw[3] : undefined,
    };
  }
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    return {
      integrityToken: typeof o.integrityToken === 'string' ? o.integrityToken : undefined,
      estimatedTtlSecs: typeof o.estimatedTtlSecs === 'number' ? o.estimatedTtlSecs : undefined,
      mintRefreshThreshold:
        typeof o.mintRefreshThreshold === 'number' ? o.mintRefreshThreshold : undefined,
      websafeFallbackToken:
        typeof o.websafeFallbackToken === 'string' ? o.websafeFallbackToken : undefined,
    };
  }
  return {};
}

function cacheRealPoToken(cacheKey: string, clientName: string, poToken: string): string {
  cachePoToken(cacheKey, poToken);
  cachePoToken(clientName, poToken);
  return poToken;
}

/**
 * 完整 WebPO：att/get → BotGuard snapshot → GenerateIT → mint。
 */
export async function mintWebPoToken(opts: MintPoTokenOptions = {}): Promise<string | null> {
  const binding = contentBinding(opts);
  if (!binding) return null;

  const ctx = opts.context || 'gvs';
  const cacheKey = `webpo:${ctx}:${binding.slice(0, 24)}`;
  const cached = getCachedPoToken(cacheKey);
  if (cached) return cached;

  const clientName = opts.clientName || 'WEB';
  const sandbox = openBotGuardSandbox();
  try {
    const clientVersion = opts.clientVersion || '2.20260227.01.00';
    const visitorData = opts.visitorData?.trim() || undefined;
    const clientCtx: Record<string, unknown> = {
      clientName: 'WEB',
      clientVersion,
      hl: 'en',
      gl: 'US',
    };
    if (visitorData) clientCtx.visitorData = visitorData;

    // att/get：纯 Innertube JSON 头。禁止混入 getHeaders() 的 json+protobuf / x-goog-api-key
    // （否则 YouTube 返回 400 Invalid value ()）
    const attResp = await backendRequest({
      url: 'https://www.youtube.com/youtubei/v1/att/get?prettyPrint=false',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://www.youtube.com',
        Referer: 'https://www.youtube.com/',
        'X-YouTube-Client-Name': '1',
        'X-YouTube-Client-Version': clientVersion,
      },
      body: JSON.stringify({
        context: { client: clientCtx },
        engagementType: 'ENGAGEMENT_TYPE_UNBOUND',
      }),
    });
    if (!attResp.ok) {
      throw new Error(`att/get HTTP ${attResp.status}`);
    }
    const attestation = (await attResp.json()) as {
      bgChallenge?: {
        program?: string;
        globalName?: string;
        interpreterUrl?: {
          privateDoNotAccessOrElseTrustedResourceUrlWrappedValue?: string;
        };
      };
    };
    const challenge = attestation.bgChallenge;
    if (!challenge?.program || !challenge.globalName) {
      throw new Error('att/get missing bgChallenge');
    }

    const interpPath =
      challenge.interpreterUrl?.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue;
    if (!interpPath) throw new Error('missing interpreterUrl');
    const interpUrl = interpPath.startsWith('http') ? interpPath : `https:${interpPath}`;
    const interpRes = await backendRequest({ url: interpUrl, method: 'GET' });
    if (!interpRes.ok) {
      throw new Error(`interpreter HTTP ${interpRes.status}`);
    }
    const interpJs = await interpRes.text();

    const globalObject = sandbox?.window ?? globalThis;
    // eslint-disable-next-line no-new-func
    const loadInterp = new (
      globalObject as typeof globalThis & { Function: FunctionConstructor }
    ).Function(interpJs);
    loadInterp();

    const bgClient = await BotGuardClient.create({
      program: challenge.program,
      globalName: challenge.globalName,
      globalObject,
    });

    const webPoSignalOutput = (
      sandbox
        ? new (sandbox.window as unknown as { Array: ArrayConstructor }).Array()
        : []
    ) as WebPoSignalOutput;
    const botguardResponse = await bgClient.snapshot(
      { webPoSignalOutput },
      BG_SNAPSHOT_TIMEOUT_MS,
    );
    if (!botguardResponse?.trim()) {
      throw new Error('BotGuard snapshot empty');
    }
    if (!webPoSignalOutput[0]) {
      throw new Error('webPoSignalOutput missing minter factory');
    }

    // GenerateIT：仅 WAA protobuf 头
    const itResp = await backendRequest({
      url: buildURL('GenerateIT'),
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify([REQUEST_KEY, botguardResponse]),
    });
    if (!itResp.ok) {
      throw new Error(`GenerateIT HTTP ${itResp.status}`);
    }
    const integrityTokenData = parseIntegrityTokenPayload(await itResp.json());
    if (!integrityTokenData.integrityToken) {
      throw new Error(
        `empty integrity token: ${JSON.stringify(integrityTokenData)}`,
      );
    }

    const minter = await WebPoMinter.create(integrityTokenData, webPoSignalOutput);
    const poToken = await minter.mintAsWebsafeString(binding);
    if (!poToken) throw new Error('empty poToken');
    return cacheRealPoToken(cacheKey, clientName, poToken);
  } catch (e) {
    // BotGuard 在隔离 iframe 里常无法填充 webPoSignalOutput（非登录问题，是环境/Realm 限制）。
    // cold-start 对正式 googlevideo 下载帮助有限，直接返回 null，改走 ANDROID_VR 等客户端直链。
    console.warn('[youtube-webpo] mint unavailable, relying on alternate player clients', e);
    return null;
  } finally {
    sandbox?.dispose();
  }
}

/** 给 googlevideo URL 附加 GVS pot 查询参数 */
export function appendGvsPoToken(url: string, poToken: string | null | undefined): string {
  if (!poToken || !url) return url;
  try {
    const u = new URL(url);
    if (!u.searchParams.has('pot')) u.searchParams.set('pot', poToken);
    return u.toString();
  } catch {
    return url;
  }
}
