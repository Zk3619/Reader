/**
 * 设置页：书源导入黑名单（内置 18+ + 用户自定义）
 */

import { createSignal, For, onMount, Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import { AppTextField, AppTextFieldInput } from '@/components/shared/AppTextField';
import { Checkbox } from '@/components/ui/checkbox';
import { sourceBlocklistStore } from '@/stores/source-blocklist';
import { showAppToast } from '@/components/shared/AppToasts';

export function SourceBlocklistSetting() {
  const [value, setValue] = createSignal('');
  const [label, setLabel] = createSignal('');
  const [loading, setLoading] = createSignal(true);

  onMount(async () => {
    await sourceBlocklistStore.load();
    setLoading(false);
  });

  const handleAdd = async () => {
    const v = value().trim();
    if (!v) {
      showAppToast({ title: '请输入域名或 URL 片段', variant: 'default' });
      return;
    }
    await sourceBlocklistStore.addEntry(v, label().trim() || undefined);
    setValue('');
    setLabel('');
    showAppToast({ title: '已加入黑名单', variant: 'default' });
  };

  return (
    <div class="rounded-2xl border border-border/50 bg-card p-6">
      <div class="mb-4">
        <h3 class="mb-2 font-semibold text-foreground">书源导入黑名单</h3>
        <p class="text-sm text-muted-foreground">
          导入书源时自动跳过匹配的域名或 URL。内置列表包含常见 18+ 站点（与 Legado 一致），下方可添加或删除自定义项。
        </p>
      </div>

      <div class="mb-4 flex flex-wrap items-end gap-2">
        <AppTextField class="min-w-40 flex-1">
          <AppTextFieldInput
            placeholder="域名 example.com 或 URL 片段"
            value={value()}
            onInput={(e: Event) => setValue((e.currentTarget as HTMLInputElement).value)}
          />
        </AppTextField>
        <AppTextField class="min-w-32 flex-1">
          <AppTextFieldInput
            placeholder="备注（可选）"
            value={label()}
            onInput={(e: Event) => setLabel((e.currentTarget as HTMLInputElement).value)}
          />
        </AppTextField>
        <Button onClick={() => void handleAdd()} disabled={loading()}>
          添加
        </Button>
      </div>

      <Show
        when={!loading()}
        fallback={<p class="text-sm text-muted-foreground">加载中…</p>}
      >
        <Show
          when={sourceBlocklistStore.state.userEntries.length > 0}
          fallback={<p class="text-sm text-muted-foreground">暂无自定义黑名单项</p>}
        >
          <ul class="space-y-2">
            <For each={sourceBlocklistStore.state.userEntries}>
              {(entry) => (
                <li class="flex items-center justify-between gap-2 rounded-lg border border-border/50 px-3 py-2 text-sm">
                  <div class="min-w-0 flex-1">
                    <div class="font-medium truncate">{entry.value}</div>
                    <Show when={entry.label}>
                      <div class="text-xs text-muted-foreground">{entry.label}</div>
                    </Show>
                  </div>
                  <label
                    class="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs"
                    onClick={(e) => {
                      e.preventDefault();
                      void sourceBlocklistStore.setEntryEnabled(entry.id, !entry.enabled);
                    }}
                  >
                    <Checkbox checked={entry.enabled} class="pointer-events-none" />
                    启用
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="shrink-0 text-destructive"
                    onClick={() => void sourceBlocklistStore.removeEntry(entry.id)}
                  >
                    删除
                  </Button>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </div>
  );
}
