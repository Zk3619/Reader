/**
 * Optional browser fingerprint for extractors that upstream mark `impersonate=True`.
 *
 * 回退顺序见 curl-impersonate.ts：wreq JA3 → curl-impersonate → Client-Hints。
 * 关闭 JA3：VITE_YTDLP_TLS_IMPERSONATE=0（见 ja3-sites.ts）。
 */

export type ImpersonateProfile = 'chrome' | 'chrome-120' | 'chrome-131' | 'edge' | 'safari';

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const EDGE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';
const SAFARI_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';

export function resolveImpersonateProfile(
  value: boolean | string | undefined | null,
): ImpersonateProfile | null {
  if (!value) return null;
  if (value === true) return 'chrome';
  const v = String(value).toLowerCase();
  if (v === '1' || v === 'true' || v === 'chrome') return 'chrome';
  if (v.includes('120')) return 'chrome-120';
  if (v.includes('131') || v === 'chrome-131') return 'chrome-131';
  if (v.includes('edge')) return 'edge';
  if (v.includes('safari')) return 'safari';
  return 'chrome';
}

/** Headers approximating a desktop Chromium Client Hints profile. */
export function impersonateHeaders(profile: ImpersonateProfile): Record<string, string> {
  if (profile === 'safari') {
    return {
      'User-Agent': SAFARI_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    };
  }
  const ua = profile === 'edge' ? EDGE_UA : CHROME_UA;
  const ver = profile === 'chrome-120' ? '120' : '131';
  return {
    'User-Agent': ua.replace(/Chrome\/\d+/, `Chrome/${ver}`),
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'sec-ch-ua': `"Google Chrome";v="${ver}", "Chromium";v="${ver}", "Not_A Brand";v="24"`,
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
  };
}
