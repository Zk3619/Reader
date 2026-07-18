/**
 * 简繁转换（对齐 Legado AppConfig.chineseConverterType + ChineseUtils）
 *
 * 0 = 关闭，1 = 繁转简 (t2s)，2 = 简转繁 (s2t)
 */

export type ChineseConverterType = 0 | 1 | 2;

let t2sConverter: ((text: string) => string) | null = null;
let s2tConverter: ((text: string) => string) | null = null;
let loadPromise: Promise<void> | null = null;

async function ensureConverters(): Promise<void> {
  if (t2sConverter && s2tConverter) return;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const OpenCC = await import('opencc-js');
    t2sConverter = OpenCC.Converter({ from: 'tw', to: 'cn' });
    s2tConverter = OpenCC.Converter({ from: 'cn', to: 'tw' });
  })();
  return loadPromise;
}

export function isChineseConverterEnabled(type: ChineseConverterType): boolean {
  return type === 1 || type === 2;
}

/** 预加载 opencc 词典 */
export async function preloadChineseConverter(type: ChineseConverterType): Promise<void> {
  if (type === 0) return;
  await ensureConverters();
}

export async function convertChineseText(
  text: string,
  type: ChineseConverterType,
): Promise<string> {
  if (!text || type === 0) return text;
  await ensureConverters();
  if (type === 1) return t2sConverter!(text);
  if (type === 2) return s2tConverter!(text);
  return text;
}

/** 同步转换（须先 preloadChineseConverter）；未加载时原样返回 */
export function convertChineseSync(text: string, type: ChineseConverterType): string {
  if (!text || type === 0) return text;
  if (type === 1 && t2sConverter) return t2sConverter(text);
  if (type === 2 && s2tConverter) return s2tConverter(text);
  return text;
}
