/**
 * lx 式分模块设置路由
 */

import { Match, Switch, type Component } from 'solid-js';
import { MusicSettingsBasic } from '@/components/viewer/audio/music/settings/MusicSettingsBasic';
import { MusicSettingsPlay } from '@/components/viewer/audio/music/settings/MusicSettingsPlay';
import { MusicSettingsSearch } from '@/components/viewer/audio/music/settings/MusicSettingsSearch';
import { MusicSettingsList } from '@/components/viewer/audio/music/settings/MusicSettingsList';
import { MusicSettingsDownload } from '@/components/viewer/audio/music/settings/MusicSettingsDownload';
import { MusicSettingsSync } from '@/components/viewer/audio/music/settings/MusicSettingsSync';
import { MusicSettingsNetwork } from '@/components/viewer/audio/music/settings/MusicSettingsNetwork';
import { MusicSettingsBackup } from '@/components/viewer/audio/music/settings/MusicSettingsBackup';
import { MusicSettingsOther } from '@/components/viewer/audio/music/settings/MusicSettingsOther';
import { MusicSettingsDesktop } from '@/components/viewer/audio/music/settings/MusicSettingsDesktop';
import { MusicSettingsDesktopLyric } from '@/components/viewer/audio/music/settings/MusicSettingsDesktopLyric';

export type MusicSettingsSection =
  | 'basic'
  | 'play'
  | 'search'
  | 'list'
  | 'download'
  | 'sync'
  | 'network'
  | 'backup'
  | 'other';

export interface MusicSettingsRouterProps {
  section: MusicSettingsSection;
}

export const MusicSettingsRouter: Component<MusicSettingsRouterProps> = (props) => (
  <Switch>
    <Match when={props.section === 'basic'}>
      <MusicSettingsBasic />
    </Match>
    <Match when={props.section === 'play'}>
      <MusicSettingsPlay />
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
    <Match when={props.section === 'sync'}>
      <MusicSettingsSync />
    </Match>
    <Match when={props.section === 'network'}>
      <MusicSettingsNetwork />
    </Match>
    <Match when={props.section === 'backup'}>
      <MusicSettingsBackup />
    </Match>
    <Match when={props.section === 'other'}>
      <MusicSettingsDesktop />
      <MusicSettingsDesktopLyric />
      <MusicSettingsOther />
    </Match>
  </Switch>
);
