/**
 * B 站 API tryFetch：WBI + Gaia(-352) 闭环
 */

import { request } from '@/lib/http';
import { isTauri } from '@/lib/platform/detect';
import { BiliError, getRandomInRange } from './error';
import { getBiliCookieString, getBiliRequestHeaders } from './session';
import { signWbiQuery } from './wbi';

export type GaiaCaptchaResult = {
  challenge: string;
  validate: string;
  seccode: string;
};

type GaiaHandler = (
  gt: string,
  challenge: string,
) => Promise<GaiaCaptchaResult>;

let gaiaHandler: GaiaHandler | null = null;

/** UI 注入 Geetest 校验（仅风控，非登录） */
export function setGaiaCaptchaHandler(handler: GaiaHandler | null): void {
  gaiaHandler = handler;
}

export type TryFetchOptions = {
  auth?: 'wbi';
  params?: Record<string, string | number | undefined>;
  post?: {
    type: 'json' | 'form';
    body?: Record<string, string | number | undefined>;
  };
  type?: 'text' | 'binary' | 'blob' | 'url';
  times?: number;
  ignoreErr?: boolean;
  headers?: Record<string, string>;
};

export async function tryFetch(
  url: string,
  options?: TryFetchOptions,
): Promise<unknown> {
  let griskId = '';
  const times = options?.times ?? 3;
  for (let i = 0; i < times; i++) {
    const rawParams: Record<string, string | number | undefined> = {
      ...options?.params,
      ...(griskId ? { gaia_vtoken: griskId } : {}),
    };
    let fullUrl = url.replace(/^http:/, 'https:');
    if (options?.auth === 'wbi') {
      const qs = await signWbiQuery(rawParams, getBiliCookieString());
      fullUrl += (fullUrl.includes('?') ? '&' : '?') + qs;
    } else if (options?.params && Object.keys(rawParams).length) {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(rawParams)) {
        if (v === undefined || v === null) continue;
        sp.set(k, String(v));
      }
      const qs = sp.toString();
      if (qs) fullUrl += (fullUrl.includes('?') ? '&' : '?') + qs;
    }

    const headers: Record<string, string> = {
      ...getBiliRequestHeaders(),
      ...options?.headers,
    };
    let method: 'GET' | 'POST' = 'GET';
    let body: string | undefined;
    if (options?.post) {
      method = 'POST';
      if (options.post.type === 'json') {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(options.post.body ?? {});
      } else {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        const sp = new URLSearchParams();
        for (const [k, v] of Object.entries({
          ...options.params,
          ...options.post.body,
        })) {
          if (v === undefined || v === null) continue;
          sp.set(k, String(v));
        }
        // form POST：参数进 body
        body = sp.toString();
        // 去掉 URL 上重复的 query（若仅 post）
        if (!options.auth && options.params) {
          fullUrl = url.replace(/^http:/, 'https:');
        }
      }
    }

    const response = await request(fullUrl, {
      method,
      headers,
      body,
      useBackendHttp: isTauri(),
      timeout: 30000,
      retry: 0,
      allowNon2xx: true,
    });

    if (options?.type === 'url') {
      return response.url;
    }
    if (options?.type === 'text') {
      if (!response.ok) {
        throw new BiliError(response.statusText, { code: response.status });
      }
      return await response.text();
    }
    if (options?.type === 'binary') {
      if (!response.ok) {
        throw new BiliError(response.statusText, { code: response.status });
      }
      return await response.arrayBuffer();
    }
    if (options?.type === 'blob') {
      if (!response.ok) {
        throw new BiliError(response.statusText, { code: response.status });
      }
      const buf = await response.arrayBuffer();
      return new Blob([buf]);
    }

    const bodyJson = (await response.json()) as {
      code?: number;
      message?: string;
      msg?: string;
      data?: { v_voucher?: string; [k: string]: unknown };
      result?: unknown;
    };

    if (bodyJson.code === 0 || bodyJson.code === undefined) {
      return bodyJson;
    }

    if (bodyJson.code === -352 && bodyJson.data && i < times - 1) {
      const csrf =
        getBiliCookieString().match(/bili_jct=([^;]+);?/)?.[1] || '';
      const captchaParams = new URLSearchParams({
        v_voucher: String(bodyJson.data.v_voucher ?? ''),
        ...(csrf ? { csrf } : {}),
      });
      const captchaResp = await request(
        `https://api.bilibili.com/x/gaia-vgate/v1/register?${captchaParams}`,
        {
          method: 'POST',
          headers: getBiliRequestHeaders(),
          useBackendHttp: isTauri(),
          timeout: 30000,
          retry: 0,
          allowNon2xx: true,
        },
      );
      const captchaBody = (await captchaResp.json()) as {
        code?: number;
        message?: string;
        data?: {
          token?: string;
          geetest?: { gt?: string; challenge?: string };
        };
      };
      if (captchaBody.code !== 0) {
        throw new BiliError(captchaBody.message || 'Gaia register failed', {
          code: captchaBody.code,
        });
      }
      const token = captchaBody.data?.token;
      const gt = captchaBody.data?.geetest?.gt ?? '';
      const challenge = captchaBody.data?.geetest?.challenge ?? '';
      if (!token || !gt || !challenge) {
        throw new BiliError(bodyJson.message || bodyJson.msg || '风控校验失败', {
          code: bodyJson.code,
        });
      }
      if (!gaiaHandler) {
        throw new BiliError(
          '触发 B 站风控(-352)，请在哔哩页完成验证码后重试',
          { code: -352 },
        );
      }
      const captcha = await gaiaHandler(gt, challenge);
      const validateParams = new URLSearchParams({
        token,
        ...captcha,
        ...(csrf ? { csrf } : {}),
      });
      const validateResp = await request(
        `https://api.bilibili.com/x/gaia-vgate/v1/validate?${validateParams}`,
        {
          method: 'POST',
          headers: getBiliRequestHeaders(),
          useBackendHttp: isTauri(),
          timeout: 30000,
          retry: 0,
          allowNon2xx: true,
        },
      );
      const validateBody = (await validateResp.json()) as {
        code?: number;
        message?: string;
        data?: { is_valid?: boolean; grisk_id?: string };
      };
      if (validateBody.code !== 0 || !validateBody.data?.is_valid) {
        throw new BiliError(validateBody.message || '风控验证失败', {
          code: validateBody.code,
        });
      }
      griskId = validateBody.data.grisk_id ?? '';
      await new Promise((r) => setTimeout(r, getRandomInRange(100, 500)));
      continue;
    }

    if (options?.ignoreErr) return bodyJson;
    throw new BiliError(bodyJson.message || bodyJson.msg || `API ${bodyJson.code}`, {
      code: bodyJson.code,
    });
  }
  throw new BiliError('请求重试耗尽');
}
