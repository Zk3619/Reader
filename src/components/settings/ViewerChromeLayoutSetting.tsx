import { ViewerChromeLayoutControls } from '@/components/settings/ViewerChromeLayoutControls';

/** 设置页：阅读器顶栏与底栏布局（固定 / 层叠 / 悬浮） */
export function ViewerChromeLayoutSetting() {
  return (
    <div class="rounded-2xl border border-border/50 bg-card p-6">
      <div class="space-y-4">
        <div class="space-y-1">
          <h3 class="font-semibold text-foreground">阅读器顶栏与底栏</h3>
          <p class="text-sm text-muted-foreground">
            适用于文本、图片、音频、视频等阅读器。层叠为整条叠在内容上；悬浮为独立圆角控件浮在正文上方。
          </p>
        </div>
        <ViewerChromeLayoutControls />
      </div>
    </div>
  );
}
