import type { TextViewerUiConfig } from '@/lib/media/text/reader-ui-config';
import { composeSansFontStack } from '@/lib/ui/font-stack';

export const READER_FONT_PRESET_LABELS: Record<number, string> = {
  0: '系统默认',
  1: '衬线字体',
  2: '等宽字体',
  3: '本地字体文件',
  4: '自定义字体名',
};

export const READER_FONT_PRESET_IDS = [0, 1, 2, 3, 4] as const;

const PRESET_FAMILIES: Record<number, string> = {
  0: 'var(--font-sans)',
  1: composeSansFontStack('ui-serif, Georgia, "Noto Serif SC", serif'),
  2: 'ui-monospace, "Cascadia Code", Consolas, monospace',
};

const loadedFontFaces = new Set<string>();

function fontFaceId(path: string): string {
  let hash = 0;
  for (let i = 0; i < path.length; i++) {
    hash = (hash * 31 + path.charCodeAt(i)) | 0;
  }
  return `reader-font-${Math.abs(hash)}`;
}

/** 注册本地字体文件为 @font-face（WebView / 浏览器） */
export function ensureReaderFontFace(fontPath: string, familyName: string): string {
  const id = fontFaceId(fontPath);
  if (loadedFontFaces.has(id)) return familyName;
  if (typeof document === 'undefined') return familyName;

  const ext = fontPath.split('.').pop()?.toLowerCase() ?? 'ttf';
  const format =
    ext === 'woff2'
      ? 'woff2'
      : ext === 'woff'
        ? 'woff'
        : ext === 'otf'
          ? 'opentype'
          : 'truetype';
  const escapedPath = fontPath.replace(/'/g, "\\'");
  const escapedFamily = familyName.replace(/'/g, "\\'");

  const style = document.createElement('style');
  style.id = id;
  style.textContent = `@font-face{font-family:'${escapedFamily}';src:url('${escapedPath}') format('${format}');font-display:swap;}`;
  document.head.appendChild(style);
  loadedFontFaces.add(id);
  return familyName;
}

export function readerCustomFontFamilyName(config: Pick<TextViewerUiConfig, 'customFontName' | 'customFontPath'>): string {
  const name = config.customFontName?.trim();
  if (name) return name;
  const path = config.customFontPath?.trim();
  if (!path) return 'ReaderCustomFont';
  const base = path.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') ?? 'ReaderCustomFont';
  return base || 'ReaderCustomFont';
}

export function resolveReaderFontFamily(config: Pick<TextViewerUiConfig, 'font' | 'customFontName' | 'customFontPath'>): string {
  const preset = PRESET_FAMILIES[config.font];
  if (preset) return preset;

  if (config.font === 3) {
    const path = config.customFontPath?.trim();
    if (!path) return PRESET_FAMILIES[0]!;
    const family = readerCustomFontFamilyName(config);
    return composeSansFontStack(ensureReaderFontFace(path, family));
  }

  if (config.font === 4) {
    const name = config.customFontName?.trim();
    if (name) return composeSansFontStack(name);
    return PRESET_FAMILIES[0]!;
  }

  return PRESET_FAMILIES[0]!;
}

export function normalizeReaderFontPreset(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (n >= 0 && n <= 4 && Number.isFinite(n)) return Math.floor(n);
  return 0;
}

export function normalizeFontWeight(raw: unknown, fallback = 400): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(900, Math.max(100, Math.round(n / 100) * 100));
}
