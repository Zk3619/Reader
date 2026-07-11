import type { MusicHubSection } from '@/stores/viewer/base-state';

export const MUSIC_HUB_SECTION_META: Record<
  MusicHubSection,
  { title: string; description: string }
> = {
  search: { title: '搜索', description: '搜索歌曲与在线歌单' },
  songlist: { title: '在线歌单', description: '浏览与打开在线歌单' },
  leaderboard: { title: '排行榜', description: '各平台音乐排行榜' },
  album: { title: '专辑', description: '按专辑 ID 浏览曲目' },
  singer: { title: '歌手', description: '歌手歌曲与专辑' },
  userApi: { title: '自定义源', description: 'UserApi 扩展源浏览' },
  list: { title: '我的列表', description: '本地与用户歌单' },
  download: { title: '下载', description: '音乐下载任务与管理' },
  settings: { title: '音乐设置', description: '音源、播放、同步与网络' },
  nowPlaying: { title: '正在播放', description: '当前曲目与播放控制' },
};
