import type { Component } from 'solid-js';
import { Show } from 'solid-js';
import { AudioSourceSettings } from '@/components/media/viewer/audio/music/AudioSourceSettings';
import { AudioAccountPanel } from '@/components/media/viewer/audio/music/AudioAccountPanel';
import { MusicFreePluginSettings } from '@/components/media/viewer/audio/music/settings/MusicFreePluginSettings';
import { listUserApiScripts } from '@/lib/media/audio/online/user-api-engine';
import { listMfPlugins } from '@/lib/media/audio/online/mf-plugin';

export const MusicSettingsBasic: Component = () => (
  <div class="divide-y">
    <section class="space-y-2 p-4">
      <h2 class="text-base font-semibold">自定义源（LX UserApi）</h2>
      <AudioSourceSettings open inline />
      <Show when={listUserApiScripts().length === 0}>
        <p class="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          暂无自定义源。请从本地文件或脚本 URL 导入 LX 兼容的自定义源。
        </p>
      </Show>
    </section>

    <section class="space-y-2 p-4">
      <h2 class="text-base font-semibold">MusicFree 插件（辅源）</h2>
      <MusicFreePluginSettings />
      <Show when={listMfPlugins().length === 0}>
        <p class="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          作为 LX 之外的辅源通道，协议与 UserApi 不互通。
        </p>
      </Show>
    </section>

    <section class="space-y-2 p-4">
      <h2 class="text-base font-semibold">平台账号</h2>
      <AudioAccountPanel open inline />
    </section>
  </div>
);
