/**
 * Sites / IE keys that benefit from TLS JA3 impersonation (wreq Emulation /
 * curl-impersonate fallback).
 *
 * 进程内 JA3 需 Cargo `tls-impersonate`（enhanced 默认；或 READER_TLS_IMPERSONATE=1）。
 * 前端门控：`VITE_YTDLP_TLS_IMPERSONATE=1` 才启用；缺省 / `0` 为关闭。
 *
 * 统一体验：lite 与 enhanced 用同一套 `unsupportedJa3SiteMessage` / `isTlsImpersonateBuild`；
 * 差异只在构建是否注入 VITE_YTDLP_TLS_IMPERSONATE / VITE_VIDEO_PROFILE。
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
 * JA3 路径是否启用。
 * - VITE_YTDLP_TLS_IMPERSONATE=1 → 开
 * - VITE_YTDLP_TLS_IMPERSONATE=0 → 关
 * - 未设置时：enhanced 构建（VITE_VIDEO_PROFILE=enhanced）默认开
 */
export function isTlsImpersonateBuild(): boolean {
  const flag = import.meta.env.VITE_YTDLP_TLS_IMPERSONATE;
  if (flag === '1') return true;
  if (flag === '0') return false;
  return import.meta.env.VITE_VIDEO_PROFILE === 'enhanced';
}

/** Human-readable JA3 status for UI / smoke. */
export function ja3BuildStatus(): {
  enabled: boolean;
  profile: string;
  flag: string;
} {
  return {
    enabled: isTlsImpersonateBuild(),
    profile: String(import.meta.env.VITE_VIDEO_PROFILE || 'lite'),
    flag: String(import.meta.env.VITE_YTDLP_TLS_IMPERSONATE ?? '(unset)'),
  };
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
  const st = ja3BuildStatus();
  return (
    `[ytdlp] 站点 ${site}（${ieKey}）需要 JA3，当前未启用` +
    `（profile=${st.profile}, VITE_YTDLP_TLS_IMPERSONATE=${st.flag}）。` +
    `请用 tauri:dev:enhanced，或设置 VITE_YTDLP_TLS_IMPERSONATE=1 / READER_TLS_IMPERSONATE=1。` +
    `${meta?.note ? ` ${meta.note}` : ''}`
  );
}
