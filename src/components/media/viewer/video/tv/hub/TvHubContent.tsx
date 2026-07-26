/**
 * 影视 Hub 分区内容（visited keep-alive）
 */

import { For, Show, createEffect, createSignal, type Accessor, type JSX } from 'solid-js';
import { getTvHubState } from '@/stores/tv-hub/section';
import type { TvHubSection } from '@/lib/media/tv/types';
import { TvHomePane } from '../panes/TvHomePane';
import { TvLivePane } from '../panes/TvLivePane';
import { TvSearchPane } from '../panes/TvSearchPane';
import { TvKeepPane } from '../panes/TvKeepPane';
import { TvHistoryPane } from '../panes/TvHistoryPane';
import { TvDetailPane } from '../panes/TvDetailPane';
import { TvPlayPane } from '../panes/TvPlayPane';
import { TvSettingsPane } from '../panes/TvSettingsPane';
import { TvLibraryPane } from '../panes/TvLibraryPane';
import { TvSniffBrowserPane } from '../panes/TvSniffBrowserPane';
import { TvBangumiPane } from '../panes/TvBangumiPane';

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
  'library',
  'sniff',
  'bangumi',
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
      case 'library':
        return <TvLibraryPane />;
      case 'sniff':
        return <TvSniffBrowserPane />;
      case 'bangumi':
        return <TvBangumiPane />;
      case 'detail':
        return <TvDetailPane />;
      case 'play':
        // keep-alive：离开 play 时迁入迷你窗续播（见 TvPlayPane / tv-player-runtime）
        return <TvPlayPane active={() => props.active() && section() === 'play'} />;
      case 'settings':
        return <TvSettingsPane />;
    }
  };

  return (
    <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* 壳层配色与首页一致；播放器舞台自身纯黑。TvWallBackdrop 壁纸层已弃用，待主题工作室接入 */}
      <div class="relative z-1 flex min-h-0 flex-1 flex-col overflow-hidden bg-background/75 backdrop-blur-[1px]">
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
