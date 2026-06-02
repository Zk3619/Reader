/**
 * 正文 imageDecode 规则（对齐 Legado ContentRule.imageDecode）
 * 对 HTML 内图片 URL 逐条执行 JS/规则后再写回 src
 */

import type { BookSource } from '@/types';
import { analyzeString, type RuleContext } from '@/lib/rule-engine';
import { evalJs } from '@/lib/js-engine';
import { resolveUrl } from '@/lib/book-source/utils';

const IMG_SRC_RE = /<img([^>]*)\ssrc=(["'])([^"']+)\2/gi;

/**
 * 对正文 HTML 应用 imageDecode 脚本
 * @param imageDecode 书源规则（可为 @js: / <js> / 模板）
 */
export async function applyImageDecode(
  html: string,
  imageDecode: string,
  baseUrl: string,
  source?: BookSource,
  options?: { onScriptToast?: (msg?: unknown, level?: unknown) => void },
): Promise<string> {
  const rule = imageDecode.trim();
  if (!rule || !html.includes('<img')) return html;

  const matches: Array<{ full: string; prefix: string; quote: string; src: string }> = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(IMG_SRC_RE.source, 'gi');
  while ((m = re.exec(html)) !== null) {
    matches.push({
      full: m[0],
      prefix: m[1],
      quote: m[2],
      src: m[3],
    });
  }
  if (matches.length === 0) return html;

  let out = html;
  for (const item of matches) {
    const absUrl = resolveUrl(baseUrl, item.src);
    const ctx: RuleContext = {
      content: html,
      contentType: 'html',
      baseUrl,
      result: absUrl,
      source: source as unknown as Record<string, unknown>,
      onScriptToast: options?.onScriptToast,
    };

    let decoded = absUrl;
    try {
      if (rule.startsWith('@js:') || rule.includes('<js>')) {
        const jsBody = rule.replace(/^@js:/i, '').trim();
        const v = await evalJs(jsBody, {
          result: absUrl,
          baseUrl,
          source: source as unknown as Record<string, unknown>,
          bookSource: source,
          onScriptToast: options?.onScriptToast,
        });
        const vStr = v == null ? '' : String(v).trim();
        decoded = vStr || absUrl;
      } else {
        decoded = (await analyzeString(rule, ctx)).trim() || absUrl;
      }
    } catch (e) {
      console.warn('[image-decode] 单图解码失败', absUrl, e);
    }

    if (decoded && decoded !== item.src) {
      const replacement = `<img${item.prefix} src=${item.quote}${decoded}${item.quote}`;
      out = out.replace(item.full, replacement);
    }
  }

  return out;
}
