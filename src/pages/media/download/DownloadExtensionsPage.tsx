/**
 * Gopeed 扩展管理
 */

import { For, Show, createSignal, onMount } from 'solid-js';
import { PageToolbar } from '@/components/shell/PageToolbar';
import { Button } from '@/components/ui/button';
import { ArrowLeftIcon, PlusIcon, TrashIcon } from '@/components/shared/icons';
import { cn } from '@/lib/utils';
import {
  mainShellPageHost,
  mainShellTabEnterClass,
  pageToolbarBottomBorder,
} from '@/lib/ui/viewport-classes';
import { settingsStore } from '@/stores/settings';
import { setDownloadSection } from '@/stores/download-hub/section';
import {
  getExtensionHost,
  type Extension,
} from '@/lib/download';
import { showAppToast } from '@/components/shared/AppToasts';

export function DownloadExtensionsPage() {
  const tabEnterClass = () =>
    mainShellTabEnterClass(settingsStore.state.app.reduceMotion);
  const host = getExtensionHost();
  const [extensions, setExtensions] = createSignal<Extension[]>([]);
  const [gitUrl, setGitUrl] = createSignal('');
  const [busy, setBusy] = createSignal(false);

  const refresh = () => setExtensions(host.list());

  onMount(() => refresh());

  const installGit = async () => {
    const url = gitUrl().trim();
    if (!url) {
      showAppToast({ title: '请输入扩展 Git URL', variant: 'error' });
      return;
    }
    setBusy(true);
    try {
      await host.installFromGit(url);
      setGitUrl('');
      refresh();
      showAppToast({ title: '扩展已安装', variant: 'success' });
    } catch (e) {
      showAppToast({
        title: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (ext: Extension) => {
    try {
      await host.switch(ext.identity, ext.disabled);
      refresh();
    } catch (e) {
      showAppToast({
        title: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    }
  };

  const remove = async (ext: Extension) => {
    try {
      await host.delete(ext.identity);
      refresh();
    } catch (e) {
      showAppToast({
        title: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    }
  };

  return (
    <div class={cn(mainShellPageHost, tabEnterClass(), 'flex min-h-0 flex-1 flex-col')}>
      <PageToolbar
        class={pageToolbarBottomBorder}
        title="扩展"
        leading={
          <Button size="sm" variant="ghost" onClick={() => setDownloadSection('tasks')}>
            <ArrowLeftIcon class="size-4" />
            返回
          </Button>
        }
      />

      <div class="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div class="flex gap-2">
          <input
            class="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="https://github.com/…/gopeed-extension-….git"
            value={gitUrl()}
            onInput={(e) => setGitUrl(e.currentTarget.value)}
          />
          <Button disabled={busy()} onClick={() => void installGit()}>
            <PlusIcon class="size-4" />
            安装
          </Button>
        </div>

        <Show
          when={extensions().length > 0}
          fallback={
            <p class="py-10 text-center text-sm text-muted-foreground">
              尚未安装扩展。支持 Gopeed 兼容 manifest（onResolve / onStart / onError / onDone）。
            </p>
          }
        >
          <ul class="flex flex-col gap-2">
            <For each={extensions()}>
              {(ext) => (
                <li class="flex items-start justify-between gap-2 rounded-lg border border-border/60 px-3 py-2.5">
                  <div class="min-w-0 flex-1">
                    <div class="truncate text-sm font-medium">
                      {ext.title || ext.name || ext.identity}
                    </div>
                    <div class="text-xs text-muted-foreground">
                      {ext.identity} · v{ext.version || '?'}
                      {ext.disabled ? ' · 已禁用' : ''}
                    </div>
                    <Show when={ext.description}>
                      <p class="mt-1 text-xs text-muted-foreground">{ext.description}</p>
                    </Show>
                  </div>
                  <div class="flex shrink-0 gap-1">
                    <Button size="sm" variant="secondary" onClick={() => void toggle(ext)}>
                      {ext.disabled ? '启用' : '禁用'}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      class="size-8"
                      onClick={() => void remove(ext)}
                    >
                      <TrashIcon class="size-4" />
                    </Button>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>
    </div>
  );
}
