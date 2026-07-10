/**
 * @deprecated 请使用 MusicHubShell（MediaPage 入口）。本组件保留兼容重定向。
 */

import { onMount, type Accessor, type Component } from 'solid-js';
import { navigateToMusicHub } from '@/stores/shell-tabs';

export interface AudioMusicModeViewProps {
  onClose: () => void;
  entryVisible?: Accessor<boolean>;
}

export const AudioMusicModeView: Component<AudioMusicModeViewProps> = (props) => {
  onMount(() => {
    void navigateToMusicHub({ section: 'search' });
    props.onClose();
  });
  return null;
};
