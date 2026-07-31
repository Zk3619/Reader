/**
 * YouTube WebPO — 进程内 BotGuard mint（bgutils-js），不依赖外部 yt-dlp/bgutil 服务。
 */

import { BotGuardClient } from 'bgutils-js/botguard';
import { WebPoMinter } from 'bgutils-js/webpo';
import { buildURL, getHeaders } from 'bgutils-js/utils';
import type { WebPoSignalOutput } from 'bgutils-js/shared-types';
import {
  cachePoToken,
  extractVisitorData,
  getCachedPoToken,
} from './youtube-pot';

const REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo';

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

/**
 * 完整 WebPO：att/get → BotGuard snapshot → GenerateIT → mint。
 * 在 Tauri/Chromium 真实 DOM 下运行 bgutils-js。
 */
export async function mintWebPoToken(opts: MintPoTokenOptions = {}): Promise<string | null> {
  const binding = contentBinding(opts);
  if (!binding) return null;

  const cacheKey = `webpo:${opts.context || 'gvs'}:${binding.slice(0, 24)}`;
  const cached = getCachedPoToken(cacheKey);
  if (cached) return cached;

  try {
    const clientName = opts.clientName || 'WEB';
    const clientVersion = opts.clientVersion || '2.20260227.01.00';
    const innertubeContext = {
      client: {
        clientName,
        clientVersion,
        visitorData: opts.visitorData || undefined,
        hl: 'en',
        gl: 'US',
      },
    };

    const attResp = await fetch(
      'https://www.youtube.com/youtubei/v1/att/get?prettyPrint=false',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getHeaders(),
        },
        body: JSON.stringify({
          context: innertubeContext,
          engagementType: 'ENGAGEMENT_TYPE_UNBOUND',
        }),
      },
    );
    if (!attResp.ok) throw new Error(`att/get HTTP ${attResp.status}`);
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
    const interpJs = await (await fetch(interpUrl)).text();
    // 在页面全局装载 BotGuard VM
    // eslint-disable-next-line no-new-func
    new Function(interpJs)();

    const bgClient = await BotGuardClient.create({
      program: challenge.program,
      globalName: challenge.globalName,
      globalObject: globalThis,
    });

    const webPoSignalOutput: WebPoSignalOutput = [];
    const botguardResponse = await bgClient.snapshot({ webPoSignalOutput });

    const itResp = await fetch(buildURL('GenerateIT'), {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify([REQUEST_KEY, botguardResponse]),
    });
    const itJson = (await itResp.json()) as [
      string,
      number,
      number,
      string,
    ];
    const [integrityToken, estimatedTtlSecs] = itJson;
    if (!integrityToken) throw new Error('empty integrity token');

    const minter = await WebPoMinter.create(
      {
        integrityToken,
        estimatedTtlSecs,
        mintRefreshThreshold: itJson[2],
        websafeFallbackToken: itJson[3],
      },
      webPoSignalOutput,
    );
    const poToken = await minter.mintAsWebsafeString(binding);
    if (!poToken) throw new Error('empty poToken');

    cachePoToken(cacheKey, poToken);
    cachePoToken(clientName, poToken);
    return poToken;
  } catch (e) {
    console.warn('[youtube-webpo] mint failed', e);
    return null;
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
