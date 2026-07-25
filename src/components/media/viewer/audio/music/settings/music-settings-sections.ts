// 「主题与外观」分区已弃用移除：音乐模块主题能力将由主题工作室统一接管
export const MUSIC_SETTINGS_SECTIONS = [
  { id: 'basic', label: '音源与账号', description: '自定义源、MusicFree 插件与平台账号' },
  { id: 'play', label: '播放', description: '播放行为、音质、取流策略与音频输出' },
  { id: 'playDetail', label: '播放详情', description: '详情页布局、歌词样式与频谱' },
  { id: 'desktopLyric', label: '桌面歌词', description: '悬浮歌词窗口、样式与颜色' },
  { id: 'search', label: '搜索', description: '热门搜索与历史记录行为' },
  { id: 'list', label: '列表', description: '歌曲列表显示与交互' },
  { id: 'download', label: '下载', description: '下载目录、并发与音质' },
  { id: 'hotKey', label: '快捷键', description: '全局快捷键绑定' },
  { id: 'services', label: '服务与同步', description: '数据同步、OpenAPI 与绑定列表更新' },
  { id: 'dataMaintenance', label: '数据与维护', description: '备份恢复、缓存与本地曲匹配' },
] as const;

export type MusicSettingsSection = (typeof MUSIC_SETTINGS_SECTIONS)[number]['id'];
