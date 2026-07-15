import type { MusicHubSection } from '@/stores/viewer/base-state';

/**
 * Hub 主内容相对滚动视口的水平留白（仅页面级滚动时挂在外壳）。
 * 列表自滚时改挂 VirtualList，避免外壳再挂 scroll-gutter 双侧沟槽。
 */
export const musicHubContentInsetClass = 'px-1';

/** 列表自滚水平留白（勿用 p-*，以免盖掉粘性表头的 pt-0） */
export const musicHubListInsetClass = 'px-1';

/**
 * 页头下方整页内容区水平留白（与 PageToolbar `px-4` 对齐）。
 * 用于 overflow-hidden / 分栏页：详情、排行榜、我的列表、设置等。
 */
export const musicHubPageContentInsetClass = 'px-4';

export const MUSIC_HUB_SECTION_META: Record<
  MusicHubSection,
  { title: string; description: string }
> = {
  search: { title: '搜索', description: '搜索歌曲与在线歌单' },
  songlist: { title: '在线歌单', description: '浏览与打开在线歌单' },
  leaderboard: { title: '排行榜', description: '各平台音乐排行榜' },
  list: { title: '我的列表', description: '本地与用户歌单' },
  settings: { title: '音乐设置', description: '音源、播放、同步与网络' },
  nowPlaying: { title: '正在播放', description: '当前曲目与播放控制' },
};
