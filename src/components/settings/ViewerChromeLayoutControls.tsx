import { type Accessor } from 'solid-js';
import { AppTabs } from '@/components/shared/AppTabs';
import { cn } from '@/lib/utils';
import {
  VIEWER_CHROME_LAYOUT_HINTS,
  VIEWER_CHROME_LAYOUT_LABELS,
  type ViewerChromeLayout,
} from '@/components/viewer/viewer-chrome';
import { normalizeViewerChromeLayout } from '@/lib/viewer/viewer-chrome-layout';
import { settingsState, settingsStore } from '@/stores/settings';

const LAYOUT_OPTIONS: ViewerChromeLayout[] = ['fixed', 'stacked', 'floating'];

export interface ViewerChromeLayoutControlsProps {
  class?: string;
  /** 是否显示当前选项说明 */
  showHint?: boolean;
  /** drawer：阅读设置抽屉内均分宽度 */
  variant?: 'default' | 'drawer';
  /** 受控模式：用于单阅读器配置（如漫画界面设置） */
  value?: Accessor<ViewerChromeLayout>;
  onChange?: (layout: ViewerChromeLayout) => void;
}

export function ViewerChromeLayoutControls(props: ViewerChromeLayoutControlsProps) {
  const layout = () => {
    if (props.value) {
      return normalizeViewerChromeLayout(props.value());
    }
    return normalizeViewerChromeLayout(settingsState.app.viewerChromeLayout);
  };
  const tabsVariant = () => (props.variant === 'drawer' ? 'drawer' : 'settings-equal');

  return (
    <AppTabs
      class={cn(props.class)}
      layout="stacked"
      variant={tabsVariant()}
      value={layout()}
      options={LAYOUT_OPTIONS}
      labels={VIEWER_CHROME_LAYOUT_LABELS}
      ariaLabel="顶栏与底栏布局"
      hint={props.showHint !== false ? VIEWER_CHROME_LAYOUT_HINTS[layout()] : undefined}
      onChange={(value) => {
        const next = value as ViewerChromeLayout;
        if (props.onChange) {
          props.onChange(next);
          return;
        }
        void settingsStore.setViewerChromeLayout(next);
      }}
    />
  );
}
