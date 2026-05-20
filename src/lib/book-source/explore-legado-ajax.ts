/**
 * Legado 发现项 URL：`https://host/path,{"method":"GET|POST",...}`
 * 其中部分 path 返回 JSON 书单列（如晴天 get_book_shelf / bookshelf），应走发现页而非 inner-web。
 */

import { parseAjaxArgs } from '@/lib/js-engine/legado/host/parse-ajax';

/** 返回 JSON `data: [{ book_name, book_id, ... }]` 的接口路径 */
const BOOK_LIST_AJAX_PATH =
  /\/(?:get_book_shelf|bookshelf|book_shelf|fqbookshelf)\b/i;

export function isLegadoAjaxExploreUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed.includes(',')) return false;
  const ajax = parseAjaxArgs(trimmed);
  if (!ajax) return false;
  const comma = trimmed.indexOf(',');
  const after = trimmed.slice(comma + 1).trim();
  return after.startsWith('{') || after.startsWith('[');
}

/** 是否为应进入发现列表的 Legado ajax URL（非内嵌 WebView） */
export function isLegadoAjaxBookListExploreUrl(url: string): boolean {
  if (!isLegadoAjaxExploreUrl(url)) return false;
  const ajax = parseAjaxArgs(url.trim());
  if (!ajax) return false;
  return BOOK_LIST_AJAX_PATH.test(ajax.urlStr);
}
