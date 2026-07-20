/**
 * lx 式分模块设置路由
 */

import { Match, Switch, type Component } from 'solid-js';
import { MusicSettingsTheme } from '@/components/media/viewer/audio/music/settings/MusicSettingsTheme';
import { MusicSettingsBasic } from '@/components/media/viewer/audio/music/settings/MusicSettingsBasic';
import { MusicSettingsPlay } from '@/components/media/viewer/audio/music/settings/MusicSettingsPlay';
import { MusicSettingsPlayDetail } from '@/components/media/viewer/audio/music/settings/MusicSettingsPlayDetail';
import { MusicSettingsSearch } from '@/components/media/viewer/audio/music/settings/MusicSettingsSearch';
import { MusicSettingsList } from '@/components/media/viewer/audio/music/settings/MusicSettingsList';
import { MusicSettingsDownload } from '@/components/media/viewer/audio/music/settings/MusicSettingsDownload';
import { MusicSettingsDesktopLyric } from '@/components/media/viewer/audio/music/settings/MusicSettingsDesktopLyric';
import { MusicSettingsHotKey } from '@/components/media/viewer/audio/music/settings/MusicSettingsHotKey';
import { MusicSettingsServices } from '@/components/media/viewer/audio/music/settings/MusicSettingsServices';
import { MusicSettingsDataMaintenance } from '@/components/media/viewer/audio/music/settings/MusicSettingsDataMaintenance';
import type { MusicSettingsSection } from '@/components/media/viewer/audio/music/settings/music-settings-sections';

export type { MusicSettingsSection } from '@/components/media/viewer/audio/music/settings/music-settings-sections';

export interface MusicSettingsRouterProps {
  section: MusicSettingsSection;
}

export const MusicSettingsRouter: Component<MusicSettingsRouterProps> = (props) => (
  <Switch>
    <Match when={props.section === 'theme'}>
      <MusicSettingsTheme />
    </Match>
    <Match when={props.section === 'basic'}>
      <MusicSettingsBasic />
    </Match>
    <Match when={props.section === 'play'}>
      <MusicSettingsPlay />
    </Match>
    <Match when={props.section === 'playDetail'}>
      <MusicSettingsPlayDetail />
    </Match>
    <Match when={props.section === 'desktopLyric'}>
      <MusicSettingsDesktopLyric />
    </Match>
    <Match when={props.section === 'search'}>
      <MusicSettingsSearch />
    </Match>
    <Match when={props.section === 'list'}>
      <MusicSettingsList />
    </Match>
    <Match when={props.section === 'download'}>
      <MusicSettingsDownload />
    </Match>
    <Match when={props.section === 'hotKey'}>
      <MusicSettingsHotKey />
    </Match>
    <Match when={props.section === 'services'}>
      <MusicSettingsServices />
    </Match>
    <Match when={props.section === 'dataMaintenance'}>
      <MusicSettingsDataMaintenance />
    </Match>
  </Switch>
);
