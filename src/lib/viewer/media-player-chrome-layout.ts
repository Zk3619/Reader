import type { ViewerChromeLayout } from '@/components/viewer/viewer-chrome';
import { normalizeViewerChromeLayout } from '@/lib/viewer/viewer-chrome-layout';
import { settingsState } from '@/stores/settings';

export type MediaPlayerChromePosition = 'top' | 'bottom';

export const MEDIA_PLAYER_POSITION_LABELS: Record<MediaPlayerChromePosition, string> = {
  top: '顶部',
  bottom: '底部',
};

export const MEDIA_PLAYER_POSITION_HINTS: Record<MediaPlayerChromePosition, string> = {
  top: '播放器固定在主界面顶部（顶栏下方）。',
  bottom: '播放器固定在主界面底部（移动底栏上方）。',
};

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

/** 悬浮模式：与顶/底壳层的间距（对称） */
export const globalMediaPlayerFloatingEdgeClass = 'm-3';
