import { createSignal, type Component, Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import { AudioSourceSettings } from '@/components/media/viewer/audio/music/AudioSourceSettings';
import { AudioAccountPanel } from '@/components/media/viewer/audio/music/AudioAccountPanel';
import { MusicFreePluginSettings } from '@/components/media/viewer/audio/music/settings/MusicFreePluginSettings';
import { listUserApiScripts } from '@/lib/media/audio/online/user-api-engine';
import { listMfPlugins } from '@/lib/media/audio/online/mf-plugin';

export const MusicSettingsBasic: Component = () => {
  const [accountOpen, setAccountOpen] = createSignal(false);

  return (
    <div class="divide-y">
      <section class="space-y-2 p-4">
        <h2 class="text-base font-semibold">自定义源（LX UserApi）</h2>
        <AudioSourceSettings open inline />
        <Show when={listUserApiScripts().length === 0}>
          <p class="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            暂无自定义源。对齐 LX：内置五源仅提供检索等数据，在线播放需导入 LX 兼容的
            musicUrl 自定义源、使用 MusicFree 插件，或登录平台账号源（主设置 → 网络 → Cookie
            Hub）。
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
          网易云 / B 站 / YouTube Music 登录请在「设置 → 网络 → Cookie Hub」完成；此处可同步歌单到「我的列表」。
        </p>
        <Button size="sm" variant="outline" onClick={() => setAccountOpen(true)}>
          歌单同步
        </Button>
        <AudioAccountPanel open={accountOpen()} onOpenChange={setAccountOpen} />
      </section>
    </div>
  );
};
