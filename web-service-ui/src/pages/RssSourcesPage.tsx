import { createResource, createSignal, For, Show, onMount } from 'solid-js';
import { Layout, Card, Button, ErrorBox, Loading, Input } from '@/components/Layout';
import {
  deleteRssSources,
  getRssSources,
  saveRssSources,
  type WebRssSource,
} from '@/lib/api';
import { downloadJson, readJsonFile } from '@/lib/download-json';
import { loadRssPushFailedUrls, markRssPushResults } from '@/lib/api-config';
import { showToast } from '@/lib/toast';
import { VirtualSourceList } from '@/components/VirtualSourceList';
import { formatResourceError, resourceError } from '@/lib/resource';

export function RssSourcesPage() {
  const [search, setSearch] = createSignal('');
  const [importOpen, setImportOpen] = createSignal(false);
  const [importText, setImportText] = createSignal('');
  const [actionError, setActionError] = createSignal('');
  const [pushing, setPushing] = createSignal(false);
  const [pushFailedUrls, setPushFailedUrls] = createSignal(loadRssPushFailedUrls());

  onMount(() => setPushFailedUrls(loadRssPushFailedUrls()));

  const [sources, { refetch }] = createResource(getRssSources);

  const filtered = () => {
    const q = search().trim().toLowerCase();
    const list = sources() ?? [];
    if (!q) return list;
    return list.filter(
      (s) =>
        s.sourceName.toLowerCase().includes(q) ||
        s.sourceUrl.toLowerCase().includes(q) ||
        (s.sourceGroup ?? '').toLowerCase().includes(q),
    );
  };

  async function importList(list: unknown[]) {
    await saveRssSources(list);
    setImportOpen(false);
    setImportText('');
    refetch();
  }

  async function handleImport() {
    setActionError('');
    try {
      const parsed = JSON.parse(importText()) as unknown;
      const list = Array.isArray(parsed) ? parsed : [parsed];
      await importList(list);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleFileImport(file: File) {
    setActionError('');
    try {
      const parsed = await readJsonFile(file);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      await importList(list);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handlePush() {
    const list = sources() ?? [];
    if (!list.length || !confirm(`将 ${list.length} 个订阅源推送到 Reader？`)) return;
    setPushing(true);
    setActionError('');
    try {
      const submitted = list.map((s) => s.sourceUrl);
      const saved = await saveRssSources(list);
      const savedUrls = (saved as WebRssSource[]).map((s) => s.sourceUrl);
      const failed = markRssPushResults(submitted, savedUrls);
      setPushFailedUrls(loadRssPushFailedUrls());
      showToast(
        `推送 ${list.length} 条，成功 ${savedUrls.length} 条${failed.size ? '，失败项已标红' : ''}`,
        failed.size ? 'error' : 'success',
      );
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setPushing(false);
    }
  }

  async function handleDelete(s: WebRssSource) {
    if (!confirm(`确定删除订阅源「${s.sourceName}」？`)) return;
    setActionError('');
    try {
      await deleteRssSources([{ sourceUrl: s.sourceUrl }]);
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Layout title="订阅源">
      <Show when={resourceError(sources) || actionError()}>
        <ErrorBox message={String(formatResourceError(resourceError(sources), '') || actionError())} />
      </Show>

      <div class="mb-4 flex flex-wrap gap-2">
        <Input class="max-w-xs flex-1" value={search()} onInput={setSearch} placeholder="搜索订阅源…" />
        <Button href="#/rss/edit">新建</Button>
        <Button variant="secondary" onClick={() => setImportOpen(true)}>导入</Button>
        <label class="cursor-pointer">
          <span class="inline-flex items-center justify-center rounded-lg border border-border bg-transparent px-4 py-2 text-sm hover:bg-accent">打开文件</span>
          <input type="file" accept=".json,.txt" class="hidden" onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) void handleFileImport(f); e.currentTarget.value = ''; }} />
        </label>
        <Button variant="ghost" onClick={() => refetch()}>拉取源</Button>
        <Button variant="ghost" href="#/rss/favorites">收藏</Button>
        <Button variant="ghost" href="#/rss/history">阅读记录</Button>
        <Button variant="ghost" onClick={handlePush} disabled={pushing() || !sources()?.length}>{pushing() ? '推送中…' : '推送源'}</Button>
        <Button variant="ghost" onClick={() => downloadJson(sources() ?? [], 'rss-sources.json')} disabled={!sources()?.length}>导出全部</Button>
      </div>

      <Show when={!sources.loading && !resourceError(sources)} fallback={<Loading />}>
        <Show when={filtered().length} fallback={<Card>暂无订阅源</Card>}>
          <VirtualSourceList
            items={filtered}
            estimateSize={72}
            maxHeight="calc(100vh - 14rem)"
            getKey={(s) => s.sourceUrl}
          >
            {(s) => {
              const failed = pushFailedUrls().has(s.sourceUrl);
              return (
                <Card class={`mb-2 flex flex-wrap items-center justify-between gap-2 py-3 ${failed ? 'web-border-danger' : ''}`}>
                  <div class="min-w-0 flex-1">
                    <p class={`font-medium ${failed ? 'web-text-danger' : ''}`}>{s.sourceName}{s.enabled === false ? ' (已禁用)' : ''}</p>
                    <p class="truncate text-xs text-muted-foreground">{s.sourceUrl}</p>
                  </div>
                  <div class="flex gap-2">
                    <Button variant="ghost" class="px-3! py-1!" href={`#/rss/articles?url=${encodeURIComponent(s.sourceUrl)}`}>阅读</Button>
                    <Button variant="ghost" class="px-3! py-1!" href={`#/rss/edit?url=${encodeURIComponent(s.sourceUrl)}`}>编辑</Button>
                    <Button variant="ghost" class="px-3! py-1!" onClick={() => downloadJson(s, `${s.sourceName || 'rss'}.json`)}>导出</Button>
                    <Button variant="danger" class="px-3! py-1!" onClick={() => handleDelete(s)}>删除</Button>
                  </div>
                </Card>
              );
            }}
          </VirtualSourceList>
        </Show>
      </Show>

      <Show when={importOpen()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card class="w-full max-w-2xl space-y-3">
            <h2 class="text-lg font-semibold">导入订阅源 JSON</h2>
            <textarea
              class="min-h-60 w-full rounded-lg border border-border bg-background p-3 font-mono text-sm"
              aria-label="订阅源 JSON 内容"
              placeholder="粘贴 Legado 订阅源 JSON 数组…"
              value={importText()}
              onInput={(e) => setImportText(e.currentTarget.value)}
            />
            <div class="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setImportOpen(false)}>取消</Button>
              <Button onClick={handleImport}>导入</Button>
            </div>
          </Card>
        </div>
      </Show>
    </Layout>
  );
}
