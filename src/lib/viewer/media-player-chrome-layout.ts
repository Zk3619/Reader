import type { ViewerChromeLayout } from '@/components/media/viewer/viewer-chrome';
import { normalizeViewerChromeLayout } from '@/lib/viewer/viewer-chrome-layout';
import { settingsState } from '@/stores/settings';
import type { GmpFloatEdge } from '@/lib/viewer/global-media-player-float-pos';

export type MediaPlayerChromePosition = 'top' | 'bottom';

export const MEDIA_PLAYER_POSITION_LABELS: Record<MediaPlayerChromePosition, string> = {
  top: '顶部',
  bottom: '底部',
};

export const MEDIA_PLAYER_POSITION_HINTS: Record<MediaPlayerChromePosition, string> = {
  top: '固定/层叠时贴在主界面顶部（顶栏下方）。',
  bottom: '固定/层叠时贴在主界面底部（移动底栏上方）。',
};

/** 悬浮布局说明（位置由拖拽决定，不用顶/底设置） */
export const MEDIA_PLAYER_FLOATING_LAYOUT_HINT =
  '可拖拽调整位置，默认靠底部居中；贴边松手后收起为侧边条（与收起按钮相同），侧边条位置跟随原窗体。';

export function normalizeMediaPlayerChromePosition(
  value: unknown,
): MediaPlayerChromePosition {
  return value === 'top' ? 'top' : 'bottom';
}

export function resolveMediaPlayerChromeLayout(): ViewerChromeLayout {
  return normalizeViewerChromeLayout(
    settingsState.app.mediaPlayerChromeLayout ?? defaultMediaPlayerChromeLayout,
  );
}

export function resolveMediaPlayerChromePosition(): MediaPlayerChromePosition {
  return normalizeMediaPlayerChromePosition(
    settingsState.app.mediaPlayerChromePosition ?? 'bottom',
  );
}

export const defaultMediaPlayerChromeLayout: ViewerChromeLayout = 'fixed';

export const defaultMediaPlayerChromePosition: MediaPlayerChromePosition = 'bottom';

/**
 * 叠在文本/漫画阅读器上时，收起侧条避开阅读器顶/底 chrome（工具栏/进度条）。
 * 含 safe-area，避免与刘海/手势条及阅读器栏重叠。
 */
export const globalMediaPlayerOverReaderBottomClass =
  'bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))]';
export const globalMediaPlayerOverReaderTopClass =
  'top-[calc(5.75rem+env(safe-area-inset-top,0px))]';

/** 展开入场：固定/层叠按顶底；悬浮按贴边侧。动画须挂在定位壳内层。 */
export function mediaPlayerExpandMotionClass(opts: {
  reduceMotion: boolean;
  layout: ViewerChromeLayout;
  position: MediaPlayerChromePosition;
  floatEdge?: Exclude<GmpFloatEdge, 'none'>;
}): string {
  if (opts.reduceMotion) return '';
  if (opts.layout === 'floating') {
    switch (opts.floatEdge ?? 'right') {
      case 'left':
        return 'gmp-chrome-anim-expand-float-left';
      case 'top':
        return 'gmp-chrome-anim-expand-float-top';
      case 'bottom':
        return 'gmp-chrome-anim-expand-float-bottom';
      default:
        return 'gmp-chrome-anim-expand-float-right';
    }
  }
  // 固定/层叠为全宽条：从顶/底边中心展开，而非角落
  return opts.position === 'top'
    ? 'gmp-chrome-anim-expand-bar-top'
    : 'gmp-chrome-anim-expand-bar-bottom';
}

/** 收起侧条入场：按贴边侧；层叠默认右侧 */
export function mediaPlayerCollapseMotionClass(opts: {
  reduceMotion: boolean;
  edge?: Exclude<GmpFloatEdge, 'none'>;
}): string {
  if (opts.reduceMotion) return '';
  switch (opts.edge ?? 'right') {
    case 'left':
      return 'gmp-chrome-anim-collapse-left';
    case 'top':
      return 'gmp-chrome-anim-collapse-top';
    case 'bottom':
      return 'gmp-chrome-anim-collapse-bottom';
    default:
      return 'gmp-chrome-anim-collapse-right';
  }
}
