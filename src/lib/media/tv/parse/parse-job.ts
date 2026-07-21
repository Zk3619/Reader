/**
 * 解析器任务：type0 嗅探 / type1 JSON / type2–3 JAR / type4 超级并行；失败换下一个
 * type4 对齐 FongMi ParseJob.superParse：并行打 type1 + 聚合 type0 嗅探，先到先得
 */

import { tvGet, tvRequest } from '../net/rules';
import * as VodConfig from '../config/vod-config';
import type { Parse, Result } from '../types';
import { sniffParseUrl } from './sniff';

export type ParseAttempt = {
  name: string;
  ok: boolean;
  error?: string;
};

function parsesOfType(type: number, flag: string): Parse[] {
  return VodConfig.getParses().filter((p) => {
    if (p.type !== type) return false;
    const flags = p.ext?.flag;
    if (!flags?.length) return true;
    return flags.includes(flag);
  });
}

function buildJsonEndpoint(parseUrl: string, playUrl: string): string {
  const sep = parseUrl.includes('?')
    ? parseUrl.endsWith('=') || parseUrl.includes('url=')
      ? ''
      : '&url='
    : '';
  return parseUrl.includes('?')
    ? `${parseUrl}${sep}${encodeURIComponent(playUrl)}`
    : `${parseUrl}${playUrl}`;
}

async function tryJsonParse(
  p: Parse,
  url: string,
  header?: Record<string, string>,
): Promise<{ url: string; header?: Record<string, string> } | null> {
  const endpoint = buildJsonEndpoint(p.url, url);
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
    };
    const out = json.url || json.data?.url;
    // FongMi：url.length > 40 才视为成功
    if (out && String(out).length > 40) {
      return {
        url: out,
        header: { ...(header ?? {}), ...(json.header ?? {}) },
      };
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function tryWebSniff(
  p: Parse,
  url: string,
  header?: Record<string, string>,
): Promise<string | null> {
  const sniffUrl = p.url + url;
  const hit = await sniffParseUrl(sniffUrl, {
    ...(header ?? {}),
    ...(p.ext?.header ?? {}),
  });
  if (hit) return hit;
  const res = await tvRequest(sniffUrl, {
    method: 'GET',
    headers: { ...(header ?? {}), ...(p.ext?.header ?? {}) },
    timeout: 12000,
    allowNon2xx: true,
  });
  const text = await res.text();
  const m = text.match(/https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4|flv)[^\s"'<>]*/i);
  return m?.[0] ?? null;
}

/**
 * type=4 超级解析：所有 type1 并行 + type0 串行嗅探竞速，首个有效结果胜出
 */
export async function runSuperParse(
  url: string,
  flag: string,
  header?: Record<string, string>,
): Promise<Result & { parseAttempts?: ParseAttempt[] }> {
  const jsonParses = parsesOfType(1, flag);
  const webParses = parsesOfType(0, flag);
  const attempts: ParseAttempt[] = [];

  if (!jsonParses.length && !webParses.length) {
    return {
      url,
      parse: 1,
      header,
      flag,
      msg: '超级解析：无可用 type0/1 解析器',
      parseAttempts: attempts,
    };
  }

  return new Promise((resolve) => {
    let settled = false;
    const finishOk = (name: string, outUrl: string, outHeader?: Record<string, string>) => {
      if (settled) return;
      settled = true;
      attempts.push({ name, ok: true });
      resolve({
        url: outUrl,
        parse: 0,
        header: outHeader ?? header,
        flag,
        parseAttempts: attempts,
      });
    };
    const finishFail = () => {
      if (settled) return;
      settled = true;
      resolve({
        url,
        parse: 1,
        header,
        flag,
        msg: `超级解析失败：${attempts.map((a) => `${a.name}(${a.error || 'fail'})`).join(' → ')}`,
        parseAttempts: attempts,
      });
    };

    const tasks: Promise<void>[] = [];

    for (const p of jsonParses) {
      tasks.push(
        (async () => {
          try {
            const hit = await tryJsonParse(p, url, header);
            if (hit) finishOk(p.name, hit.url, hit.header);
            else attempts.push({ name: p.name, ok: false, error: 'no url in json' });
          } catch (e) {
            attempts.push({
              name: p.name,
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        })(),
      );
    }

    if (webParses.length) {
      tasks.push(
        (async () => {
          for (const p of webParses) {
            if (settled) return;
            try {
              const hit = await tryWebSniff(p, url, header);
              if (hit) {
                finishOk(p.name, hit);
                return;
              }
              attempts.push({ name: p.name, ok: false, error: 'sniff miss' });
            } catch (e) {
              attempts.push({
                name: p.name,
                ok: false,
                error: e instanceof Error ? e.message : String(e),
              });
            }
          }
        })(),
      );
    }

    void Promise.all(tasks).then(() => finishFail());
  });
}

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
      if (p.type === 4) {
        const superResult = await runSuperParse(url, flag, header);
        attempts.push(...(superResult.parseAttempts ?? []));
        if (superResult.parse === 0 && superResult.url && superResult.url !== url) {
          return { ...superResult, parseAttempts: attempts };
        }
        // 超级解析失败则继续后续解析器
        continue;
      }
      if (p.type === 1) {
        const hit = await tryJsonParse(p, url, header);
        if (hit) {
          attempts.push({ name: p.name, ok: true });
          return {
            url: hit.url,
            parse: 0,
            header: hit.header,
            flag,
            parseAttempts: attempts,
          };
        }
        attempts.push({ name: p.name, ok: false, error: 'no url in json' });
      } else if (p.type === 0) {
        const hit = await tryWebSniff(p, url, header);
        if (hit) {
          attempts.push({ name: p.name, ok: true });
          return { url: hit, parse: 0, flag, parseAttempts: attempts };
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
