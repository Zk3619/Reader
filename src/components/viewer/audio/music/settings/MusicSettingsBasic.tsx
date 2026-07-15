import type { Component } from 'solid-js';
import { Show } from 'solid-js';
import { AudioSourceSettings } from '@/components/viewer/audio/music/AudioSourceSettings';
import { AudioAccountPanel } from '@/components/viewer/audio/music/AudioAccountPanel';
import { listUserApiScripts } from '@/lib/media/audio/online/user-api-engine';

export const MusicSettingsBasic: Component = () => (
  <div class="divide-y">
    <section class="space-y-2 p-4">
      <h2 class="text-base font-semibold">自定义源</h2>
      <AudioSourceSettings open inline />
      <Show when={listUserApiScripts().length === 0}>
        <p class="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          暂无自定义源。请从本地文件或脚本 URL 导入 LX 兼容的自定义源。
        </p>
      </Show>
    </section>

    <section class="space-y-2 p-4">
      <h2 class="text-base font-semibold">Reader 扩展 · 平台账号</h2>
      <AudioAccountPanel open inline />
    </section>
  </div>
);
