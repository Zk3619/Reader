/**
 * 新建下载任务
 */

import { For, Show, createSignal } from 'solid-js';
import { DownloadHubPageShell } from '@/pages/media/download/DownloadHubPageShell';
import { formatDownloadBytes } from '@/pages/media/download/download-ui';
import { AppTabs } from '@/components/shared/AppTabs';
import { AppTextFieldBareTextArea } from '@/components/shared/AppTextField';
import { Button } from '@/components/ui/button';
import { setDownloadSection } from '@/stores/download-hub/section';
import {
  getDownloadService,
  type DownloadEngineKind,
  type ResolveResult,
} from '@/lib/download';
import { showAppToast } from '@/components/shared/AppToasts';
import { logDownloadError } from '@/lib/download/error-message';
import { DownloadQualityDialog } from '@/components/media/download/DownloadQualityDialog';
import {
  defaultQualityPreset,
  labelForQuality,
  pickFormatsForQuality,
  formatSpecForQuality,
  shouldPromptQualityPick,
  type DownloadQualityPreset,
} from '@/lib/download/download-quality';
import type { Format } from '@/lib/download/ytdlp/types';

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
  const [probedUrl, setProbedUrl] = createSignal('');
  const [selectedFiles, setSelectedFiles] = createSignal<number[]>([]);
  const [qualityOpen, setQualityOpen] = createSignal(false);
  const [qualityPreset, setQualityPreset] = createSignal<DownloadQualityPreset>('best');

  const formats = () => {
    const meta = resolved()?.meta;
    const list = meta?.formats;
    return Array.isArray(list) ? (list as Format[]) : [];
  };

  const formatsOf = (r: ResolveResult | null | undefined): Format[] => {
    const list = r?.meta?.formats;
    return Array.isArray(list) ? (list as Format[]) : [];
  };

  const needsQualityPick = (fmts?: Format[]) => shouldPromptQualityPick(fmts ?? formats());

  const onUrlInput = (value: string) => {
    setUrl(value);
    // 链接变了则作废上次解析，避免带着空 formats 直接入队、跳过选质
    if (probedUrl() && value.trim() !== probedUrl()) {
      setResolved(null);
      setProbedUrl('');
      setSelectedFiles([]);
      setQualityOpen(false);
    }
  };

  /** 解析 URL；成功返回结果，失败返回 null（已 toast） */
  const probe = async (opts?: { clear?: boolean }): Promise<ResolveResult | null> => {
    const u = url().trim();
    if (!u) {
      showAppToast({ title: '请输入 URL', variant: 'error' });
      return null;
    }
    setProbing(true);
    if (opts?.clear !== false) {
      setResolved(null);
      setSelectedFiles([]);
    }
    try {
      const skipYtdlp = engine() === 'gopeed';
      const r = await service.probe(u, { skipYtdlp });
      setResolved(r);
      setProbedUrl(u);
      const fmts = formatsOf(r);
      setQualityPreset(defaultQualityPreset(fmts));
      if (r.files?.length) {
        setSelectedFiles(r.files.map((_, i) => i));
      }
      return r;
    } catch (e) {
      showAppToast({
        title: '解析失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
      return null;
    } finally {
      setProbing(false);
    }
  };

  const enqueue = async (preset: DownloadQualityPreset) => {
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
      const picked = fmts.length > 0 ? pickFormatsForQuality(fmts, preset) : null;
      // 即使本地预选失败，也必须带上 formatSpec / qualityPreset，供 createTask 在最新 formats 上重选
      const formatSpec = picked?.formatSpec || formatSpecForQuality(preset);

      await service.createTask({
        url: u,
        engine: preferred,
        title: r?.name,
        meta: {
          ...(r?.meta ?? {}),
          protocol: r?.protocol,
          formatSpec,
          formatId: picked?.formatId,
          requestedFormats: picked?.requestedFormats,
          qualityPreset: preset,
          qualityKind: picked?.kind,
          selectFiles: selectedFiles().length ? selectedFiles() : undefined,
        },
        autoStart: true,
      });
      setQualityOpen(false);
      showAppToast({ title: '已加入下载队列', variant: 'success' });
      setDownloadSection('tasks');
    } catch (e) {
      const description = logDownloadError('createTask UI', e, { url: u });
      showAppToast({
        title: '无法添加下载任务',
        description,
        variant: 'error',
      });
    } finally {
      setCreating(false);
    }
  };

  const startDownload = async () => {
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

    // 未解析 / 链接已变 / 尚无 formats：先 probe（直接点「开始下载」也要能弹出质量选择）
    let r = resolved();
    let fmts = formatsOf(r);
    const needProbe =
      engine() !== 'gopeed' &&
      (!r || probedUrl() !== u || fmts.length === 0);
    if (needProbe) {
      r = await probe({ clear: true });
      if (!r) return;
      fmts = formatsOf(r);
    }

    // 多于一种质量才弹窗；仅一档时直接按默认下载
    if (engine() !== 'gopeed' && needsQualityPick(fmts)) {
      setQualityOpen(true);
      return;
    }
    void enqueue(qualityPreset());
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
              onInput={(e) => onUrlInput(e.currentTarget.value)}
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
            <Button
              disabled={creating() || probing() || !url().trim()}
              onClick={() => void startDownload()}
            >
              {creating() ? '创建中…' : probing() ? '解析中…' : '开始下载'}
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

                <Show when={needsQualityPick()}>
                  <div class="flex items-center justify-between gap-3 rounded-lg border px-3 py-3">
                    <div class="min-w-0">
                      <div class="text-sm">目标质量</div>
                      <div class="mt-0.5 text-xs text-muted-foreground">
                        {labelForQuality(qualityPreset())}（开始下载时可选）
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={creating()}
                      onClick={() => setQualityOpen(true)}
                    >
                      选择质量
                    </Button>
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

      <DownloadQualityDialog
        open={qualityOpen()}
        onOpenChange={setQualityOpen}
        formats={formats()}
        title={resolved()?.name}
        busy={creating()}
        onConfirm={(preset) => {
          setQualityPreset(preset);
          setQualityOpen(false);
          void enqueue(preset);
        }}
      />
    </DownloadHubPageShell>
  );
}
