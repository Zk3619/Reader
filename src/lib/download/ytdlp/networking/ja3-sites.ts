/**
 * Sites / IE keys that benefit from TLS JA3 impersonation (wreq Emulation /
 * curl-impersonate fallback).
 *
 * In-process JA3（wreq）已默认编入全平台；可用 `VITE_YTDLP_TLS_IMPERSONATE=0` 关闭前端调用。
 */

export type Ja3RequiredSite = {
  ieKey: string;
  site: string;
  note: string;
};

/** Registry keys (YoutubeDL ie_key), not class names. */
export const JA3_REQUIRED_SITES: Ja3RequiredSite[] = [
  {
    ieKey: 'XHamster',
    site: 'xhamster',
    note: '上游 impersonate=True；走 wreq Emulation / curl-impersonate',
  },
  {
    ieKey: 'XHamsterEmbed',
    site: 'xhamster',
    note: '上游 impersonate=True；走 wreq Emulation / curl-impersonate',
  },
  {
    ieKey: 'XHamsterUser',
    site: 'xhamster',
    note: '上游 impersonate=True；走 wreq Emulation / curl-impersonate',
  },
  // Class IE_NAME is lowercase `wsj`; registry key is `WSJ`
  {
    ieKey: 'wsj',
    site: 'wsj',
    note: '上游 impersonate=True；走 wreq Emulation / curl-impersonate',
  },
  {
    ieKey: 'WSJ',
    site: 'wsj',
    note: '上游 impersonate=True；走 wreq Emulation / curl-impersonate',
  },
  {
    ieKey: 'wsj:article',
    site: 'wsj',
    note: '上游 impersonate=True；走 wreq Emulation / curl-impersonate',
  },
];

const JA3_IE_SET = new Set(
  JA3_REQUIRED_SITES.map((s) => s.ieKey.toLowerCase()),
);

/**
 * JA3 路径是否启用。wreq 已默认链接；仅当显式关闭 env 时返回 false。
 */
export function isTlsImpersonateBuild(): boolean {
  return import.meta.env.VITE_YTDLP_TLS_IMPERSONATE !== '0';
}

export function isJa3RequiredIeKey(ieKey?: string | null): boolean {
  if (!ieKey) return false;
  return JA3_IE_SET.has(String(ieKey).toLowerCase());
}

/**
 * When IE requires JA3 and JA3 was explicitly disabled → unsupported message.
 * Returns null when allowed.
 */
export function unsupportedJa3SiteMessage(ieKey?: string | null): string | null {
  if (!isJa3RequiredIeKey(ieKey)) return null;
  if (isTlsImpersonateBuild()) return null;
  const meta = JA3_REQUIRED_SITES.find(
    (s) => s.ieKey.toLowerCase() === String(ieKey).toLowerCase(),
  );
  const site = meta?.site || ieKey;
  return (
    `[ytdlp] 站点 ${site}（${ieKey}）需要 JA3，但当前已关闭（VITE_YTDLP_TLS_IMPERSONATE=0）。` +
    `${meta?.note ? ` ${meta.note}` : ''}`
  );
}
