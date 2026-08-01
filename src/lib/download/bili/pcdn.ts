/**
 * PCDN / 劣质镜像过滤（对照 BiliTools queue.urlFilter）
 */

const BAD_HOST =
  /(?:bcache|mcdn|pcdn|cn-[a-z]+-[a-z]+-[a-z]+-\d+)/i;
const GOOD_HINT = /(?:upos|mirror|bilivideo\.com|akamaized)/i;

export function filterStreamUrls(
  urls: string[],
  blockPcdn: boolean,
): string[] {
  if (!blockPcdn || urls.length <= 1) return urls.filter(Boolean);
  const good = urls.filter((u) => {
    try {
      const host = new URL(u).hostname;
      if (BAD_HOST.test(host) && !GOOD_HINT.test(host)) return false;
      return true;
    } catch {
      return false;
    }
  });
  return good.length ? good : urls.filter(Boolean);
}

export function pickBestUrl(urls: string[], blockPcdn: boolean): string {
  const filtered = filterStreamUrls(urls, blockPcdn);
  const preferred = filtered.find((u) => GOOD_HINT.test(u));
  return preferred || filtered[0] || '';
}
