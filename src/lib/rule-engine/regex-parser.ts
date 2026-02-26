/**
 * 正则表达式解析器
 * 对应 legado 项目的正则解析功能
 * 
 * 支持：
 * - 全局匹配
 * - 分组提取
 * - 多行匹配
 */

/**
 * 解析正则表达式规则
 */
export function parseRegex(pattern: string, text: string): string[] {
  if (!pattern || !text) {
    return [];
  }

  try {
    // 创建正则表达式（默认全局匹配）
    const regex = new RegExp(pattern, 'g');
    const results: string[] = [];

    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      // 如果有分组，优先使用第一个分组，否则使用整个匹配
      const result = match[1] !== undefined ? match[1] : match[0];
      if (result) {
        results.push(result);
      }

      // 避免无限循环（如果正则没有全局标志，但我们已经设置了g）
      if (match.index === regex.lastIndex) {
        regex.lastIndex++;
      }
    }

    return results.filter(r => r.trim().length > 0);
  } catch (error) {
    console.error('正则解析错误:', error, '规则:', pattern);
    return [];
  }
}
