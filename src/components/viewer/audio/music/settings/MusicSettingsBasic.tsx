import type { Component } from 'solid-js';
import { Show } from 'solid-js';
import { AudioSourceSettings } from '@/components/viewer/audio/music/AudioSourceSettings';
import { AudioAccountPanel } from '@/components/viewer/audio/music/AudioAccountPanel';
import { listUserApiScripts } from '@/lib/media/audio/online/user-api-engine';

export const MusicSettingsBasic: Component = () => (
  <div class="space-y-4 p-4">
    <AudioSourceSettings open inline />
    <Show when={listUserApiScripts().length === 0}>
      <section class="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        <h3 class="mb-2 font-medium text-foreground">UserApi 自定义源</h3>
        <p>尚未导入任何自定义音乐源。你可以：</p>
        <ul class="mt-2 list-inside list-disc space-y-1">
          <li>在上方「UserApi 自定义源」区域粘贴 LX 兼容脚本并保存</li>
          <li>前往「源管理」页导入社区分享的 music source JSON</li>
          <li>导入后可在播放设置中选择 UserApi 取流策略</li>
        </ul>
      </section>
    </Show>
    <AudioAccountPanel open inline />
  </div>
);
