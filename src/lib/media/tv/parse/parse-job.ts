/**
 * 解析器任务：type0 嗅探 / type1 JSON / type2–3 JAR；失败换下一个
 */

import { tvGet, tvRequest } from '../net/rules';
import * as VodConfig from '../config/vod-config';
import type { Result } from '../types';
import { sniffParseUrl } from './sniff';

export type ParseAttempt = {
  name: string;
  ok: boolean;
  error?: string;
};

export async function runParseJob(
  url: string,
  flag: string,
  header?: Record<string, string>,
): Promise<Result & { parseAttempts?: ParseAttempt[] }> {
  const parses = VodConfig.getParses();
  const attempts: ParseAttempt[] = [];
  if (!parses.length) {
    return { url, parse: 0, header };
  }

  for (const p of parses) {
    try {
      if (p.type === 1) {
        const sep = p.url.includes('?') ? (p.url.endsWith('=') || p.url.includes('url=') ? '' : '&url=') : '';
        const endpoint = p.url.includes('?')
          ? `${p.url}${sep}${encodeURIComponent(url)}`
          : `${p.url}${url}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
          const body = await tvGet(endpoint, {
            headers: { ...(header ?? {}), ...(p.ext?.header ?? {}) },
            timeout: 15000,
            signal: controller.signal,
          });
          const json = JSON.parse(body) as {
            url?: string;
            data?: { url?: string };
            header?: Record<string, string>;
            code?: number;
          };
          const out = json.url || json.data?.url;
          if (out) {
            attempts.push({ name: p.name, ok: true });
            return {
              url: out,
              parse: 0,
              header: { ...(header ?? {}), ...(json.header ?? {}) },
              flag,
              parseAttempts: attempts,
            };
          }
          attempts.push({ name: p.name, ok: false, error: 'no url in json' });
        } finally {
          clearTimeout(timer);
        }
      } else if (p.type === 0) {
        const sniffUrl = p.url + url;
        const hit = await sniffParseUrl(sniffUrl, {
          ...(header ?? {}),
          ...(p.ext?.header ?? {}),
        });
        if (hit) {
          attempts.push({ name: p.name, ok: true });
          return { url: hit, parse: 0, flag, parseAttempts: attempts };
        }
        // 轻量正则回退（旧逻辑）
        const res = await tvRequest(sniffUrl, {
          method: 'GET',
          headers: { ...(header ?? {}), ...(p.ext?.header ?? {}) },
          timeout: 12000,
          allowNon2xx: true,
        });
        const text = await res.text();
        const m = text.match(/https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4|flv)[^\s"'<>]*/i);
        if (m?.[0]) {
          attempts.push({ name: p.name, ok: true });
          return { url: m[0], parse: 0, flag, parseAttempts: attempts };
        }
        attempts.push({ name: p.name, ok: false, error: 'sniff miss' });
      } else if (p.type === 2 || p.type === 3) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const raw = await invoke<string>('tv_jar_json_ext', {
            parseType: p.type,
            name: p.name,
            url,
            flag,
          });
          const json = JSON.parse(raw) as { url?: string };
          if (json.url) {
            attempts.push({ name: p.name, ok: true });
            return { url: json.url, parse: 0, flag, parseAttempts: attempts };
          }
          attempts.push({ name: p.name, ok: false, error: 'jsonExt empty' });
        } catch (e) {
          attempts.push({
            name: p.name,
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      } else {
        attempts.push({ name: p.name, ok: false, error: `unsupported type ${p.type}` });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[tv-parse]', p.name, msg);
      attempts.push({ name: p.name, ok: false, error: msg });
    }
  }

  return {
    url,
    parse: 1,
    header,
    flag,
    msg: `解析失败：${attempts.map((a) => `${a.name}(${a.error || 'fail'})`).join(' → ')}`,
    parseAttempts: attempts,
  };
}
