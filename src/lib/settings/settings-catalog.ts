import { fuzzyMatchQuery } from '@/lib/sources/source-list-filter';

export type SettingsCategoryId = 'appearance' | 'storage' | 'other';

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

/** 壳层设置分类（阅读/音乐模块设置已下沉至各模块） */
export const SETTINGS_CATEGORIES: SettingsCategoryDef[] = [
  {
    id: 'appearance',
    label: '外观与主题',
    description: '主题、导航布局、Toast 与全局媒体播放器',
  },
  {
    id: 'storage',
    label: '存储与备份',
    description: '程序数据目录、备份编排与应用级缓存入口',
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
    id: 'visual-effects',
    categoryId: 'appearance',
    title: '视觉特效',
    description: '全局阴影、半透明背景与背景模糊开关',
    keywords: ['视觉特效', '阴影', '透明', '模糊', '性能', 'backdrop', 'GPU', '低端'],
  },
  {
    id: 'theme-presets',
    categoryId: 'appearance',
    title: '主题预设',
    description: '快速切换已保存的主题包',
    keywords: ['主题预设', '主题包', '切换', 'preset', '自定义主题'],
  },
  {
    id: 'custom-theme',
    categoryId: 'appearance',
    title: '自定义主题',
    description: '主题工作室、组件级预览、预设与导入导出',
    keywords: ['自定义主题', '主题工作室', '预览', '预设', '导入', '导出', '特效', '拖尾'],
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
    description: '应用内通知的屏幕位置、数量与堆叠样式',
    keywords: ['通知', 'toast', '提示', '位置', '数量', '堆叠'],
  },
  {
    id: 'shell-layout',
    categoryId: 'appearance',
    title: '导航布局',
    description: '顶部导航栏或底部导航栏',
    keywords: ['导航布局', '底栏', '顶栏', '侧边栏', '布局', '导航'],
  },
  {
    id: 'media-player-chrome',
    categoryId: 'appearance',
    title: '全局媒体播放器',
    description: '后台朗读与音视频播放时的壳层播放条布局',
    keywords: ['播放器', '朗读', '后台', '音频', '视频', '悬浮', '层叠', '固定'],
  },
  {
    id: 'storage-webview',
    categoryId: 'storage',
    title: '程序数据与 WebView',
    description: '数据目录、WebView 目录、日志与清理',
    keywords: ['数据目录', 'webview', '日志', '清理', '存储', '迁移'],
  },
  {
    id: 'database-backup',
    categoryId: 'storage',
    title: '数据备份与恢复',
    description: '本地 ZIP 备份、WebDAV 云备份与恢复',
    keywords: ['备份', '恢复', '数据库', '导出', '导入', 'WebDAV', '云备份', '坚果云'],
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
  return [item.title, item.description ?? '', cat?.label ?? '', ...item.keywords].join(' ');
}

export function searchSettingsItems(query: string): SettingsItemDef[] {
  const q = query.trim();
  if (!q) return [];
  return SETTINGS_ITEMS.filter((item) => fuzzyMatchQuery(q, itemSearchHaystack(item)));
}
