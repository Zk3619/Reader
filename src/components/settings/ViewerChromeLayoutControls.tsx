import { For } from 'solid-js';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
}

export function ViewerChromeLayoutControls(props: ViewerChromeLayoutControlsProps) {
  const layout = () =>
    normalizeViewerChromeLayout(settingsState.app.viewerChromeLayout);

  return (
    <div class={cn('space-y-2', props.class)}>
      <Tabs
        value={layout()}
        onChange={(value) =>
          void settingsStore.setViewerChromeLayout(value as ViewerChromeLayout)
        }
        class="w-full sm:w-auto"
      >
        <TabsList
          class={cn(
            'flex h-auto w-full gap-1 rounded-lg border border-input bg-muted p-1.5',
            'sm:w-auto',
          )}
          aria-label="顶栏与底栏布局"
        >
          <For each={LAYOUT_OPTIONS}>
            {(value) => (
              <TabsTrigger
                value={value}
                class="h-8 min-w-18 flex-1 shadow-none data-selected:ring-1 data-selected:ring-primary/30 sm:flex-none"
              >
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
