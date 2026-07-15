/** 音源设置（对齐 lx：单一活跃 UserApi + 在线导入） */
import { createSignal, For, onCleanup, onMount, Show, type Component } from 'solid-js';
import { LoaderCircle, Trash2 } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { AppSwitch, AppSwitchControl, AppSwitchThumb } from '@/components/shared/AppSwitch';
import {
  getDefaultUserApiId,
  importUserApiScript,
  listUserApiScripts,
  removeUserApiScript,
  setUserApiDefaultScript,
  setUserApiScriptEnabled,
  setUserApiAllowShowUpdateAlert,
  subscribeUserApiScripts,
  ensureUserApiScriptsInitialized,
} from '@/lib/media/audio/online/user-api-engine';
import {
  getUserApiInitMode,
  setUserApiInitMode,
  type UserApiInitMode,
} from '@/lib/media/audio/online/user-api-update-prefs';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import {
  AppManualRadioGroup,
  AppManualRadioOption,
} from '@/components/shared/AppManualRadio';
import { AudioPanelShell } from '@/components/viewer/audio/music/AudioPanelShell';
import { request } from '@/lib/http';
import { MusicAppSelect } from '@/components/viewer/audio/music/MusicAppSelect';

export interface AudioSourceSettingsProps {
  open: boolean;
  onClose?: () => void;
  inline?: boolean;
}

/** 统一展示为 v1.2.0；脚本 @version 已带 v/V 时不再重复前缀 */
function formatUserApiVersionLabel(version: string): string {
  const raw = version.trim();
  if (!raw) return '';
  return `v${raw.replace(/^v+/i, '')}`;
}

export const AudioSourceSettings: Component<AudioSourceSettingsProps> = (props) => {
  const [listRevision, setListRevision] = createSignal(0);
  const userApis = () => {
    listRevision();
    // 仅展示就绪/初始化中；失败源已移除或过滤
    return listUserApiScripts().filter((s) => s.initStatus !== 'failed');
  };
  const [defaultId, setDefaultId] = createSignal(getDefaultUserApiId() ?? '');
  const [initMode, setInitMode] = createSignal<UserApiInitMode>(getUserApiInitMode());
  const [importing, setImporting] = createSignal(false);
  const [importError, setImportError] = createSignal<string | null>(null);
  const [importUrl, setImportUrl] = createSignal('');

  onMount(() => {
    const unsub = subscribeUserApiScripts(() => {
      setListRevision((v) => v + 1);
      setDefaultId(getDefaultUserApiId() ?? '');
    });
    onCleanup(() => {
      unsub();
    });
    // 启动预热由 MusicHubShell 按策略执行；此处仅订阅列表，避免重复 warm 干扰策略
  });

  const importScriptText = async (text: string, fileName?: string) => {
    setImportError(null);
    setImporting(true);
    try {
      // 初始化失败由 UserApiInitFailedHost 弹窗，且不会进列表
      await importUserApiScript({
        script: text,
        fileName: fileName ?? 'online.js',
      });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  };

  const importScriptFile = async (file: File) => {
    const text = await file.text();
    await importScriptText(text, file.name);
  };

  const importScriptFromUrl = async () => {
    const url = importUrl().trim();
    if (!url) {
      setImportError('请粘贴脚本 raw URL');
      return;
    }
    setImportError(null);
    setImporting(true);
    try {
      const res = await request(url, {
        method: 'GET',
        allowNon2xx: true,
        useBackendHttp: true,
        ignorePageNavigationAbort: true,
      });
      if (res.status >= 400) {
        throw new Error(`下载失败 HTTP ${res.status}`);
      }
      const text = await res.text();
      if (!text.trim()) throw new Error('脚本内容为空');
      const nameGuess = url.split('/').pop()?.split('?')[0] || 'online.js';
      await importScriptText(text, nameGuess);
      setImportUrl('');
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
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
        class: 'bg-success-foreground',
        label: '初始化成功',
        pulse: false,
      };
    }
    if (status === 'failed') {
      return {
        class: 'bg-destructive',
        label: '初始化失败',
        pulse: false,
      };
    }
    return {
      class: 'bg-warning-foreground',
      label: '正在初始化',
      pulse: true,
    };
  };

  const setActive = (id: string) => {
    setUserApiDefaultScript(id);
    setDefaultId(id);
  };

  return (
    <AudioPanelShell
      open={props.open}
      inline={props.inline}
      title="自定义源管理"
      hideHeader={props.inline}
      onClose={props.onClose}
    >
      <div class={props.inline ? 'space-y-4 pt-2' : 'space-y-4 p-4'}>
        <section>
          <h3 class="mb-1 text-sm font-medium">自定义源管理</h3>
          <p class="mb-2 text-xs text-muted-foreground">
            点选一项作为当前自定义源。版本与初始化状态跟随源名称显示；Reader
            额外允许启用多个源参与取链，当前源仍具有最高优先级。
          </p>
          <div class="mb-3 space-y-1">
            <div class="flex flex-wrap items-center gap-2 text-sm">
              <span class="text-muted-foreground">启动初始化：</span>
              <MusicAppSelect
                value={initMode()}
                onChange={(v) => {
                  const mode = v as UserApiInitMode;
                  setInitMode(mode);
                  setUserApiInitMode(mode);
                  void ensureUserApiScriptsInitialized({
                    mode,
                    forceUpdateCheck: true,
                  });
                }}
                options={['activeOnly', 'allEnabled']}
                optionLabel={(v) =>
                  v === 'activeOnly' ? '仅当前自定义源' : '全部已启用源'
                }
                triggerClass="w-44"
                aria-label="音源初始化策略"
              />
            </div>
            <p class="text-xs text-muted-foreground">
              「仅当前自定义源」最接近 LX Music 一次只加载当前源的行为；未启用的源不会初始化。
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <input
              type="file"
              accept=".js,.txt,.json"
              title="从本地导入自定义源"
              aria-label="从本地导入自定义源"
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
          <div class="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="url"
              class="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
              placeholder="在线导入：粘贴 raw.js URL"
              value={importUrl()}
              disabled={importing()}
              onInput={(e) => setImportUrl(e.currentTarget.value)}
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={importing()}
              onClick={() => void importScriptFromUrl()}
            >
              导入 URL
            </Button>
          </div>
          <Show when={importError()}>
            <p class="mt-2 text-xs text-destructive">{importError()}</p>
          </Show>
          <Show
            when={userApis().length > 0}
            fallback={<p class="mt-2 text-sm text-muted-foreground">暂无自定义源</p>}
          >
            <AppManualRadioGroup class="mt-2 space-y-2" aria-label="当前自定义源">
              <For each={userApis()}>
                {(s) => {
                  const indicator = initStatusIndicator(s.initStatus);
                  const isActive = () => defaultId() === s.id;
                  const showInitStatus = () =>
                    s.enabled && (initMode() === 'allEnabled' || isActive());
                  return (
                    <div
                      class={`group flex items-stretch rounded-md border text-sm transition-colors ${
                        isActive()
                          ? 'border-primary/60 bg-primary/5 hover:bg-primary/10'
                          : 'hover:bg-accent/50'
                      }`}
                    >
                      <AppManualRadioOption
                        selected={isActive()}
                        disabled={!canUseScript(s)}
                        onSelect={() => setActive(s.id)}
                        class="min-h-0 flex-1 rounded-md border-0 px-3 py-2.5 hover:bg-transparent"
                      >
                        <div class="min-w-0 flex-1">
                          <p class="flex min-w-0 items-center gap-2 truncate">
                            <span class="truncate font-medium">{s.name}</span>
                            <Show when={s.version}>
                              <span class="shrink-0 text-xs font-normal text-muted-foreground">
                                {formatUserApiVersionLabel(s.version!)}
                              </span>
                            </Show>
                            <Show when={isActive()}>
                              <span class="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
                                当前
                              </span>
                            </Show>
                            <Show when={showInitStatus()}>
                              <AppTooltip>
                                <AppTooltipTrigger
                                  as="span"
                                  class={`size-2 shrink-0 rounded-full shadow-[0_0_0_1px_rgba(0,0,0,0.08)] ${indicator.class} ${
                                    indicator.pulse ? 'animate-pulse' : ''
                                  }`}
                                  aria-label={indicator.label}
                                />
                                <AppTooltipContent layer="viewer">{indicator.label}</AppTooltipContent>
                              </AppTooltip>
                            </Show>
                          </p>
                          <Show when={showInitStatus() && s.initStatus === 'pending'}>
                            <p class="text-xs text-muted-foreground">初始化中…</p>
                          </Show>
                          <Show when={showInitStatus() && s.initStatus === 'failed' && s.initError}>
                            <p class="truncate text-xs text-destructive">{s.initError}</p>
                          </Show>
                        </div>
                      </AppManualRadioOption>
                      <div class="flex shrink-0 flex-col items-end gap-1.5 py-2 pr-3">
                        <label class="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <Checkbox
                            checked={s.allowShowUpdateAlert !== false}
                            onChange={(checked) =>
                              setUserApiAllowShowUpdateAlert(s.id, checked)
                            }
                          />
                          更新提示
                        </label>
                        <div class="flex items-center gap-3">
                        <AppSwitch
                          checked={s.enabled}
                          disabled={s.initStatus === 'pending'}
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
                    </div>
                  );
                }}
              </For>
            </AppManualRadioGroup>
          </Show>
        </section>
      </div>
    </AudioPanelShell>
  );
};
