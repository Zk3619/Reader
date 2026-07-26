/**
 * 音乐桌面曲目表列宽：统一「我的列表 / 搜索 / 排行榜 / 骨架」对齐。
 * 不用 % 轨道（与 fr 混用易在窄视口把列挤重叠）；可变列用 minmax(min, fr) + 单元格 truncate。
 *
 * 对齐注意：
 * - 表头必须与行处于同一滚动容器（VirtualList scrollHeader），否则
 *   `scrollbar-gutter: stable both-edges` 只作用于列表，表头会相对偏左。
 * - 分栏页勿对「侧栏+列表」整行用 px-4：右侧会与列表 both-edges 沟槽叠加；
 *   应使用 musicHubSplitPaneInsetClass（仅 pl），右侧交给列表 gutter。
 * - 桌面行网格须用 `div`（与表头同构）；勿把 `display:grid` 挂在 `<button>` 上（WebView 常忽略）。
 * - 勿对 `<button>` 使用 `display: contents`（浏览器常忽略），行单元格须与表头同为网格直接子节点。
 */

export const MUSIC_DESKTOP_TRACK_LIST_MIN_WIDTH_CLASS = 'min-w-[40rem]';

/** 表头/行共用网格 */
export const MUSIC_DESKTOP_TRACK_GRID_CLASS =
  'grid w-full items-center justify-items-stretch gap-0 overflow-hidden px-2 text-left';

/** 文本列单元格：统一左对齐与裁剪，表头/内容共用 */
export const MUSIC_DESKTOP_TRACK_CELL_CLASS =
  'min-w-0 w-full overflow-hidden px-1 text-left';

/** 图标列（多选）：居中 */
export const MUSIC_DESKTOP_TRACK_ICON_CELL_CLASS =
  'flex w-full items-center justify-center overflow-hidden';

export type MusicDesktopTrackColOptions = {
  showAlbum?: boolean;
  showDuration?: boolean;
};

/** 「我的列表」：多选 + # + 曲名 + 艺术家 + 可选专辑/时长（排序靠整行长按，无拖拽列） */
export function musicLibraryDesktopTrackGridTemplate(
  options?: MusicDesktopTrackColOptions,
): string {
  const showAlbum = options?.showAlbum !== false;
  const showDuration = options?.showDuration !== false;
  const cols = [
    '2rem',
    '3rem',
    'minmax(8rem, 1.5fr)',
    'minmax(5.5rem, 0.9fr)',
  ];
  if (showAlbum) cols.push('minmax(5.5rem, 0.9fr)');
  if (showDuration) cols.push('4.5rem');
  return cols.join(' ');
}

/** 搜索 / 排行榜：# + 曲名 + 艺术家 + 可选专辑 + 时长（专辑详情页整列同专辑，隐藏专辑列） */
export function musicOnlineDesktopTrackGridTemplate(
  options?: Pick<MusicDesktopTrackColOptions, 'showAlbum'>,
): string {
  const cols = [
    '3rem',
    'minmax(8rem, 1.5fr)',
    'minmax(5.5rem, 0.9fr)',
  ];
  if (options?.showAlbum !== false) cols.push('minmax(5.5rem, 0.9fr)');
  cols.push('4.5rem');
  return cols.join(' ');
}

/** 下载页：# + 曲名 + 艺术家 + 进度 + 状态 + 音质 + 来源 */
export function musicDownloadDesktopTrackGridTemplate(): string {
  return [
    '3rem',
    'minmax(7rem, 1.2fr)',
    'minmax(5rem, 0.85fr)',
    'minmax(4.5rem, 0.8fr)',
    'minmax(4rem, 0.6fr)',
    'minmax(5.5rem, 0.7fr)',
    'minmax(3.25rem, 0.5fr)',
  ].join(' ');
}

/**
 * 在线列表整行可点时的网格 class（仅作备用；桌面行请用 div+grid，勿把 display:grid 挂在 button 上）。
 */
export const MUSIC_ONLINE_DESKTOP_TRACK_ROW_BUTTON_CLASS = [
  MUSIC_DESKTOP_TRACK_GRID_CLASS,
  'h-auto w-full cursor-pointer gap-0 rounded-none border-0 bg-transparent p-0 text-left font-normal',
  'hover:bg-muted/50',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
].join(' ');
