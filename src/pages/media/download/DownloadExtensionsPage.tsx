/**
 * Gopeed 扩展管理
 */

import { For, Show, createSignal, onMount } from 'solid-js';
import { Puzzle } from 'lucide-solid';
import { DownloadHubPageShell } from '@/pages/media/download/DownloadHubPageShell';
import {
  AppSwitch,
  AppSwitchControl,
  AppSwitchThumb,
} from '@/components/shared/AppSwitch';
import { AppTextFieldBareInput } from '@/components/shared/AppTextField';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PlusIcon, TrashIcon } from '@/components/shared/icons';
import {
  getExtensionHost,
  type Extension,
} from '@/lib/download';
import { showAppToast } from '@/components/shared/AppToasts';

export function DownloadExtensionsPage() {
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
    <DownloadHubPageShell section="extensions">
      <div class="flex min-h-0 w-full flex-1 flex-col gap-4 pb-4">
        <section class="rounded-2xl border border-border/50 bg-card p-6">
          <h3 class="text-sm font-semibold">从 Git 安装</h3>
          <p class="mt-1 text-xs text-muted-foreground">
            支持 Gopeed 兼容 manifest（onResolve / onStart / onError / onDone）。
          </p>
          <div class="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <AppTextFieldBareInput
              fieldClass="min-w-0 flex-1"
              class="h-10"
              placeholder="https://github.com/…/gopeed-extension-….git"
              value={gitUrl()}
              onInput={(e) => setGitUrl(e.currentTarget.value)}
              onKeyDown={(e: KeyboardEvent & { currentTarget: HTMLInputElement }) => {
                if (e.key === 'Enter') void installGit();
              }}
              aria-label="扩展 Git URL"
            />
            <Button disabled={busy()} onClick={() => void installGit()}>
              <PlusIcon class="size-4" />
              {busy() ? '安装中…' : '安装'}
            </Button>
          </div>
        </section>

        <section class="rounded-2xl border border-border/50 bg-card p-6">
          <h3 class="text-sm font-semibold">已安装扩展</h3>
          <p class="mt-1 text-xs text-muted-foreground">启停与卸载本地扩展</p>

          <Show
            when={extensions().length > 0}
            fallback={
              <div class="mt-6 flex flex-col items-center justify-center gap-3 py-10 text-center">
                <div class="flex size-12 items-center justify-center rounded-2xl border border-border/50 bg-muted/30 text-muted-foreground">
                  <Puzzle class="size-5" />
                </div>
                <div class="space-y-1">
                  <p class="text-sm font-medium">尚未安装扩展</p>
                  <p class="text-xs text-muted-foreground">在上方粘贴仓库地址即可安装</p>
                </div>
              </div>
            }
          >
            <ul class="mt-4 flex flex-col gap-3">
              <For each={extensions()}>
                {(ext) => (
                  <li class="flex items-start justify-between gap-3 rounded-lg border px-3 py-3">
                    <div class="min-w-0 flex-1 space-y-1">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="truncate text-sm font-medium">
                          {ext.title || ext.name || ext.identity}
                        </span>
                        <Badge variant="outline" class="font-normal">
                          v{ext.version || '?'}
                        </Badge>
                        <Show when={ext.disabled}>
                          <Badge variant="secondary">已禁用</Badge>
                        </Show>
                      </div>
                      <div class="truncate text-xs text-muted-foreground">{ext.identity}</div>
                      <Show when={ext.description}>
                        <p class="text-xs text-muted-foreground">{ext.description}</p>
                      </Show>
                      <Show when={(ext.settings?.length ?? 0) > 0}>
                        <div class="mt-2 space-y-2 border-t border-border/40 pt-2">
                          <For each={ext.settings}>
                            {(setting) => (
                              <label class="flex items-center justify-between gap-2 text-xs">
                                <span class="min-w-0 truncate text-muted-foreground">
                                  {setting.title || setting.name}
                                </span>
                                <AppTextFieldBareInput
                                  class="h-8 w-36"
                                  value={String(setting.value ?? '')}
                                  onInput={(e) => {
                                    const value = e.currentTarget.value;
                                    void host
                                      .updateSettings(ext.identity, {
                                        [setting.name]: value,
                                      })
                                      .then(() => refresh())
                                      .catch((err) =>
                                        showAppToast({
                                          title:
                                            err instanceof Error ? err.message : String(err),
                                          variant: 'error',
                                        }),
                                      );
                                  }}
                                  aria-label={setting.title || setting.name}
                                />
                              </label>
                            )}
                          </For>
                        </div>
                      </Show>
                    </div>
                    <div class="flex shrink-0 items-center gap-2">
                      <AppSwitch
                        checked={!ext.disabled}
                        onChange={() => void toggle(ext)}
                        aria-label={ext.disabled ? '启用扩展' : '禁用扩展'}
                      >
                        <AppSwitchControl>
                          <AppSwitchThumb />
                        </AppSwitchControl>
                      </AppSwitch>
                      <Button
                        size="icon"
                        variant="ghost"
                        class="size-8"
                        onClick={() => void remove(ext)}
                        aria-label="删除扩展"
                      >
                        <TrashIcon class="size-4" />
                      </Button>
                    </div>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </section>
      </div>
    </DownloadHubPageShell>
  );
}
