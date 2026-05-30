export function isRuleExpression(expr: string): boolean {
  const t = expr.trim();
  if (!t) return false;
  if (
    t.startsWith('@') ||
    t.startsWith('$.') ||
    t.startsWith('$[') ||
    t.startsWith('//') ||
    t.startsWith('@@') ||
    t.startsWith(':')
  ) {
    return true;
  }
  if (t.includes('&&') || t.includes('||') || t.includes('%%') || t.includes('##')) return true;
  if (/^<js>[\s\S]*<\/js>$/i.test(t)) return true;
  // Legado CSS @ 链（如 .cover_m@img@src、td.1@a@href），解析失败时不应被 resolveUrl 拼成 http URL
  if (
    /^[.#\[:>*a-zA-Z]/.test(t) &&
    t.includes('@') &&
    !/^https?:\/\//i.test(t) &&
    !t.startsWith('data:')
  ) {
    return true;
  }
  return false;
}
