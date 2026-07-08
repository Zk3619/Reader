/**
 * 阅读器背景配置（Legado 兼容：导入/备份保留字段；UI 与渲染待商业级主题统一接入）
 */

import { type Accessor } from 'solid-js';
import {
  readLocalBackgroundAsDataUrl,
  writeLocalBackgroundFile,
} from '@/lib/backup/background-backup';
import { pickFile } from '@/lib/platform/fs/pick-file';
import { readBytes } from '@/lib/platform/fs/read-write';
import { isUserCancelled } from '@/lib/platform/fs/errors';
import { READER_NIGHT_THEME_ID, readerThemePalette } from '@/lib/media/text/reader-theme-classes';
import type { TextViewerUiConfig } from '@/lib/media/text/reader-ui-config';

/** 0 纯色 1 内置图 2 自定义图 */
export type ReaderBgType = 0 | 1 | 2;

export const READER_BG_TYPE_LABELS: Record<ReaderBgType, string> = {
  0: '颜色',
  1: '内置',
  2: '自定义',
};

/** 内置背景（public/reader-bg/） */
export const BUILTIN_READER_BACKGROUNDS = [
  'paper.svg',
  'warm.svg',
  'night.svg',
  'texture.svg',
] as const;

export function normalizeReaderBgType(value: number | undefined | null): ReaderBgType {
  if (value === 1 || value === 2) return value;
  return 0;
}

export function normalizeReaderBgAlpha(value: number | undefined | null): number {
  if (value == null || !Number.isFinite(value)) return 100;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function isNightReaderTheme(themeId: number): boolean {
  return themeId === READER_NIGHT_THEME_ID;
}

export interface ReaderBgSlot {
  bgType: ReaderBgType;
  bgStr: string;
}

export function activeReaderBgSlot(config: TextViewerUiConfig): ReaderBgSlot {
  const night = isNightReaderTheme(config.theme);
  if (night) {
    return {
      bgType: normalizeReaderBgType(config.bgTypeNight),
      bgStr: config.bgStrNight?.trim() || '#000000',
    };
  }
  const fallback = readerThemePalette(config.theme).bg;
  const raw = config.bgStr?.trim() ?? '';
  /** Legado 默认粉色占位：视为未自定义，跟随主题 palette */
  const bgStr =
    !raw || /^#ffc0ed(c6)?$/i.test(raw) ? '' : raw;
  return {
    bgType: normalizeReaderBgType(config.bgType),
    bgStr: bgStr || fallback,
  };
}

export function setActiveReaderBgSlot(
  config: TextViewerUiConfig,
  patch: Partial<ReaderBgSlot>,
): Partial<TextViewerUiConfig> {
  const night = isNightReaderTheme(config.theme);
  if (night) {
    return {
      ...(patch.bgType != null ? { bgTypeNight: patch.bgType } : {}),
      ...(patch.bgStr != null ? { bgStrNight: patch.bgStr } : {}),
    };
  }
  return {
    ...(patch.bgType != null ? { bgType: patch.bgType } : {}),
    ...(patch.bgStr != null ? { bgStr: patch.bgStr } : {}),
  };
}

export function builtinReaderBgUrl(fileName: string): string {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
  return `${base}/reader-bg/${fileName}`;
}

export function readerPageBaseColor(config: TextViewerUiConfig): string {
  return readerThemePalette(config.theme).bg;
}

/** @deprecated 自定义阅读背景已移除，始终返回 false */
export function usesReaderPageBackgroundOverlay(_config: TextViewerUiConfig): boolean {
  return false;
}

export async function resolveReaderBackgroundImageUrl(
  config: TextViewerUiConfig,
): Promise<string | null> {
  const slot = activeReaderBgSlot(config);
  if (slot.bgType === 0) return null;
  if (slot.bgType === 1) {
    const name = slot.bgStr.includes('/') ? slot.bgStr.split(/[/\\]/).pop()! : slot.bgStr;
    return builtinReaderBgUrl(name);
  }
  const fileName = slot.bgStr.includes('/') ? slot.bgStr.split(/[/\\]/).pop()! : slot.bgStr;
  if (!fileName) return null;
  return readLocalBackgroundAsDataUrl(fileName);
}

/** 供阅读视口使用的 CSS 样式（背景色 + 可选背景图 + 透明度） */
export function readerPageBackgroundStyle(
  config: TextViewerUiConfig,
  imageUrl: string | null | undefined,
): Record<string, string> {
  const base = readerPageBaseColor(config);
  const alpha = normalizeReaderBgAlpha(config.bgAlpha) / 100;
  const slot = activeReaderBgSlot(config);

  if (!imageUrl || slot.bgType === 0) {
    return { 'background-color': base };
  }

  const overlay =
    alpha >= 0.999
      ? 'transparent'
      : `linear-gradient(rgba(0,0,0,${1 - alpha}), rgba(0,0,0,${1 - alpha}))`;

  return {
    'background-color': base,
    'background-image': `${overlay}, url("${imageUrl.replace(/"/g, '\\"')}")`,
    'background-size': 'cover',
    'background-position': 'center',
    'background-repeat': 'no-repeat',
  };
}

export function normalizeLegadoBgFileName(path: string): string {
  const trimmed = path.trim();
  if (!trimmed || trimmed.startsWith('http')) return trimmed;
  return trimmed.split(/[/\\]/).pop() ?? trimmed;
}

/** 备份导出时：自定义背景只保留文件名 */
export function readerBgStrForBackup(str: string, bgType: ReaderBgType): string {
  if (bgType !== 2) return str;
  return normalizeLegadoBgFileName(str);
}

/** 导入后：将文件名解析为本地可读路径（仍存文件名，由 resolve 读取） */
export function readerBgStrAfterRestore(str: string, bgType: ReaderBgType): string {
  if (bgType !== 2) return str;
  return normalizeLegadoBgFileName(str);
}

export async function pickAndSaveReaderBackgroundImage(): Promise<string | null> {
  try {
    const picked = await pickFile({
      filters: [
        { name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] },
      ],
    });
    let bytes: Uint8Array;
    if (picked.bytes) bytes = new Uint8Array(picked.bytes);
    else bytes = new Uint8Array(await readBytes(picked.ref));

    const fileName = picked.fileName.replace(/[/\\]/g, '_');
    await writeLocalBackgroundFile(fileName, bytes);
    return fileName;
  } catch (error) {
    if (isUserCancelled(error)) return null;
    throw error;
  }
}

export function collectReaderBgFileNamesFromConfig(config: TextViewerUiConfig): string[] {
  const names = new Set<string>();
  for (const slot of [
    { type: config.bgType, str: config.bgStr },
    { type: config.bgTypeNight, str: config.bgStrNight },
  ]) {
    if (normalizeReaderBgType(slot.type) === 2 && slot.str) {
      names.add(normalizeLegadoBgFileName(slot.str));
    }
  }
  return [...names];
}

/** @deprecated 自定义阅读背景已移除 */
export function createReaderPageBgStyle(_config: Accessor<TextViewerUiConfig>) {
  return () => ({}) as Record<string, string>;
}
