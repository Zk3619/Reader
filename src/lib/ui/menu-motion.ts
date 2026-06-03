/**
 * AppDropdownMenu 进出场：关闭比 ui/dropdown-menu 默认 content-hide(200ms) 更快，
 * 缩短「菜单收起 → 开弹窗/切页」的体感间隔（仍保留 solid-presence 所需的 exit 动画名）。
 */

/** 遮罩/内容区：快速淡出关闭；打开略快于默认 */
export const appDropdownMenuContentMotionClass =
  'opacity-0 data-[expanded]:opacity-100 data-[expanded]:animate-app-menu-show data-[closed]:animate-app-menu-hide';
