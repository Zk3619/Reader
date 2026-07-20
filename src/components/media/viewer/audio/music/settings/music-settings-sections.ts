export const MUSIC_SETTINGS_SECTIONS = [
  { id: 'theme', label: '主题与外观' },
  { id: 'basic', label: '音源与账号' },
  { id: 'play', label: '播放' },
  { id: 'playDetail', label: '播放详情' },
  { id: 'desktopLyric', label: '桌面歌词' },
  { id: 'search', label: '搜索' },
  { id: 'list', label: '列表' },
  { id: 'download', label: '下载' },
  { id: 'hotKey', label: '快捷键' },
  { id: 'services', label: '服务与同步' },
  { id: 'dataMaintenance', label: '数据与维护' },
] as const;

export type MusicSettingsSection = (typeof MUSIC_SETTINGS_SECTIONS)[number]['id'];
