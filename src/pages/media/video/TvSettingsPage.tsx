/**
 * 影视设置页（兼容 App overlay；内容与 Hub settings 一致）
 */

import { TvSettingsPane } from '@/components/viewer/tv/panes/TvSettingsPane';
import { SettingsToolbarLeading } from '@/components/shell/SettingsPageToolbar';
import { cn } from '@/lib/utils';
import { mainShellPageRoot, mainShellTabEnterClass } from '@/lib/ui/viewport-classes';
import { settingsStore } from '@/stores/settings';
import { setTvSection } from '@/stores/tv-hub/section';

export interface TvSettingsPageProps {
  onBack?: () => void;
}

export function TvSettingsPage(props: TvSettingsPageProps) {
  const tabEnterClass = () =>
    mainShellTabEnterClass(settingsStore.state.app.reduceMotion);

  return (
    <section class={cn(tabEnterClass(), mainShellPageRoot)}>
      <div class="absolute left-2 top-2 z-10">
        {props.onBack ? (
          <SettingsToolbarLeading
            onBack={() => {
              setTvSection('home');
              props.onBack?.();
            }}
          />
        ) : undefined}
      </div>
      <TvSettingsPane />
    </section>
  );
}
