/**
 * 主程序设置：跨模块媒体播放互斥 / 音频焦点调度
 */

import { For, Show, createMemo, createSignal } from 'solid-js';
import {
  AppManualRadioGroup,
  AppManualRadioOption,
} from '@/components/shared/AppManualRadio';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  AppSelect,
  AppSelectContent,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import {
  DEFAULT_MEDIA_FOCUS_DUCK_GAIN,
  DEFAULT_MEDIA_FOCUS_MODE,
  DEFAULT_MEDIA_FOCUS_POLICY,
  MEDIA_FOCUS_ACTIONS,
  MEDIA_FOCUS_ACTION_LABELS,
  MEDIA_FOCUS_OWNERS,
  MEDIA_FOCUS_OWNER_LABELS,
  MEDIA_FOCUS_DUCK_GAIN_MAX,
  MEDIA_FOCUS_DUCK_GAIN_MIN,
  resolveMediaFocusAction,
  type MediaFocusAction,
  type MediaFocusMode,
  type MediaFocusOwner,
  type MediaFocusPolicyOverrides,
} from '@/lib/media/media-focus-config';
import { settingsState, settingsStore } from '@/stores/settings';
import { cn } from '@/lib/utils';

const MODE_OPTIONS: {
  value: MediaFocusMode;
  label: string;
  description: string;
}[] = [
  {
    value: 'pauseAll',
    label: '直接暂停其它全部',
    description: '任一媒体起播时暂停其它已注册播放器；结束后按栈恢复。行为简单可预测。',
  },
  {
    value: 'smart',
    label: '智能调度（焦点 + 闪避）',
    description: '按策略表决定暂停、闪避或忽略；例如朗读时降低音乐音量而非硬停。',
  },
];

export function MediaFocusSetting() {
  const mode = () =>
    settingsState.app.mediaFocusMode === 'pauseAll' ||
    settingsState.app.mediaFocusMode === 'smart'
      ? settingsState.app.mediaFocusMode
      : DEFAULT_MEDIA_FOCUS_MODE;
  const duckGain = () =>
    typeof settingsState.app.mediaFocusDuckGain === 'number'
      ? settingsState.app.mediaFocusDuckGain
      : DEFAULT_MEDIA_FOCUS_DUCK_GAIN;
  const overrides = () => settingsState.app.mediaFocusPolicyOverrides ?? {};

  const [advancedOpen, setAdvancedOpen] = createSignal(false);

  const policyCell = createMemo(() => {
    const ov = overrides();
    return (requester: MediaFocusOwner, target: MediaFocusOwner): MediaFocusAction =>
      resolveMediaFocusAction(requester, target, ov);
  });

  const setPolicyCell = (
    requester: MediaFocusOwner,
    target: MediaFocusOwner,
    action: MediaFocusAction,
  ) => {
    const next: MediaFocusPolicyOverrides = { ...overrides() };
    const defaultAction = DEFAULT_MEDIA_FOCUS_POLICY[requester]?.[target] ?? 'PAUSE';
    const row = { ...(next[requester] ?? {}) };
    if (action === defaultAction) {
      delete row[target];
    } else {
      row[target] = action;
    }
    if (Object.keys(row).length === 0) delete next[requester];
    else next[requester] = row;
    void settingsStore.setMediaFocusPolicyOverrides(next);
  };

  const resetPolicy = () => {
    void settingsStore.setMediaFocusPolicyOverrides({});
  };

  return (
    <div class="rounded-2xl border border-border/50 bg-card p-6">
      <div class="mb-3 space-y-1">
        <h3 class="font-semibold text-foreground">媒体播放互斥</h3>
        <p class="text-sm text-muted-foreground">
          控制音乐、听书、朗读、视频与影视之间的音频焦点。修改后立即生效，无需重启。
        </p>
      </div>

      <AppManualRadioGroup class="flex flex-col gap-2">
        <For each={MODE_OPTIONS}>
          {(option) => (
            <AppManualRadioOption
              selected={mode() === option.value}
              onSelect={() => void settingsStore.setMediaFocusMode(option.value)}
              class={cn(
                'h-max items-start gap-3 rounded-lg border border-border/40 px-3 py-2.5',
                mode() === option.value ? 'bg-muted/30' : 'bg-transparent',
              )}
            >
              <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                <span class="text-sm font-medium text-foreground">{option.label}</span>
                <span class="text-xs text-muted-foreground">{option.description}</span>
              </div>
            </AppManualRadioOption>
          )}
        </For>
      </AppManualRadioGroup>

      <Show when={mode() === 'smart'}>
        <div class="mt-4 space-y-3 border-t border-border/40 pt-4">
          <div class="space-y-1.5">
            <Label for="media-focus-duck-gain" class="text-sm font-medium">
              闪避音量（{duckGain().toFixed(2)}）
            </Label>
            <p class="text-xs text-muted-foreground">
              被闪避媒体的相对音量（默认 {DEFAULT_MEDIA_FOCUS_DUCK_GAIN}）。不影响用户音量设置。
            </p>
            <input
              id="media-focus-duck-gain"
              type="range"
              class="w-full accent-primary"
              min={MEDIA_FOCUS_DUCK_GAIN_MIN}
              max={MEDIA_FOCUS_DUCK_GAIN_MAX}
              step={0.05}
              value={duckGain()}
              onInput={(e) => {
                void settingsStore.setMediaFocusDuckGain(Number(e.currentTarget.value));
              }}
            />
          </div>

          <div class="space-y-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAdvancedOpen((v) => !v)}
            >
              {advancedOpen() ? '收起高级策略' : '高级：按类型覆盖策略'}
            </Button>

            <Show when={advancedOpen()}>
              <div class="space-y-3 rounded-lg border border-border/40 bg-muted/20 p-3">
                <div class="flex items-center justify-between gap-2">
                  <p class="text-xs text-muted-foreground">
                    行 = 请求焦点方，列 = 被影响方。留空等价于默认矩阵。
                  </p>
                  <Button type="button" variant="ghost" size="sm" onClick={resetPolicy}>
                    恢复默认
                  </Button>
                </div>
                <div class="overflow-x-auto">
                  <table class="w-full min-w-xl border-collapse text-xs">
                    <thead>
                      <tr>
                        <th class="p-1.5 text-left font-medium text-muted-foreground">请求方 \\ 目标</th>
                        <For each={[...MEDIA_FOCUS_OWNERS]}>
                          {(target) => (
                            <th class="p-1.5 text-left font-medium text-muted-foreground">
                              {MEDIA_FOCUS_OWNER_LABELS[target]}
                            </th>
                          )}
                        </For>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={[...MEDIA_FOCUS_OWNERS]}>
                        {(requester) => (
                          <tr class="border-t border-border/30">
                            <td class="p-1.5 font-medium text-foreground">
                              {MEDIA_FOCUS_OWNER_LABELS[requester]}
                            </td>
                            <For each={[...MEDIA_FOCUS_OWNERS]}>
                              {(target) => (
                                <td class="p-1">
                                  <Show
                                    when={requester !== target}
                                    fallback={
                                      <span class="px-2 text-muted-foreground">—</span>
                                    }
                                  >
                                    <AppSelect
                                      options={[...MEDIA_FOCUS_ACTIONS]}
                                      value={policyCell()(requester, target)}
                                      onChange={(v) => {
                                        if (v) setPolicyCell(requester, target, v as MediaFocusAction);
                                      }}
                                      itemComponent={(itemProps) => (
                                        <AppSelectItem item={itemProps.item}>
                                          {
                                            MEDIA_FOCUS_ACTION_LABELS[
                                              itemProps.item.rawValue as MediaFocusAction
                                            ]
                                          }
                                        </AppSelectItem>
                                      )}
                                    >
                                      <AppSelectTrigger
                                        layout="form"
                                        class="h-8 min-w-18 px-2 text-xs"
                                        aria-label={`${MEDIA_FOCUS_OWNER_LABELS[requester]} → ${MEDIA_FOCUS_OWNER_LABELS[target]}`}
                                      >
                                        <AppSelectValue<string>>
                                          {(state) =>
                                            MEDIA_FOCUS_ACTION_LABELS[
                                              (state.selectedOption() as MediaFocusAction) ??
                                                policyCell()(requester, target)
                                            ]
                                          }
                                        </AppSelectValue>
                                        <AppSelectIcon />
                                      </AppSelectTrigger>
                                      <AppSelectContent>
                                        <AppSelectListbox />
                                      </AppSelectContent>
                                    </AppSelect>
                                  </Show>
                                </td>
                              )}
                            </For>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}
