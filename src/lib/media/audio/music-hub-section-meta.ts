import type { MusicHubSection } from '@/stores/viewer/base-state';

/**
 * Hub 主内容相对滚动视口的水平留白（仅页面级滚动时挂在外壳）。
 * 列表自滚时改挂 VirtualList，避免外壳再挂 scroll-gutter 双侧沟槽。
 */
export const musicHubContentInsetClass = 'px-1';

/**
 * 曲目表自滚：水平贴齐滚动内容区，两侧沟槽由 VirtualList `scrollGutter=both` 预留。
 * 勿再叠 px-*，否则与 gutter 视觉打架；纵向留白在调用处单独写 pt/pb。
 */
export const musicHubListInsetClass = '';

/**
 * 页头下方整页内容区水平留白（与 PageToolbar `px-4` 对齐）。
 * 用于无「列表自滚 both-edges」的 overflow-hidden / 分栏页。
 */
export const musicHubPageContentInsetClass = 'px-4';

/**
 * 侧栏 + 曲目表分栏：仅左侧与 Toolbar 对齐。
 * 右侧勿再挂 pr：曲目 VirtualList 的 `scrollbar-gutter: both-edges` 已预留右侧沟槽，
 * 再叠 page `pr-4` 会造成「列表距右边缘明显大于左侧」。
 */
export const musicHubSplitPaneInsetClass = 'pl-4';

export const MUSIC_HUB_SECTION_META: Record<
  MusicHubSection,
  { title: string; description: string }
> = {
  search: { title: '搜索', description: '搜索歌曲与在线歌单' },
  songlist: { title: '在线歌单', description: '浏览与打开在线歌单' },
  leaderboard: { title: '排行榜', description: '各平台音乐排行榜' },
  artist: { title: '歌手', description: '热门歌手列表与详情' },
  album: { title: '专辑', description: '新碟与热门专辑' },
  list: { title: '我的列表', description: '本地与用户歌单' },
  download: { title: '下载', description: '下载任务与本地优先播放' },
  settings: { title: '音乐设置', description: '音源、播放、同步与网络' },
  nowPlaying: { title: '正在播放', description: '当前曲目与播放控制' },
};
