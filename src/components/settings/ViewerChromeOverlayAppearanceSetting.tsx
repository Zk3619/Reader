import { SettingsNumberField } from '@/components/settings/SettingsNumberField';
import {
  DEFAULT_VIEWER_CHROME_OVERLAY_BLUR_PX,
  DEFAULT_VIEWER_CHROME_OVERLAY_OPACITY,
  VIEWER_CHROME_OVERLAY_BLUR_MAX,
  VIEWER_CHROME_OVERLAY_BLUR_MIN,
  VIEWER_CHROME_OVERLAY_OPACITY_MAX,
  VIEWER_CHROME_OVERLAY_OPACITY_MIN,
} from '@/lib/viewer/media-viewer-chrome-overlay-appearance';
import { settingsState, settingsStore } from '@/stores/settings';

/** 设置页：media-viewer 层叠/悬浮顶底栏及附加区域透明度与模糊 */
export function ViewerChromeOverlayAppearanceSetting() {
  const opacity = () =>
    settingsState.app.viewerChromeOverlayOpacity ?? DEFAULT_VIEWER_CHROME_OVERLAY_OPACITY;
  const blurPx = () =>
    settingsState.app.viewerChromeOverlayBlurPx ?? DEFAULT_VIEWER_CHROME_OVERLAY_BLUR_PX;

  return (
    <div class="space-y-4 border-t border-border/50 pt-4">
      <div class="space-y-1">
        <p class="text-sm font-medium text-foreground">层叠 / 悬浮栏外观</p>
        <p class="text-sm text-muted-foreground">
          作用于文本、漫画、音频、视频阅读器在层叠或悬浮模式下的顶栏、底栏及书源条、进度条等附加区域。固定占位模式始终为不透明实底。
        </p>
      </div>

      <div class="flex items-center justify-between gap-4">
        <div class="min-w-0 space-y-0.5">
          <p class="text-sm font-medium text-foreground">背景不透明度</p>
          <p class="text-xs text-muted-foreground">100 为完全不透明（默认）</p>
        </div>
        <SettingsNumberField
          value={opacity()}
          min={VIEWER_CHROME_OVERLAY_OPACITY_MIN}
          max={VIEWER_CHROME_OVERLAY_OPACITY_MAX}
          onValueChange={(value) => void settingsStore.setViewerChromeOverlayOpacity(value)}
        />
      </div>

      <div class="flex items-center justify-between gap-4">
        <div class="min-w-0 space-y-0.5">
          <p class="text-sm font-medium text-foreground">背景模糊</p>
          <p class="text-xs text-muted-foreground">0 为不模糊（默认），单位 px</p>
        </div>
        <SettingsNumberField
          value={blurPx()}
          min={VIEWER_CHROME_OVERLAY_BLUR_MIN}
          max={VIEWER_CHROME_OVERLAY_BLUR_MAX}
          onValueChange={(value) => void settingsStore.setViewerChromeOverlayBlurPx(value)}
        />
      </div>
    </div>
  );
}
