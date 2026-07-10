/** 音源设置 */
import { createSignal, For, Show, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { BUILTIN_SOURCES } from '@/lib/media/audio/online/source-router';
import {
  listUserApiScripts,
  registerUserApiScript,
  removeUserApiScript,
  setUserApiScriptEnabled,
  getDefaultUserApiId,
  setDefaultUserApiId,
} from '@/lib/media/audio/online/user-api-engine';
import {
  getMusicOfflineMode,
  setMusicOfflineMode,
} from '@/lib/media/audio/online/user-api-settings';
import {
  isFallbackResolverEnabled,
  setFallbackResolverEnabled,
} from '@/lib/media/audio/platform/fallback-resolver';
import { AudioPanelShell } from '@/components/viewer/audio/music/AudioPanelShell';

export interface AudioSourceSettingsProps {
  open: boolean;
  onClose?: () => void;
  inline?: boolean;
}

export const AudioSourceSettings: Component<AudioSourceSettingsProps> = (props) => {
  const userApis = () => listUserApiScripts();
  const [scriptName, setScriptName] = createSignal('');
  const [defaultId, setDefaultId] = createSignal(getDefaultUserApiId() ?? '');
  const [offline, setOffline] = createSignal(getMusicOfflineMode());
  const [fallback, setFallback] = createSignal(isFallbackResolverEnabled());

  const importScriptFile = async (file: File) => {
    const text = await file.text();
    const id = `userapi_${Date.now()}`;
    registerUserApiScript({
      id,
      name: scriptName().trim() || file.name.replace(/\.[^.]+$/, ''),
      script: text,
      enabled: true,
    });
    setScriptName('');
  };

  return (
    <AudioPanelShell
      open={props.open}
      inline={props.inline}
      title="音源设置"
      onClose={props.onClose}
    >
      <div class="space-y-4 p-4">
        <section>
          <h3 class="mb-2 text-sm font-medium">内置源</h3>
          <ul class="text-sm text-muted-foreground">
            <For each={BUILTIN_SOURCES}>{(s) => <li>{s.toUpperCase()}</li>}</For>
          </ul>
        </section>
        <section class="space-y-2">
          <label class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={offline()}
              onChange={(e) => {
                setOffline(e.currentTarget.checked);
                setMusicOfflineMode(e.currentTarget.checked);
              }}
            />
            离线优先（仅播放已缓存曲目）
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={fallback()}
              onChange={(e) => {
                setFallback(e.currentTarget.checked);
                setFallbackResolverEnabled(e.currentTarget.checked);
              }}
            />
            多源兜底（主源失败时自动换源）
          </label>
        </section>
        <section>
          <h3 class="mb-2 text-sm font-medium">UserApi 自定义源</h3>
          <input
            class="mb-2 w-full rounded-md border px-3 py-2 text-sm"
            placeholder="脚本名称（可选）"
            value={scriptName()}
            onInput={(e) => setScriptName(e.currentTarget.value)}
          />
          <input
            type="file"
            accept=".js,.txt,.json"
            class="text-sm"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (file) void importScriptFile(file);
            }}
          />
          <Show
            when={userApis().length > 0}
            fallback={<p class="mt-2 text-sm text-muted-foreground">暂无自定义源</p>}
          >
            <ul class="mt-2 space-y-2">
              <For each={userApis()}>
                {(s) => (
                  <li class="rounded-md border px-3 py-2 text-sm">
                    <div class="flex items-center justify-between gap-2">
                      <span class="truncate">{s.name}</span>
                      <div class="flex shrink-0 gap-1">
                        <Button
                          size="sm"
                          variant={defaultId() === s.id ? 'default' : 'outline'}
                          onClick={() => {
                            setDefaultUserApiId(s.id);
                            setDefaultId(s.id);
                          }}
                        >
                          默认
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => removeUserApiScript(s.id)}>
                          删除
                        </Button>
                      </div>
                    </div>
                    <label class="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={s.enabled}
                        onChange={(e) => setUserApiScriptEnabled(s.id, e.currentTarget.checked)}
                      />
                      启用
                    </label>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </section>
      </div>
    </AudioPanelShell>
  );
};
