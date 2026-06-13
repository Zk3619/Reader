export interface BackupItemInfo {
  fileName: string;
  displayName: string;
  description: string;
  count: number;
  size: number;
}

export interface BackupOverview {
  fileName: string;
  totalSize: number;
  createTime: number;
  items: BackupItemInfo[];
}

export interface BackupCategory {
  name: string;
  icon: string;
  items: BackupItemInfo[];
  totalSize: number;
}

const CATEGORY_CONFIG = [
  { name: '书籍相关', icon: '📚', keywords: ['bookshelf', 'bookmark', 'bookgroup', 'readrecord', 'bookcache', 'bookchaptercache'] },
  { name: '源相关', icon: '📡', keywords: ['booksource', 'rsssource', 'rssstar', 'sourcesub'] },
  { name: '规则相关', icon: '🔧', keywords: ['replacerule', 'txttocrule', 'dictrule', 'keyboardassist'] },
  { name: '语音相关', icon: '🔊', keywords: ['httptts'] },
  { name: '配置相关', icon: '⚙️', keywords: ['config', 'videoconfig', 'readconfig', 'shareconfig', 'themeconfig', 'coverconfig', 'servers'] },
  { name: '其他', icon: '📁', keywords: ['searchhistory', 'directlink'] },
];

export function formatBackupSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatBackupTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN');
}

export function groupBackupCategories(items: BackupItemInfo[]): BackupCategory[] {
  const result: BackupCategory[] = [];
  const assigned = new Set<string>();

  for (const cfg of CATEGORY_CONFIG) {
    const matched = items.filter((item) => {
      const lower = item.fileName.toLowerCase();
      return cfg.keywords.some((kw) => lower.includes(kw));
    });
    if (!matched.length) continue;
    matched.forEach((m) => assigned.add(m.fileName));
    result.push({
      name: cfg.name,
      icon: cfg.icon,
      items: matched,
      totalSize: matched.reduce((sum, i) => sum + i.size, 0),
    });
  }

  const remaining = items.filter((i) => !assigned.has(i.fileName));
  if (remaining.length) {
    const other = result.find((c) => c.name === '其他');
    if (other) {
      other.items.push(...remaining);
      other.totalSize += remaining.reduce((sum, i) => sum + i.size, 0);
    } else {
      result.push({
        name: '其他',
        icon: '📁',
        items: remaining,
        totalSize: remaining.reduce((sum, i) => sum + i.size, 0),
      });
    }
  }

  return result;
}

export function backupFileIcon(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.xml')) return '📄';
  if (lower.includes('bookshelf')) return '📖';
  if (lower.includes('bookmark')) return '🔖';
  if (lower.includes('booksource')) return '📡';
  if (lower.includes('rsssource')) return '📰';
  if (lower.includes('replacerule')) return '🔄';
  if (lower.includes('readrecord')) return '📊';
  if (lower.includes('txttocrule')) return '📑';
  if (lower.includes('httptts')) return '🔊';
  if (lower.includes('config')) return '⚙️';
  return '📄';
}
