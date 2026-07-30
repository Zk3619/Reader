/**
 * 新建下载任务
 */

import { For, Show, createSignal } from 'solid-js';
import { PageToolbar } from '@/components/shell/PageToolbar';
import { Button } from '@/components/ui/button';
import { ArrowLeftIcon } from '@/components/shared/icons';
import { cn } from '@/lib/utils';
import {
  mainShellPageHost,
  mainShellTabEnterClass,
  pageToolbarBottomBorder,
} from '@/lib/ui/viewport-classes';
import { settingsStore } from '@/stores/settings';
import { setDownloadSection } from '@/stores/download-hub/section';
import {
  getDownloadService,
  type DownloadEngineKind,
  type ResolveResult,
} from '@/lib/download';
import { showAppToast } from '@/components/shared/AppToasts';

export function DownloadCreatePage() {
  const tabEnterClass = () =>
    mainShellTabEnterClass(settingsStore.state.app.reduceMotion);
  const service = getDownloadService();
  const [url, setUrl] = createSignal('');
  const [engine, setEngine] = createSignal<DownloadEngineKind | 'auto'>('auto');
  const [probing, setProbing] = createSignal(false);
  const [creating, setCreating] = createSignal(false);
  const [resolved, setResolved] = createSignal<ResolveResult | null>(null);
  const [selectedFormat, setSelectedFormat] = createSignal('');

  const formats = () => {
    const meta = resolved()?.meta;
    const list = meta?.formats;
    return Array.isArray(list) ? (list as Array<Record<string, unknown>>) : [];
  };

  const probe = async () => {
    const u = url().trim();
    if (!u) {
      showAppToast({ title: '请输入 URL', variant: 'error' });
      return;
    }
    setProbing(true);
    setResolved(null);
    try {
      const skipYtdlp = engine() === 'gopeed';
      const r = await service.probe(u, { skipYtdlp });
      setResolved(r);
      const fmts = Array.isArray(r.meta?.formats) ? (r.meta!.formats as Array<Record<string, unknown>>) : [];
      if (fmts[0]?.format_id) setSelectedFormat(String(fmts[0].format_id));
    } catch (e) {
      showAppToast({
        title: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    } finally {
      setProbing(false);
    }
  };

  const create = async () => {
    const u = url().trim();
    if (!u) return;
    setCreating(true);
    try {
      const eng = engine();
      const preferred: DownloadEngineKind | undefined = eng === 'auto' ? undefined : eng;
      await service.createTask({
        url: u,
        engine: preferred,
        title: resolved()?.name,
        meta: {
          protocol: resolved()?.protocol,
          formatId: selectedFormat() || undefined,
          ...(resolved()?.meta ?? {}),
        },
        autoStart: true,
      });
      showAppToast({ title: '已加入下载队列', variant: 'success' });
      setDownloadSection('tasks');
    } catch (e) {
      showAppToast({
        title: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div class={cn(mainShellPageHost, tabEnterClass(), 'flex min-h-0 flex-1 flex-col')}>
      <PageToolbar
        class={pageToolbarBottomBorder}
        title="新建下载"
        leading={
          <Button size="sm" variant="ghost" onClick={() => setDownloadSection('tasks')}>
            <ArrowLeftIcon class="size-4" />
            返回
          </Button>
        }
      />

      <div class="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <label class="block space-y-1.5">
          <span class="text-sm font-medium">链接</span>
          <textarea
            class="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="https://… / magnet:?… / ed2k://…"
            value={url()}
            onInput={(e) => setUrl(e.currentTarget.value)}
          />
        </label>

        <div class="flex flex-wrap gap-2 text-sm">
          <span class="text-muted-foreground self-center">引擎</span>
          <For each={(['auto', 'gopeed', 'ytdlp'] as const)}>
            {(id) => (
              <button
                type="button"
                class={cn(
                  'rounded-md border px-2.5 py-1',
                  engine() === id ? 'border-primary bg-accent' : 'border-border',
                )}
                onClick={() => setEngine(id)}
              >
                {id === 'auto' ? '自动' : id === 'gopeed' ? '通用下载' : '媒体提取'}
              </button>
            )}
          </For>
        </div>

        <div class="flex gap-2">
          <Button variant="secondary" disabled={probing()} onClick={() => void probe()}>
            {probing() ? '解析中…' : '解析'}
          </Button>
          <Button disabled={creating()} onClick={() => void create()}>
            {creating() ? '创建中…' : '开始下载'}
          </Button>
        </div>

        <Show when={resolved()}>
          {(r) => (
            <div class="space-y-2 rounded-lg border border-border/60 p-3 text-sm">
              <div>
                <span class="text-muted-foreground">名称：</span>
                {r().name}
              </div>
              <div>
                <span class="text-muted-foreground">协议：</span>
                {r().protocol}
              </div>
              <Show when={r().size > 0}>
                <div>
                  <span class="text-muted-foreground">大小：</span>
                  {r().size}
                </div>
              </Show>
              <Show when={formats().length > 0}>
                <label class="block space-y-1">
                  <span class="text-muted-foreground">格式</span>
                  <select
                    class="w-full rounded-md border border-input bg-background px-2 py-1.5"
                    value={selectedFormat()}
                    onChange={(e) => setSelectedFormat(e.currentTarget.value)}
                  >
                    <For each={formats()}>
                      {(f) => (
                        <option value={String(f.format_id ?? '')}>
                          {String(f.format_id ?? '')} · {String(f.ext ?? '')} ·{' '}
                          {String(f.resolution || f.height || f.abr || '')}
                        </option>
                      )}
                    </For>
                  </select>
                </label>
              </Show>
              <Show when={(r().files?.length ?? 0) > 0}>
                <ul class="max-h-40 overflow-y-auto text-xs text-muted-foreground">
                  <For each={r().files ?? []}>
                    {(f) => (
                      <li>
                        {f.name} ({f.size || '—'})
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </div>
          )}
        </Show>
      </div>
    </div>
  );
}
