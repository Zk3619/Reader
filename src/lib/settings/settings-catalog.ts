import { fuzzyMatchQuery } from '@/lib/sources/source-list-filter';

export type SettingsCategoryId =
  | 'appearance'
  | 'reading'
  | 'sources'
  | 'storage'
  | 'data'
  | 'other';

export interface SettingsCategoryDef {
  id: SettingsCategoryId;
  label: string;
  description: string;
}

export interface SettingsItemDef {
  id: string;
  categoryId: SettingsCategoryId;
  title: string;
  description?: string;
  keywords: string[];
}

export const SETTINGS_CATEGORIES: SettingsCategoryDef[] = [
  {
    id: 'appearance',
    label: '外观与主题',
    description: '主题、导航布局、动效与阅读器界面样式',
  },
  {
    id: 'reading',
    label: '阅读体验',
    description: '书籍详情、目录安全、内嵌网页等阅读相关选项',
  },
  {
    id: 'sources',
    label: '书源与发现',
    description: '书源页发现抽屉与导入黑名单',
  },
  {
    id: 'storage',
    label: '存储与缓存',
    description: '数据目录、本地书库、封面与章节缓存',
  },
  {
    id: 'data',
    label: '数据管理',
    description: '替换规则与数据库备份恢复',
  },
  {
    id: 'other',
    label: '其他设置',
    description: '暂未归入以上分类的选项',
  },
];

export const SETTINGS_ITEMS: SettingsItemDef[] = [
  {
    id: 'theme',
    categoryId: 'appearance',
    title: '主题',
    description: '浅色、跟随系统或深色模式',
    keywords: ['主题', '暗黑模式', '深色', '浅色', '夜间', 'dark', 'light', 'theme'],
  },
  {
    id: 'reduce-motion',
    categoryId: 'appearance',
    title: '减少动效',
    description: '关闭或缩短动画与过渡',
    keywords: ['减少动效', '动画', '过渡', '动效', '性能'],
  },
  {
    id: 'shell-layout',
    categoryId: 'appearance',
    title: '导航布局',
    description: '顶部导航栏或底部导航栏',
    keywords: ['导航布局', '底栏', '顶栏', '侧边栏', '布局', '导航'],
  },
  {
    id: 'viewer-chrome',
    categoryId: 'appearance',
    title: '阅读器顶栏与底栏',
    description: '阅读器顶栏底栏固定、层叠或悬浮',
    keywords: ['阅读器', '顶栏', '底栏', '工具栏', '悬浮', '层叠'],
  },
  {
    id: 'book-info-presentation',
    categoryId: 'reading',
    title: '书籍详情展示',
    description: '独立页面或右侧抽屉打开书籍详情',
    keywords: ['书籍详情', '详情', '抽屉', '独立页面'],
  },
  {
    id: 'toc-pagination-safety',
    categoryId: 'reading',
    title: '目录分页安全阈值',
    description: '限制目录 nextTocUrl 翻页次数',
    keywords: ['目录', '分页', '翻页', '阈值', '安全'],
  },
  {
    id: 'inner-web-render',
    categoryId: 'reading',
    title: '内嵌网页承载方式',
    description: '原生 WebView 或 iframe',
    keywords: ['内嵌网页', 'webview', 'iframe', '网页', '登录'],
  },
  {
    id: 'source-explore-drawer',
    categoryId: 'sources',
    title: '发现抽屉布局',
    description: '书源页发现分类排列方式',
    keywords: ['发现', '抽屉', '书源页', '分类', '布局'],
  },
  {
    id: 'source-blocklist',
    categoryId: 'sources',
    title: '书源导入黑名单',
    description: '内置 18+ 与用户自定义域名过滤',
    keywords: ['黑名单', '书源', '导入', '18+', '域名', '过滤'],
  },
  {
    id: 'storage-webview',
    categoryId: 'storage',
    title: '程序数据与 WebView',
    description: '数据目录、WebView 目录、日志与清理',
    keywords: ['数据目录', 'webview', '日志', '清理', '存储', '迁移'],
  },
  {
    id: 'books-storage',
    categoryId: 'storage',
    title: '本地书籍库',
    description: '本地导入书籍的根目录',
    keywords: ['本地书籍', '书库', '导入', '目录', '存储'],
  },
  {
    id: 'cover-cache',
    categoryId: 'storage',
    title: '封面缓存',
    description: '封面磁盘或 IndexedDB 缓存',
    keywords: ['封面', '缓存', '图片', '清理'],
  },
  {
    id: 'chapter-cache',
    categoryId: 'storage',
    title: '章节缓存',
    description: '章节正文缓存与预取',
    keywords: ['章节', '缓存', '预取', '正文', '清理'],
  },
  {
    id: 'replace-rules',
    categoryId: 'data',
    title: '替换规则',
    description: '正文替换规则管理',
    keywords: ['替换规则', '替换', '正文', '规则'],
  },
  {
    id: 'database-backup',
    categoryId: 'data',
    title: '数据备份',
    description: '导出或恢复数据库备份',
    keywords: ['备份', '恢复', '数据库', '导出', '导入'],
  },
  {
    id: 'tauri-test',
    categoryId: 'other',
    title: 'Tauri 命令测试',
    description: '测试 Tauri invoke 调用',
    keywords: ['tauri', '测试', 'invoke', '命令'],
  },
  {
    id: 'button-variants',
    categoryId: 'other',
    title: 'Button 组件变体',
    description: '按钮样式预览',
    keywords: ['button', '按钮', '变体', '组件'],
  },
  {
    id: 'button-sizes',
    categoryId: 'other',
    title: 'Button 尺寸',
    description: '按钮尺寸预览',
    keywords: ['button', '按钮', '尺寸', '大小'],
  },
  {
    id: 'tech-stack',
    categoryId: 'other',
    title: '技术栈',
    description: '当前应用技术栈信息',
    keywords: ['技术栈', 'tauri', 'solidjs', 'tailwind'],
  },
];

const categoryMap = new Map(SETTINGS_CATEGORIES.map((c) => [c.id, c]));

export function getSettingsCategory(id: SettingsCategoryId): SettingsCategoryDef {
  return categoryMap.get(id)!;
}

function itemSearchHaystack(item: SettingsItemDef): string {
  const cat = categoryMap.get(item.categoryId);
  return [
    item.title,
    item.description ?? '',
    cat?.label ?? '',
    ...item.keywords,
  ].join(' ');
}

export function searchSettingsItems(query: string): SettingsItemDef[] {
  const q = query.trim();
  if (!q) return [];
  return SETTINGS_ITEMS.filter((item) => fuzzyMatchQuery(q, itemSearchHaystack(item)));
}
