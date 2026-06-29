import { fuzzyMatchQuery } from '@/lib/sources/source-list-filter';

export type SettingsCategoryId =
  | 'appearance'
  | 'reading'
  | 'sources'
  | 'storage'
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
    description: '主题、布局、书籍详情与发现抽屉等界面样式',
  },
  {
    id: 'reading',
    label: '阅读体验',
    description: 'TXT 目录、替换净化、字典规则与阅读相关选项',
  },
  {
    id: 'sources',
    label: '书源与发现',
    description: 'Web 服务、书源导入黑名单',
  },
  {
    id: 'storage',
    label: '存储与缓存',
    description: '数据目录、本地书库、缓存与数据库备份',
  },
  {
    id: 'other',
    label: '其他设置',
    description: '应用技术栈信息',
  },
];

export const SETTINGS_ITEMS: SettingsItemDef[] = [
  {
    id: 'theme',
    categoryId: 'appearance',
    title: '主题',
    description: '浅色、深色、跟随系统或按时切换',
    keywords: ['主题', '暗黑模式', '深色', '浅色', '夜间', 'dark', 'light', 'theme', '系统', '按时'],
  },
  {
    id: 'theme-schedule',
    categoryId: 'appearance',
    title: '主题按时切换',
    description: '按时模式下浅色与深色的切换时刻',
    keywords: ['主题', '按时', '日', '夜', '切换', '时段', '6点', '18点'],
  },
  {
    id: 'reduce-motion',
    categoryId: 'appearance',
    title: '减少动效',
    description: '关闭或缩短动画与过渡',
    keywords: ['减少动效', '动画', '过渡', '动效', '性能'],
  },
  {
    id: 'show-tooltips',
    categoryId: 'appearance',
    title: '显示工具提示',
    description: '按钮与控件悬停时显示说明文字',
    keywords: ['工具提示', 'tooltip', '悬停', '提示', '说明'],
  },
  {
    id: 'toast',
    categoryId: 'appearance',
    title: '通知 Toast',
    description: '应用内通知的风格与屏幕位置',
    keywords: ['通知', 'toast', 'sonner', '提示', '位置', '风格'],
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
    id: 'viewer-chrome-overlay',
    categoryId: 'appearance',
    title: '阅读器栏外观',
    description: '层叠与悬浮模式下顶底栏透明度与模糊',
    keywords: ['阅读器', '顶栏', '底栏', '透明度', '模糊', '层叠', '悬浮', 'chrome'],
  },
  {
    id: 'media-player-chrome',
    categoryId: 'appearance',
    title: '全局媒体播放器',
    description: '后台朗读与音视频播放时的壳层播放条布局',
    keywords: ['播放器', '朗读', '后台', '音频', '视频', '悬浮', '层叠', '固定'],
  },
  {
    id: 'book-info-presentation',
    categoryId: 'appearance',
    title: '书籍详情展示',
    description: '独立页面或右侧抽屉打开书籍详情',
    keywords: ['书籍详情', '详情', '抽屉', '独立页面'],
  },
  {
    id: 'source-explore-drawer',
    categoryId: 'appearance',
    title: '发现抽屉布局',
    description: '书源页发现分类排列方式',
    keywords: ['发现', '抽屉', '书源页', '分类', '布局'],
  },
  {
    id: 'reading-rules-hub',
    categoryId: 'reading',
    title: '阅读规则',
    description: 'TXT 目录、替换净化、字典规则入口',
    keywords: ['阅读规则', '规则', '目录', '字典', '替换'],
  },
  {
    id: 'chapter-body-prefetch',
    categoryId: 'reading',
    title: '章节正文预下载',
    description: '阅读时向前/向后预下载相邻章节正文',
    keywords: ['预下载', '章节', '正文', '向前', '向后', '缓存', '阅读'],
  },
  {
    id: 'txt-toc-rules',
    categoryId: 'reading',
    title: 'TXT 目录规则',
    description: '本地 TXT 分章与目录识别',
    keywords: ['txt', '目录规则', '分章', '本地书', 'toc'],
  },
  {
    id: 'replace-rules',
    categoryId: 'reading',
    title: '替换净化',
    description: '正文与标题替换规则管理',
    keywords: ['替换规则', '替换', '净化', '正文', '规则'],
  },
  {
    id: 'dict-rules',
    categoryId: 'reading',
    title: '字典规则',
    description: '阅读选词查词典',
    keywords: ['字典', '词典', '查词', 'dict'],
  },
  {
    id: 'replace-purify-prefs',
    categoryId: 'reading',
    title: '替换净化设置',
    description: '启用替换净化、导出选项、保护特殊 HTML（在替换净化页设置按钮）',
    keywords: ['替换净化', '全局', 'usehtml', 'adaptSpecialStyle', 'replaceEnableDefault', '导出'],
  },
  {
    id: 'web-service',
    categoryId: 'sources',
    title: 'Web 服务',
    description: 'Legado 兼容 REST + Web UI',
    keywords: ['web', '服务', 'api', 'token', '端口', '局域网', '传书', '写源'],
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
    title: '阅读缓存',
    description: '章节正文、漫画图片占用与自动清理策略',
    keywords: ['章节', '缓存', '正文', '漫画', '图片', '清理', '阅读'],
  },
  {
    id: 'database-backup',
    categoryId: 'storage',
    title: '数据备份与恢复',
    description: '导出 ZIP 本地备份或从备份恢复',
    keywords: ['备份', '恢复', '数据库', '导出', '导入'],
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
