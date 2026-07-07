/**
 * 选择性备份/恢复项（对齐 Legado BackupSelectorConfig.kt）
 */

import { getStorage, setStorage } from '@/lib/platform/storage';

export const BACKUP_SELECTOR_KEY = 'backup_selector_config';

export interface BackupSelectorItem {
  key: string;
  fileName: string;
  title: string;
  group: string;
}

export const BACKUP_SELECTOR_ITEMS: BackupSelectorItem[] = [
  { key: 'readerDb', fileName: 'reader.db', title: 'SQLite 数据库', group: '核心' },
  { key: 'bookshelf', fileName: 'bookshelf.json', title: '书架', group: '数据库' },
  { key: 'bookmark', fileName: 'bookmark.json', title: '书签', group: '数据库' },
  { key: 'bookGroup', fileName: 'bookGroup.json', title: '书籍分组', group: '数据库' },
  { key: 'bookSource', fileName: 'bookSource.json', title: '书源', group: '数据库' },
  { key: 'rssSources', fileName: 'rssSources.json', title: '订阅源', group: '数据库' },
  { key: 'rssStar', fileName: 'rssStar.json', title: '订阅收藏', group: '数据库' },
  { key: 'replaceRule', fileName: 'replaceRule.json', title: '替换规则', group: '数据库' },
  { key: 'readRecord', fileName: 'readRecord.json', title: '阅读记录', group: '数据库' },
  { key: 'readRecordDetail', fileName: 'readRecordDetail.json', title: '阅读记录详情', group: '数据库' },
  { key: 'searchHistory', fileName: 'searchHistory.json', title: '搜索历史', group: '数据库' },
  { key: 'txtTocRule', fileName: 'txtTocRule.json', title: 'TXT 目录规则', group: '数据库' },
  { key: 'httpTTS', fileName: 'httpTTS.json', title: 'TTS 配置', group: '数据库' },
  { key: 'keyboardAssists', fileName: 'keyboardAssists.json', title: '键盘辅助', group: '数据库' },
  { key: 'dictRule', fileName: 'dictRule.json', title: '词典规则', group: '数据库' },
  { key: 'servers', fileName: 'servers.json', title: '服务器配置', group: '数据库' },
  { key: 'readConfig', fileName: 'readConfig.json', title: '阅读样式', group: '配置' },
  { key: 'readShareConfig', fileName: 'shareReadConfig.json', title: '共享阅读样式', group: '配置' },
  { key: 'readerUiConfig', fileName: 'readerUiConfig.json', title: 'Reader UI 配置', group: '配置' },
  { key: 'readerPrefs', fileName: 'readerPrefs.json', title: 'Legado 阅读偏好', group: '配置' },
  { key: 'backgroundImages', fileName: 'bg', title: '背景图片', group: '其他' },
  { key: 'bookCache', fileName: 'book_cache', title: '书籍章节缓存', group: '其他' },
];

export const BACKUP_SELECTOR_GROUPS = [...new Set(BACKUP_SELECTOR_ITEMS.map((i) => i.group))];

let cachedMap: Record<string, boolean> | null = null;

function defaultSelectedMap(): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const item of BACKUP_SELECTOR_ITEMS) map[item.key] = true;
  return map;
}

export async function loadBackupSelectorMap(): Promise<Record<string, boolean>> {
  if (cachedMap) return { ...cachedMap };
  try {
    const saved = await getStorage<Record<string, boolean>>(BACKUP_SELECTOR_KEY);
    const map = { ...defaultSelectedMap(), ...saved };
    cachedMap = map;
    return { ...map };
  } catch {
    cachedMap = defaultSelectedMap();
    return { ...cachedMap };
  }
}

export async function saveBackupSelectorMap(map: Record<string, boolean>): Promise<void> {
  cachedMap = { ...map };
  await setStorage(BACKUP_SELECTOR_KEY, cachedMap);
}

export async function isBackupItemSelected(key: string): Promise<boolean> {
  const map = await loadBackupSelectorMap();
  return map[key] !== false;
}

export async function getSelectedBackupFileNames(): Promise<Set<string>> {
  const map = await loadBackupSelectorMap();
  return new Set(
    BACKUP_SELECTOR_ITEMS.filter((item) => map[item.key] !== false).map((item) => item.fileName),
  );
}

export async function setBackupItemSelected(key: string, selected: boolean): Promise<void> {
  const map = await loadBackupSelectorMap();
  map[key] = selected;
  await saveBackupSelectorMap(map);
}

export async function selectAllBackupItems(): Promise<void> {
  await saveBackupSelectorMap(defaultSelectedMap());
}

export async function deselectAllBackupItems(): Promise<void> {
  const map: Record<string, boolean> = {};
  for (const item of BACKUP_SELECTOR_ITEMS) map[item.key] = false;
  await saveBackupSelectorMap(map);
}
