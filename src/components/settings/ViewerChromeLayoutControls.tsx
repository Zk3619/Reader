import { For } from 'solid-js';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  readerDrawerOptionTabsListClass,
  readerDrawerOptionTabsTriggerClass,
  settingsOptionTabsListClass,
  settingsOptionTabsTriggerClass,
} from '@/lib/settings/settings-tab-styles';
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
}

export function ViewerChromeLayoutControls(props: ViewerChromeLayoutControlsProps) {
  const layout = () =>
    normalizeViewerChromeLayout(settingsState.app.viewerChromeLayout);
  const tabsListClass = () =>
    props.variant === 'drawer'
      ? readerDrawerOptionTabsListClass
      : settingsOptionTabsListClass;
  const tabsTriggerClass = () =>
    props.variant === 'drawer'
      ? readerDrawerOptionTabsTriggerClass
      : settingsOptionTabsTriggerClass;

  return (
    <div class={cn('space-y-2', props.class)}>
      <Tabs
        value={layout()}
        onChange={(value) =>
          void settingsStore.setViewerChromeLayout(value as ViewerChromeLayout)
        }
        class="w-full"
      >
        <TabsList class={tabsListClass()} aria-label="顶栏与底栏布局">
          <For each={LAYOUT_OPTIONS}>
            {(value) => (
              <TabsTrigger value={value} class={tabsTriggerClass()}>
                {VIEWER_CHROME_LAYOUT_LABELS[value]}
              </TabsTrigger>
            )}
          </For>
        </TabsList>
      </Tabs>
      {props.showHint !== false ? (
        <p class="text-xs text-muted-foreground">
          {VIEWER_CHROME_LAYOUT_HINTS[layout()]}
        </p>
      ) : null}
    </div>
  );
}
