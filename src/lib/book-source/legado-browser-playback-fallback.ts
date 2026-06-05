/**
 * 正文 ruleContent JS 失败时的播放链回退（咕咕番等：章节 HTML → mizhi_json → artplayer 内嵌页）
 */

import { postBookSourcePage } from '@/lib/book-source/source-http-cf';
import type { BookSource } from '@/types';

const PLAYER_VID_RE = /"url":"([a-z0-9-]+)"/i;

export function chapterHtmlHasPlayerVid(html: string): boolean {
  return PLAYER_VID_RE.test(html);
}

/** 与 1780106748 咕咕番 ruleContent 一致 */
export function contentRuleUsesMizhiArtplayerChain(ruleContent: string): boolean {
  const t = ruleContent.trim();
  return /mizhi_json\.php/i.test(t) && /artplayer\.php/i.test(t);
}

export async function tryResolveMizhiArtplayerBrowserUrl(
  chapterHtml: string,
  source: BookSource,
): Promise<string | null> {
  const vid = chapterHtml.match(PLAYER_VID_RE)?.[1];
  if (!vid) return null;

  const time = Math.floor(Date.now() / 1000);
  const apiUrl = 'https://player.gugu3.com/admin/mizhi_json.php';
  const body = `url=${vid}&time=${time}&key=&vkey=7fd97854c62c13bd`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent':
      'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
    Referer: 'https://player.gugu3.com/',
  };

  try {
    const res = await postBookSourcePage(source, apiUrl, body, {
      headers,
      timeout: 60_000,
    });
    const json = JSON.parse(String(res ?? '').trim()) as { url?: string };
    const purl = json?.url?.trim();
    if (!purl) return null;
    return `https://api.nxvav.cn/api/m3u8/artplayer.php?pip=false&url=${encodeURIComponent(purl)}`;
  } catch (e) {
    console.warn('[content] mizhi_json 播放链回退失败', e);
    return null;
  }
}
