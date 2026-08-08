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

const NOTE = '上游 impersonate=True；走 wreq Emulation / curl-impersonate';

function site(ieKey: string, siteName: string, note = NOTE): Ja3RequiredSite {
  return { ieKey, site: siteName, note };
}

/** Registry keys (YoutubeDL ie_key), not class names. */
export const JA3_REQUIRED_SITES: Ja3RequiredSite[] = [
  // XHamster
  site('XHamster', 'xhamster'),
  site('XHamsterEmbed', 'xhamster'),
  site('XHamsterUser', 'xhamster'),
  // WSJ
  site('wsj', 'wsj'),
  site('WSJ', 'wsj'),
  site('wsj:article', 'wsj'),
  // TikTok family
  site('TikTok', 'tiktok'),
  site('TikTokUser', 'tiktok'),
  site('TikTokLive', 'tiktok'),
  // Douyin：硬拦会误报「网络失败」；改由提取器 impersonate:true 软试 + X-Bogus/cookie
  // Instagram
  site('Instagram', 'instagram'),
  site('InstagramIOS', 'instagram'),
  site('InstagramUser', 'instagram'),
  site('InstagramTag', 'instagram'),
  site('InstagramStory', 'instagram'),
  // Vimeo
  site('Vimeo', 'vimeo'),
  site('VimeoChannel', 'vimeo'),
  site('VimeoAlbum', 'vimeo'),
  // PornHub
  site('PornHub', 'pornhub'),
  site('PornHubUser', 'pornhub'),
  site('PornHubPagedVideoList', 'pornhub'),
  site('PornHubPlaylist', 'pornhub'),
  // Kick / Reddit / SoundCloud / SpankBang / Truth
  site('Kick', 'kick'),
  site('KickVOD', 'kick'),
  site('Reddit', 'reddit'),
  site('Soundcloud', 'soundcloud'),
  site('SpankBang', 'spankbang'),
  site('SpankBangPlaylist', 'spankbang'),
  site('Truth', 'truthsocial'),
  // Misc upstream impersonate=True
  site('Chaturbate', 'chaturbate'),
  site('Iwara', 'iwara'),
  site('Floatplane', 'floatplane'),
  site('FloatplaneChannel', 'floatplane'),
  site('NineGag', '9gag'),
  // Mixcloud GraphQL / CDN 普通 TLS 可用，不硬拦 lite；提取器仍可传 impersonate 软试
  site('Patreon', 'patreon'),
  site('Nytimes', 'nytimes'),
  site('SampleFocus', 'samplefocus'),
  site('Mir24', 'mir24'),
  site('Telecinco', 'telecinco'),
  site('TV5MondePlus', 'tv5mondeplus'),
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
  const siteName = meta?.site || ieKey;
  const st = ja3BuildStatus();
  return (
    `[ytdlp] 站点 ${siteName}（${ieKey}）需要 JA3，当前未启用` +
    `（profile=${st.profile}, VITE_YTDLP_TLS_IMPERSONATE=${st.flag}）。` +
    `请用 tauri:dev:enhanced，或设置 VITE_YTDLP_TLS_IMPERSONATE=1 / READER_TLS_IMPERSONATE=1。` +
    `${meta?.note ? ` ${meta.note}` : ''}`
  );
}
