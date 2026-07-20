import type { TvHubSection } from '@/lib/media/tv/types';

/** Hub 主内容相对滚动视口的水平留白 */
export const tvHubContentInsetClass = 'px-1';

/** 页头下方整页内容区水平留白（与 PageToolbar `px-4` 对齐） */
export const tvHubPageContentInsetClass = 'px-4';

export const TV_HUB_SECTION_META: Partial<
  Record<TvHubSection, { title: string; description: string }>
> = {
  home: { title: '影视', description: '点播首页与分类浏览' },
  live: { title: '直播', description: '直播源与频道' },
  search: { title: '搜索', description: '多站并行搜索' },
  keep: { title: '收藏', description: '点播与直播收藏' },
  history: { title: '历史', description: '观看记录' },
  detail: { title: '详情', description: '影片详情' },
  play: { title: '播放', description: '正在播放' },
  settings: { title: '设置', description: '源导入与选用、网络与 Spider 引擎' },
};
