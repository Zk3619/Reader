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
          暂无自定义源。对齐 LX：内置五源仅提供检索等数据，在线播放需导入 LX 兼容的
          musicUrl 自定义源、使用 MusicFree 插件，或登录下方平台账号源。
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
      <p class="text-sm text-muted-foreground">
        网易云 / B 站 / YouTube Music 登录后可作为平台源搜播（与 LX 五源、UserApi、MusicFree 并列）。
      </p>
      <AudioAccountPanel open inline />
    </section>
  </div>
);
