/**
 * YouTube Music InnerTube WEB_REMIX 客户端
 */

import { request } from '@/lib/http';
import { isTauri } from '@/lib/platform/detect';
import { loadAuthSession } from '@/lib/media/audio/platform/auth/session';
import {
  YTM_ORIGIN,
  buildInnertubeHeaders,
} from '@/lib/media/audio/platform/api/ytm/auth-headers';

const INNERTUBE_API_KEY = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30';
const CLIENT_VERSION = '1.20250310.01.00';

export function webRemixContext(): Record<string, unknown> {
  return {
    client: {
      clientName: 'WEB_REMIX',
      clientVersion: CLIENT_VERSION,
      hl: 'zh-CN',
      gl: 'US',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    },
  };
}

export async function ytmCookies(): Promise<string | undefined> {
  const auth = await loadAuthSession('ytm');
  return auth?.cookies?.trim() || undefined;
}

export async function innertubePost<T>(
  endpoint: string,
  body: Record<string, unknown>,
  cookies?: string,
): Promise<T> {
  const cookie = cookies ?? (await ytmCookies());
  const url = `https://music.youtube.com/youtubei/v1/${endpoint}?prettyPrint=false&key=${INNERTUBE_API_KEY}`;
  const res = await request(url, {
    method: 'POST',
    headers: buildInnertubeHeaders(cookie),
    body: JSON.stringify({
      context: webRemixContext(),
      ...body,
    }),
    useBackendHttp: isTauri(),
    ignorePageNavigationAbort: true,
  });
  if (!res.ok) throw new Error(`InnerTube ${endpoint} HTTP ${res.status}`);
  return res.json<T>();
}

export { YTM_ORIGIN, INNERTUBE_API_KEY };
