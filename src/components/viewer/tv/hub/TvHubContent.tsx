/**
 * 影视 Hub 分区内容（visited keep-alive）
 */

import { For, Show, createEffect, createSignal, type Accessor, type JSX } from 'solid-js';
import { getTvHubState } from '@/stores/tv-hub/section';
import type { TvHubSection } from '@/lib/media/tv/types';
import { cn } from '@/lib/utils';
import { TvHomePane } from '../panes/TvHomePane';
import { TvLivePane } from '../panes/TvLivePane';
import { TvSearchPane } from '../panes/TvSearchPane';
import { TvKeepPane } from '../panes/TvKeepPane';
import { TvHistoryPane } from '../panes/TvHistoryPane';
import { TvDetailPane } from '../panes/TvDetailPane';
import { TvPlayPane } from '../panes/TvPlayPane';
import { TvSettingsPane } from '../panes/TvSettingsPane';
import { TvWallBackdrop } from './TvWallBackdrop';

function Section(props: {
  id: TvHubSection;
  active: Accessor<boolean>;
  children: JSX.Element;
}) {
  const [visited, setVisited] = createSignal(false);
  createEffect(() => {
    if (props.active()) setVisited(true);
  });
  return (
    <Show when={visited()}>
      <div
        class="flex min-h-0 flex-1 flex-col overflow-hidden"
        classList={{ hidden: !props.active() }}
      >
        {props.children}
      </div>
    </Show>
  );
}

const SECTIONS: TvHubSection[] = [
  'home',
  'live',
  'search',
  'keep',
  'history',
  'detail',
  'play',
  'settings',
];

export function TvHubContent(props: { active: Accessor<boolean> }) {
  const section = () => getTvHubState().section;

  const pane = (id: TvHubSection) => {
    switch (id) {
      case 'home':
        return <TvHomePane />;
      case 'live':
        return <TvLivePane />;
      case 'search':
        return <TvSearchPane />;
      case 'keep':
        return <TvKeepPane />;
      case 'history':
        return <TvHistoryPane />;
      case 'detail':
        return <TvDetailPane />;
      case 'play':
        return <TvPlayPane />;
      case 'settings':
        return <TvSettingsPane />;
    }
  };

  const isPlay = () => section() === 'play';

  return (
    <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <Show when={!isPlay()}>
        <TvWallBackdrop />
      </Show>
      {/* 播放页必须不透明纯黑，避免壁纸/半透明层透出导致发灰 */}
      <div
        class={cn(
          'relative z-1 flex min-h-0 flex-1 flex-col overflow-hidden',
          isPlay() ? 'bg-black' : 'bg-background/75 backdrop-blur-[1px]',
        )}
      >
        <For each={SECTIONS}>
          {(id) => (
            <Section id={id} active={() => props.active() && section() === id}>
              {pane(id)}
            </Section>
          )}
        </For>
      </div>
    </div>
  );
}
