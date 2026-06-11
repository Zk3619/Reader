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
