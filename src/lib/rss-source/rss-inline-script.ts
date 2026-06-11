/**
 * 内联 <script> 安全嵌入（srcdoc / iframe）
 */

/** 防止内联脚本中的 </script> 提前闭合标签 */
export function escapeInlineScriptSource(code: string): string {
  return code.replace(/<\/script/gi, '<\\/script');
}

export function inlineScriptTag(code: string | undefined | null): string {
  const body = escapeInlineScriptSource((code ?? '').trim());
  if (!body) return '';
  return `<script>${body}</script>`;
}

/** 防止 analyze 结果内联脚本中的 </script> 被 HTML 解析器截断 */
export function sanitizeHtmlInlineScripts(html: string): string {
  return html.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (_m, open, body, close) => {
    return `${open}${escapeInlineScriptSource(body)}${close}`;
  });
}
