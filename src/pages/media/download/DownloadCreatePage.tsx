/**
 * 新建下载任务
 */

import { For, Show, createSignal } from 'solid-js';
import { DownloadHubPageShell } from '@/pages/media/download/DownloadHubPageShell';
import { formatDownloadBytes } from '@/pages/media/download/download-ui';
import { AppTabs } from '@/components/shared/AppTabs';
import {
  AppSelect,
  AppSelectContent,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import { AppTextFieldBareTextArea } from '@/components/shared/AppTextField';
import { Button } from '@/components/ui/button';
import { setDownloadSection } from '@/stores/download-hub/section';
import {
  getDownloadService,
  type DownloadEngineKind,
  type ResolveResult,
} from '@/lib/download';
import { showAppToast } from '@/components/shared/AppToasts';

type EngineChoice = 'auto' | 'gopeed' | 'ytdlp';

const ENGINE_OPTIONS = ['auto', 'gopeed', 'ytdlp'] as const satisfies readonly EngineChoice[];
const ENGINE_LABELS: Record<EngineChoice, string> = {
  auto: '自动',
  gopeed: '通用下载',
  ytdlp: '媒体提取',
};

const PROTOCOL_LABEL: Record<string, string> = {
  http: 'HTTP',
  bt: 'BitTorrent',
  ed2k: 'ED2K',
  ytdlp: '媒体提取',
};

export function DownloadCreatePage() {
  const service = getDownloadService();
  const [url, setUrl] = createSignal('');
  const [engine, setEngine] = createSignal<EngineChoice>('auto');
  const [probing, setProbing] = createSignal(false);
  const [creating, setCreating] = createSignal(false);
  const [resolved, setResolved] = createSignal<ResolveResult | null>(null);
  const [selectedFormat, setSelectedFormat] = createSignal('');

  const [selectedFiles, setSelectedFiles] = createSignal<number[]>([]);

  const formats = () => {
    const meta = resolved()?.meta;
    const list = meta?.formats;
    return Array.isArray(list) ? (list as Array<Record<string, unknown>>) : [];
  };

  const formatOptions = () =>
    formats().map((f) => String(f.format_id ?? '')).filter(Boolean);

  const formatLabel = (id: string) => {
    const f = formats().find((item) => String(item.format_id ?? '') === id);
    if (!f) return id;
    const needsMerge =
      Array.isArray(f.requested_formats) && (f.requested_formats as unknown[]).length > 1;
    const parts = [
      String(f.format_id ?? ''),
      String(f.ext ?? ''),
      String(f.resolution || f.height || f.abr || ''),
      needsMerge ? '需合并' : '',
    ].filter(Boolean);
    return parts.join(' · ');
  };

  const probe = async () => {
    const u = url().trim();
    if (!u) {
      showAppToast({ title: '请输入 URL', variant: 'error' });
      return;
    }
    setProbing(true);
    setResolved(null);
    setSelectedFiles([]);
    try {
      const skipYtdlp = engine() === 'gopeed';
      const r = await service.probe(u, { skipYtdlp });
      setResolved(r);
      const fmts = Array.isArray(r.meta?.formats)
        ? (r.meta!.formats as Array<Record<string, unknown>>)
        : [];
      const preferredId =
        (typeof r.meta?.formatId === 'string' && r.meta.formatId) ||
        (fmts[0]?.format_id ? String(fmts[0].format_id) : '');
      if (preferredId) setSelectedFormat(preferredId);
      if (r.files?.length) {
        setSelectedFiles(r.files.map((_, i) => i));
      }
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
    if (/^ed2k:\/\//i.test(u)) {
      showAppToast({
        title: 'ED2K 暂不可下载',
        description: '当前仅支持解析元数据，协议传输内核未启用',
        variant: 'error',
      });
      return;
    }
    setCreating(true);
    try {
      const eng = engine();
      const preferred: DownloadEngineKind | undefined = eng === 'auto' ? undefined : eng;
      const r = resolved();
      const fmts = formats();
      const fmtId = selectedFormat();
      const picked = fmtId ? fmts.find((f) => String(f.format_id) === fmtId) : undefined;
      const requestedFormats = picked
        ? Array.isArray(picked.requested_formats) &&
          (picked.requested_formats as unknown[]).length > 0
          ? picked.requested_formats
          : [picked]
        : (r?.meta?.requestedFormats as unknown[] | undefined);

      await service.createTask({
        url: u,
        engine: preferred,
        title: r?.name,
        meta: {
          ...(r?.meta ?? {}),
          protocol: r?.protocol,
          formatId: fmtId || undefined,
          requestedFormats,
          selectFiles: selectedFiles().length ? selectedFiles() : undefined,
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
    <DownloadHubPageShell section="create">
      <div class="flex min-h-0 w-full flex-1 flex-col gap-4 pb-4">
        <section class="rounded-2xl border border-border/50 bg-card p-6">
          <h3 class="text-sm font-semibold">链接与引擎</h3>
          <p class="mt-1 text-xs text-muted-foreground">
            支持 HTTP、磁力链接、种子与常见视频站点；不确定时选「自动」即可。
          </p>

          <div class="mt-4 space-y-1.5">
            <div class="text-sm">下载链接</div>
            <AppTextFieldBareTextArea
              class="min-h-24"
              placeholder="https://… / magnet:?… / ed2k://…"
              value={url()}
              onInput={(e) => setUrl(e.currentTarget.value)}
              aria-label="下载链接"
            />
          </div>

          <div class="mt-4 space-y-2">
            <div class="text-sm">下载引擎</div>
            <AppTabs
              value={engine()}
              onChange={setEngine}
              options={ENGINE_OPTIONS}
              labels={ENGINE_LABELS}
              ariaLabel="下载引擎"
              variant="drawer-inline"
              layout="inline"
            />
          </div>

          <div class="mt-5 flex flex-wrap gap-2">
            <Button variant="secondary" disabled={probing()} onClick={() => void probe()}>
              {probing() ? '解析中…' : '解析'}
            </Button>
            <Button disabled={creating() || !url().trim()} onClick={() => void create()}>
              {creating() ? '创建中…' : '开始下载'}
            </Button>
          </div>
        </section>

        <Show when={resolved()}>
          {(r) => (
            <section class="rounded-2xl border border-border/50 bg-card p-6">
              <h3 class="text-sm font-semibold">解析结果</h3>
              <p class="mt-1 text-xs text-muted-foreground">确认信息后开始下载</p>

              <div class="mt-4 space-y-3">
                <div class="flex items-start justify-between gap-3 rounded-lg border px-3 py-3">
                  <div class="min-w-0">
                    <div class="text-sm">名称</div>
                    <div class="mt-0.5 truncate text-xs text-muted-foreground">{r().name}</div>
                  </div>
                </div>
                <div class="flex items-center justify-between gap-3 rounded-lg border px-3 py-3">
                  <div>
                    <div class="text-sm">协议</div>
                    <div class="text-xs text-muted-foreground">
                      {PROTOCOL_LABEL[r().protocol] ?? r().protocol}
                    </div>
                  </div>
                  <Show when={r().size > 0}>
                    <div class="text-right">
                      <div class="text-sm">大小</div>
                      <div class="text-xs text-muted-foreground">
                        {formatDownloadBytes(r().size)}
                      </div>
                    </div>
                  </Show>
                </div>

                <Show when={formats().length > 0}>
                  <div class="space-y-2 rounded-lg border px-3 py-3">
                    <div class="text-sm">格式</div>
                    <AppSelect
                      value={selectedFormat()}
                      onChange={(value) => value && setSelectedFormat(value)}
                      options={formatOptions()}
                      itemComponent={(itemProps) => (
                        <AppSelectItem item={itemProps.item}>
                          {formatLabel(String(itemProps.item.rawValue))}
                        </AppSelectItem>
                      )}
                    >
                      <AppSelectTrigger layout="form" aria-label="选择格式">
                        <AppSelectValue>
                          {(state) => formatLabel(String(state.selectedOption() ?? ''))}
                        </AppSelectValue>
                        <AppSelectIcon />
                      </AppSelectTrigger>
                      <AppSelectContent>
                        <AppSelectListbox />
                      </AppSelectContent>
                    </AppSelect>
                  </div>
                </Show>

                <Show when={(r().files?.length ?? 0) > 0}>
                  <div class="rounded-lg border px-3 py-3">
                    <div class="text-sm">文件选择</div>
                    <p class="text-xs text-muted-foreground">BT/多文件任务勾选要下载的条目</p>
                    <ul class="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">
                      <For each={r().files ?? []}>
                        {(f, index) => (
                          <li class="flex items-center gap-2 truncate">
                            <input
                              type="checkbox"
                              class="size-3.5 accent-primary"
                              checked={selectedFiles().includes(index())}
                              onChange={(e) => {
                                const i = index();
                                setSelectedFiles((prev) =>
                                  e.currentTarget.checked
                                    ? Array.from(new Set([...prev, i]))
                                    : prev.filter((x) => x !== i),
                                );
                              }}
                            />
                            <span class="min-w-0 truncate">{f.name}</span>
                            <span class="shrink-0 text-muted-foreground">
                              ({f.size ? formatDownloadBytes(f.size) : '—'})
                            </span>
                          </li>
                        )}
                      </For>
                    </ul>
                  </div>
                </Show>
              </div>
            </section>
          )}
        </Show>
      </div>
    </DownloadHubPageShell>
  );
}
