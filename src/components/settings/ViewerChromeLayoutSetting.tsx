import { ViewerChromeLayoutControls } from '@/components/settings/ViewerChromeLayoutControls';
import { ViewerChromeOverlayAppearanceSetting } from '@/components/settings/ViewerChromeOverlayAppearanceSetting';

/** 设置页：阅读器顶栏与底栏布局（固定 / 层叠 / 悬浮） */
export function ViewerChromeLayoutSetting() {
  return (
    <div class="rounded-2xl border border-border/50 bg-card p-6">
      <div class="space-y-4">
        <div class="space-y-1">
          <h3 class="font-semibold text-foreground">阅读器顶栏与底栏</h3>
          <p class="text-sm text-muted-foreground">
            文本与漫画阅读器可在各自界面设置中单独覆盖。此处为默认布局，并作用于音频、视频等未单独配置的阅读器。
          </p>
        </div>
        <ViewerChromeLayoutControls />
        <ViewerChromeOverlayAppearanceSetting />
      </div>
    </div>
  );
}
