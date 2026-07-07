/**
 * 解析 Android SharedPreferences 备份 XML（Legado config.xml / config/config.xml）
 */

export type LegadoPrefValue = string | number | boolean;

export function parseLegadoSharedPrefsXml(xml: string): Record<string, LegadoPrefValue> {
  const map: Record<string, LegadoPrefValue> = {};
  if (!xml.trim()) return map;

  const tagRe =
    /<(string|int|long|float|boolean)\s+name="([^"]+)"(?:\s+value="([^"]*)")?[^>/]*(?:\/>|>([^<]*)<\/\1>)/g;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(xml)) !== null) {
    const [, tag, name, attrValue, textValue] = match;
    if (!name) continue;
    switch (tag) {
      case 'string':
        map[name] = textValue ?? attrValue ?? '';
        break;
      case 'int':
      case 'long': {
        const raw = attrValue ?? textValue;
        const n = Number(raw);
        if (Number.isFinite(n)) map[name] = n;
        break;
      }
      case 'float': {
        const raw = attrValue ?? textValue;
        const n = Number(raw);
        if (Number.isFinite(n)) map[name] = n;
        break;
      }
      case 'boolean': {
        const raw = (attrValue ?? textValue ?? '').toLowerCase();
        map[name] = raw === 'true' || raw === '1';
        break;
      }
      default:
        break;
    }
  }
  return map;
}
