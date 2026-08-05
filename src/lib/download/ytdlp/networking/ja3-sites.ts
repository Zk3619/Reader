/**
 * Sites / IE keys that benefit from TLS JA3 impersonation (wreq Emulation /
 * curl-impersonate fallback).
 *
 * 进程内 JA3 需 Cargo `tls-impersonate`（enhanced 默认；或 READER_TLS_IMPERSONATE=1）。
 * 前端门控：`VITE_YTDLP_TLS_IMPERSONATE=1` 才启用；缺省 / `0` 为关闭。
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
 * JA3 路径是否启用。仅当构建显式注入 VITE_YTDLP_TLS_IMPERSONATE=1。
 */
export function isTlsImpersonateBuild(): boolean {
  return import.meta.env.VITE_YTDLP_TLS_IMPERSONATE === '1';
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
    `[ytdlp] 站点 ${site}（${ieKey}）需要 JA3，但当前构建未启用（需 enhanced 或 VITE_YTDLP_TLS_IMPERSONATE=1）。` +
    `${meta?.note ? ` ${meta.note}` : ''}`
  );
}
