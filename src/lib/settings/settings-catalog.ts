import { fuzzyMatchQuery } from '@/lib/sources/source-list-filter';

export type SettingsCategoryId =
  | 'general'
  | 'appearance'
  | 'window-system'
  | 'network'
  | 'storage'
  | 'about';

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
    id: 'general',
    label: '常规',
    description: '界面语言与主程序启动偏好',
  },
  {
    id: 'appearance',
    label: '外观与主题',
    description: '主题、导航布局、Toast 与全局媒体播放器',
  },
  {
    id: 'window-system',
    label: '窗口与系统',
    description: '桌面自启动、系统托盘与窗口状态恢复',
  },
  {
    id: 'network',
    label: '网络',
    description: '网络默认值、Web 服务与 Cookie Hub',
  },
  {
    id: 'storage',
    label: '存储与备份',
    description: '程序数据目录、记住的选择、备份编排与应用级缓存入口',
  },
  {
    id: 'about',
    label: '关于',
    description: '版本、运行环境与更新能力',
  },
];

export const SETTINGS_ITEMS: SettingsItemDef[] = [
  {
    id: 'general-preferences',
    categoryId: 'general',
    title: '常规偏好',
    description: '界面语言、字体字号与启动页面',
    keywords: ['常规', '语言', '字体', '字号', '简体中文', '繁体中文', 'English', '启动页面', '书架', '上次页面'],
  },
  {
    id: 'media-focus',
    categoryId: 'general',
    title: '媒体播放互斥',
    description: '跨模块音频焦点：全部暂停或智能闪避',
    keywords: [
      '媒体',
      '音频',
      '焦点',
      '互斥',
      '暂停',
      '闪避',
      'ducking',
      '朗读',
      '音乐',
      '听书',
      '视频',
      '播放',
    ],
  },
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
    keywords: ['通知', 'toast', '提示', '位置', '数量', '堆叠', '沉浸', '不再提示'],
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
    id: 'desktop-integration',
    categoryId: 'window-system',
    title: '桌面集成',
    description: '开机启动、托盘与窗口状态恢复',
    keywords: ['窗口', '系统', '开机启动', '自动启动', '托盘', '最小化', '关闭', '恢复窗口', '记住', '退出'],
  },
  {
    id: 'network-defaults',
    categoryId: 'network',
    title: '网络默认值',
    description: '主程序网络请求的超时与重试偏好',
    keywords: ['网络', '请求', '超时', '重试', 'timeout', 'retry'],
  },
  {
    id: 'web-service',
    categoryId: 'network',
    title: 'Web 服务',
    description: '局域网访问、端口与 Token 认证',
    keywords: ['Web 服务', '局域网', '端口', 'Token', '认证', 'API', 'WebSocket'],
  },
  {
    id: 'cookie-hub',
    categoryId: 'network',
    title: 'Cookie Hub',
    description: '音乐 / 影视 / 下载共用的平台 Cookie 登录与状态',
    keywords: [
      'Cookie',
      'Cookie Hub',
      '登录',
      '扫码',
      'WebView',
      '网易云',
      'B站',
      '哔哩',
      'YouTube',
      'YTM',
      'SESSDATA',
      'MUSIC_U',
      'cf_clearance',
      '音乐',
      '影视',
      '下载',
      '弹幕',
      '共用',
    ],
  },
  {
    id: 'storage-webview',
    categoryId: 'storage',
    title: '程序数据与 WebView',
    description: '数据目录、WebView 目录、日志与清理',
    keywords: ['数据目录', 'webview', '日志', '清理', '存储', '迁移'],
  },
  {
    id: 'remembered-choices',
    categoryId: 'storage',
    title: '记住的选择',
    description: '导入存放、删除文件、替换策略与关窗行为等已记住偏好',
    keywords: [
      '记住',
      '记住我的选择',
      '导入',
      '复制',
      '移动',
      '删除文件',
      '替换',
      '关窗',
      '托盘',
      '偏好',
      '不再询问',
    ],
  },
  {
    id: 'database-backup',
    categoryId: 'storage',
    title: '数据备份与恢复',
    description: '本地 ZIP 备份、WebDAV 云备份与恢复',
    keywords: ['备份', '恢复', '数据库', '导出', '导入', 'WebDAV', '云备份', '坚果云'],
  },
  {
    id: 'about-reader',
    categoryId: 'about',
    title: '关于 Reader',
    description: '版本、运行环境与自动更新偏好',
    keywords: ['关于', '版本', '更新', '检查更新', 'tauri', 'android', 'web', '技术栈'],
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
