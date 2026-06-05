import { Switch, Match } from 'solid-js';
import type { SettingsCategoryId } from '@/lib/settings/settings-catalog';
import {
  BookOpenIcon,
  BookSourceIcon,
  FolderTreeIcon,
  LayoutIcon,
  SettingsIcon,
  GroupLocalIcon,
} from '@/components/shared/icons';

export interface SettingsCategoryIconProps {
  categoryId: SettingsCategoryId;
  class?: string;
}

export function SettingsCategoryIcon(props: SettingsCategoryIconProps) {
  return (
    <Switch>
      <Match when={props.categoryId === 'appearance'}>
        <LayoutIcon class={props.class} size={20} />
      </Match>
      <Match when={props.categoryId === 'reading'}>
        <BookOpenIcon class={props.class} size={20} />
      </Match>
      <Match when={props.categoryId === 'sources'}>
        <BookSourceIcon class={props.class} size={20} />
      </Match>
      <Match when={props.categoryId === 'storage'}>
        <GroupLocalIcon class={props.class} size={20} />
      </Match>
      <Match when={props.categoryId === 'data'}>
        <FolderTreeIcon class={props.class} size={20} />
      </Match>
      <Match when={props.categoryId === 'other'}>
        <SettingsIcon class={props.class} size={20} />
      </Match>
    </Switch>
  );
}
