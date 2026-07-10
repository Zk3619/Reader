import type { Component } from 'solid-js';
import { AudioSyncSettings } from '@/components/viewer/audio/music/AudioSyncSettings';

export const MusicSettingsSync: Component = () => (
  <div class="p-4">
    <AudioSyncSettings open inline />
  </div>
);
