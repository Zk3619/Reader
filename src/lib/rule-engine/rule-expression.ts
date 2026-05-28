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
  return false;
}
