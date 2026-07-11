/** 音源设置 */
import { createSignal, For, onCleanup, onMount, Show, type Component } from 'solid-js';
import { LoaderCircle, Trash2 } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { AppSwitch, AppSwitchControl, AppSwitchThumb } from '@/components/shared/AppSwitch';
import { BUILTIN_SOURCES } from '@/lib/media/audio/online/source-router';
import {
  ensureUserApiScriptsInitialized,
  getDefaultUserApiId,
  importUserApiScript,
  listUserApiScripts,
  removeUserApiScript,
  setUserApiDefaultScript,
  setUserApiScriptEnabled,
  subscribeUserApiScripts,
} from '@/lib/media/audio/online/user-api-engine';
import {
  getMusicOfflineMode,
  setMusicOfflineMode,
} from '@/lib/media/audio/online/user-api-settings';
import {
  isFallbackResolverEnabled,
  setFallbackResolverEnabled,
} from '@/lib/media/audio/platform/fallback-resolver';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import { AudioPanelShell } from '@/components/viewer/audio/music/AudioPanelShell';

export interface AudioSourceSettingsProps {
  open: boolean;
  onClose?: () => void;
  inline?: boolean;
}

export const AudioSourceSettings: Component<AudioSourceSettingsProps> = (props) => {
  const [listRevision, setListRevision] = createSignal(0);
  const userApis = () => {
    listRevision();
    return listUserApiScripts();
  };
  const [defaultId, setDefaultId] = createSignal(getDefaultUserApiId() ?? '');
  const [offline, setOffline] = createSignal(getMusicOfflineMode());
  const [fallback, setFallback] = createSignal(isFallbackResolverEnabled());
  const [importing, setImporting] = createSignal(false);
  const [importError, setImportError] = createSignal<string | null>(null);

  onMount(() => {
    const unsub = subscribeUserApiScripts(() => {
      setListRevision((v) => v + 1);
      setDefaultId(getDefaultUserApiId() ?? '');
    });
    onCleanup(unsub);
    void ensureUserApiScriptsInitialized();
  });

  const importScriptFile = async (file: File) => {
    setImportError(null);
    setImporting(true);
    try {
      const text = await file.text();
      const result = await importUserApiScript({
        script: text,
        fileName: file.name,
      });
      if (!result.ok) {
        setImportError(`${result.name}：${result.error ?? '初始化失败'}`);
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  };

  const canUseScript = (s: ReturnType<typeof listUserApiScripts>[number]) =>
    s.initStatus === 'ready';

  const initStatusIndicator = (
    status: ReturnType<typeof listUserApiScripts>[number]['initStatus'],
  ) => {
    if (status === 'ready') {
      return {
        class: 'bg-green-500 dark:bg-green-400',
        label: '初始化成功',
        pulse: false,
      };
    }
    if (status === 'failed') {
      return {
        class: 'bg-red-500 dark:bg-red-400',
        label: '初始化失败',
        pulse: false,
      };
    }
    return {
      class: 'bg-yellow-500 dark:bg-yellow-400',
      label: '正在初始化',
      pulse: true,
    };
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
            <Checkbox
              checked={offline()}
              onChange={(checked) => {
                setOffline(checked);
                setMusicOfflineMode(checked);
              }}
            />
            离线优先（仅播放已缓存曲目）
          </label>
          <label class="flex items-center gap-2 text-sm">
            <Checkbox
              checked={fallback()}
              onChange={(checked) => {
                setFallback(checked);
                setFallbackResolverEnabled(checked);
              }}
            />
            多源兜底（主源失败时自动换源）
          </label>
        </section>
        <section>
          <h3 class="mb-2 text-sm font-medium">UserApi 自定义源</h3>
          <div class="flex items-center gap-2">
            <input
              type="file"
              accept=".js,.txt,.json"
              class="text-sm"
              disabled={importing()}
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                e.currentTarget.value = '';
                if (file) void importScriptFile(file);
              }}
            />
            <Show when={importing()}>
              <LoaderCircle class="h-4 w-4 animate-spin text-muted-foreground" />
            </Show>
          </div>
          <Show when={importError()}>
            <p class="mt-2 text-xs text-destructive">{importError()}</p>
          </Show>
          <Show
            when={userApis().length > 0}
            fallback={<p class="mt-2 text-sm text-muted-foreground">暂无自定义源</p>}
          >
            <ul class="mt-2 space-y-2">
              <For each={userApis()}>
                {(s) => {
                  const indicator = initStatusIndicator(s.initStatus);
                  return (
                  <li class="rounded-md border px-3 py-2.5 text-sm">
                    <div class="flex items-center gap-3">
                      <div class="min-w-0 flex-1">
                        <p class="flex min-w-0 items-center gap-2 truncate">
                          <span class="truncate font-medium">{s.name}</span>
                          <Show when={s.version}>
                            <span class="shrink-0 text-xs font-normal text-muted-foreground">
                              v{s.version}
                            </span>
                          </Show>
                          <Show
                            when={s.initStatus === 'ready'}
                            fallback={
                              <span
                                class={`size-2 shrink-0 rounded-full shadow-[0_0_0_1px_rgba(0,0,0,0.08)] ${indicator.class} ${
                                  indicator.pulse ? 'animate-pulse' : ''
                                }`}
                                title={indicator.label}
                                aria-label={indicator.label}
                              />
                            }
                          >
                            <AppTooltip>
                              <AppTooltipTrigger
                                as="span"
                                class={`size-2 shrink-0 rounded-full bg-green-500 shadow-[0_0_0_1px_rgba(0,0,0,0.08)] dark:bg-green-400`}
                                aria-hidden
                              />
                              <AppTooltipContent layer="viewer">初始化成功</AppTooltipContent>
                            </AppTooltip>
                          </Show>
                        </p>
                        <Show when={s.initStatus === 'pending'}>
                          <p class="text-xs text-muted-foreground">初始化中…</p>
                        </Show>
                        <Show when={s.initStatus === 'failed' && s.initError}>
                          <p class="truncate text-xs text-destructive">{s.initError}</p>
                        </Show>
                      </div>
                      <div class="flex shrink-0 items-center gap-4">
                        <div
                          class={`flex items-center gap-1.5 whitespace-nowrap text-xs ${
                            canUseScript(s)
                              ? 'text-muted-foreground'
                              : 'text-muted-foreground/50'
                          }`}
                        >
                          <Checkbox
                            id={`user-api-default-${s.id}`}
                            checked={defaultId() === s.id}
                            disabled={!canUseScript(s)}
                            onChange={(checked) => {
                              if (checked) {
                                if (defaultId() === s.id) return;
                                setUserApiDefaultScript(s.id);
                                setDefaultId(s.id);
                                if (!s.enabled) setUserApiScriptEnabled(s.id, true);
                                return;
                              }
                              if (defaultId() === s.id) {
                                setUserApiDefaultScript(null);
                                setDefaultId('');
                              }
                            }}
                          />
                          <label
                            for={`user-api-default-${s.id}`}
                            class={
                              canUseScript(s) ? 'cursor-pointer' : 'cursor-not-allowed'
                            }
                          >
                            默认
                          </label>
                        </div>
                        <AppSwitch
                          checked={s.enabled}
                          disabled={!canUseScript(s) || s.initStatus === 'pending'}
                          onChange={(checked) => setUserApiScriptEnabled(s.id, checked)}
                        >
                          <AppSwitchControl>
                            <AppSwitchThumb />
                          </AppSwitchControl>
                        </AppSwitch>
                        <Button
                          variant="ghost"
                          size="icon"
                          class="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`删除 ${s.name}`}
                          onClick={() => removeUserApiScript(s.id)}
                        >
                          <Trash2 class="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </li>
                  );
                }}
              </For>
            </ul>
          </Show>
        </section>
      </div>
    </AudioPanelShell>
  );
};
