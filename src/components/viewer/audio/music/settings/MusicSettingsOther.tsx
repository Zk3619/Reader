import type { Component } from 'solid-js';
import { AudioDislikePanel } from '@/components/viewer/audio/music/AudioDislikePanel';

export const MusicSettingsOther: Component = () => (
  <div class="space-y-4 p-4">
    <AudioDislikePanel open inline />
    <p class="text-sm text-muted-foreground">缓存清理请使用系统设置中的存储管理。</p>
  </div>
);
