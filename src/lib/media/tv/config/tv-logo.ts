/**
 * 影视首页 logo：Android WebView 解码远程 GIF 会 native 闪退，进首页来不及出错误。
 */

import { isAndroid } from '@/lib/platform/detect';
import { resolveConfigAssetUrl } from './decoder';

export function tvSafeDisplayLogoUrl(
  raw: string | undefined,
  configUrl: string,
  opts?: { skipAnimatedGif?: boolean },
): string {
  const src = (raw ?? '').trim();
  if (!src) return '';
  const url = resolveConfigAssetUrl(src, configUrl);
  if (!url) return '';
  const skipGif = opts?.skipAnimatedGif ?? isAndroid();
  if (skipGif && /\.gif(\?|#|$)/i.test(url)) return '';
  return url;
}
