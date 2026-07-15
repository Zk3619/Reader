import { Switch, Match } from 'solid-js';
import type { SettingsCategoryId } from '@/lib/settings/settings-catalog';
import {
  LayoutIcon,
  SettingsIcon,
  GroupLocalIcon,
  GlobeIcon,
  ThemeSystemIcon,
  BookInfoIcon,
} from '@/components/shared/icons';

export interface SettingsCategoryIconProps {
  categoryId: SettingsCategoryId;
  class?: string;
}

export function SettingsCategoryIcon(props: SettingsCategoryIconProps) {
  return (
    <Switch>
      <Match when={props.categoryId === 'general'}>
        <SettingsIcon class={props.class} size={20} />
      </Match>
      <Match when={props.categoryId === 'appearance'}>
        <LayoutIcon class={props.class} size={20} />
      </Match>
      <Match when={props.categoryId === 'window-system'}>
        <ThemeSystemIcon class={props.class} size={20} />
      </Match>
      <Match when={props.categoryId === 'network'}>
        <GlobeIcon class={props.class} size={20} />
      </Match>
      <Match when={props.categoryId === 'storage'}>
        <GroupLocalIcon class={props.class} size={20} />
      </Match>
      <Match when={props.categoryId === 'about'}>
        <BookInfoIcon class={props.class} size={20} />
      </Match>
    </Switch>
  );
}
