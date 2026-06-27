import { ViewerChromeLayoutControls } from '@/components/settings/ViewerChromeLayoutControls';
import { AppTabs } from '@/components/shared/AppTabs';
import {
  defaultMediaPlayerChromeLayout,
  MEDIA_PLAYER_POSITION_HINTS,
  MEDIA_PLAYER_POSITION_LABELS,
  normalizeMediaPlayerChromePosition,
  type MediaPlayerChromePosition,
} from '@/lib/viewer/media-player-chrome-layout';
import { normalizeViewerChromeLayout } from '@/lib/viewer/viewer-chrome-layout';
import { settingsState, settingsStore } from '@/stores/settings';

const POSITION_OPTIONS: MediaPlayerChromePosition[] = ['bottom', 'top'];

/** 设置页：全局媒体播放器布局与位置 */
export function MediaPlayerChromeSetting() {
  const position = () =>
    normalizeMediaPlayerChromePosition(settingsState.app.mediaPlayerChromePosition);

  return (
    <div class="rounded-2xl border border-border/50 bg-card p-6">
      <div class="space-y-4">
        <div class="space-y-1">
          <h3 class="font-semibold text-foreground">全局媒体播放器</h3>
          <p class="text-sm text-muted-foreground">
            后台朗读、音频与视频播放时，在主界面显示的播放控制条。层叠与悬浮模式可收起为侧边条。
          </p>
        </div>

        <div class="space-y-2">
          <p class="text-sm font-medium text-foreground">布局</p>
          <ViewerChromeLayoutControls
            value={() =>
              normalizeViewerChromeLayout(
                settingsState.app.mediaPlayerChromeLayout ?? defaultMediaPlayerChromeLayout,
              )
            }
            onChange={(layout) => void settingsStore.setMediaPlayerChromeLayout(layout)}
          />
        </div>

        <AppTabs
          layout="stacked"
          variant="settings-equal"
          label="位置"
          value={position()}
          options={POSITION_OPTIONS}
          labels={MEDIA_PLAYER_POSITION_LABELS}
          ariaLabel="播放器位置"
          hint={MEDIA_PLAYER_POSITION_HINTS[position()]}
          onChange={(value) => {
            void settingsStore.setMediaPlayerChromePosition(value as MediaPlayerChromePosition);
          }}
        />
      </div>
    </div>
  );
}
