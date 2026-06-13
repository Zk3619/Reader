import { createSignal, createResource, For, Show, onMount } from 'solid-js';
import { Layout, Card, Button, ErrorBox, Loading, Input } from '@/components/Layout';
import {
  deleteBookSources,
  getBookSources,
  saveBookSources,
  sourceNameOf,
  sourceUrlOf,
  type WebBookSource,
} from '@/lib/api';
import { downloadJson, readJsonFile } from '@/lib/download-json';
import { loadPushFailedUrls, markPushResults } from '@/lib/api-config';
import { showToast } from '@/lib/toast';
import { VirtualSourceList } from '@/components/VirtualSourceList';
import { formatResourceError, resourceError } from '@/lib/resource';

export function SourcesPage() {
  const [search, setSearch] = createSignal('');
  const [importOpen, setImportOpen] = createSignal(false);
  const [importText, setImportText] = createSignal('');
  const [actionError, setActionError] = createSignal('');
  const [pushing, setPushing] = createSignal(false);
  const [selected, setSelected] = createSignal<Set<string>>(new Set());
  const [pushFailedUrls, setPushFailedUrls] = createSignal(loadPushFailedUrls());

  onMount(() => setPushFailedUrls(loadPushFailedUrls()));

  const [sources, { refetch }] = createResource(getBookSources);

  const filtered = () => {
    const q = search().trim().toLowerCase();
    const list = sources() ?? [];
    if (!q) return list;
    return list.filter(
      (s) =>
        sourceNameOf(s).toLowerCase().includes(q) ||
        sourceUrlOf(s).toLowerCase().includes(q) ||
        (s.bookSourceGroup ?? s.sourceGroup ?? '').toLowerCase().includes(q),
    );
  };

  function toggleSelect(url: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }

  function toggleSelectAll() {
    const urls = filtered().map((s) => sourceUrlOf(s));
    setSelected((prev) => (prev.size === urls.length ? new Set<string>() : new Set<string>(urls)));
  }

  async function handleDelete(s: WebBookSource) {
    const url = sourceUrlOf(s);
    const name = sourceNameOf(s);
    if (!confirm(`确定删除书源「${name}」？`)) return;
    setActionError('');
    try {
      await deleteBookSources([{ bookSourceUrl: url, sourceUrl: url }]);
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleBatchDelete() {
    const urls = [...selected()];
    if (!urls.length) return;
    if (!confirm(`确定删除选中的 ${urls.length} 个书源？`)) return;
    setActionError('');
    try {
      await deleteBookSources(urls.map((url) => ({ bookSourceUrl: url, sourceUrl: url })));
      setSelected(new Set<string>());
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleImportList(list: unknown[]) {
    await saveBookSources(list);
    setImportOpen(false);
    setImportText('');
    refetch();
  }

  async function handleImport() {
    setActionError('');
    try {
      const parsed = JSON.parse(importText()) as unknown;
      const list = Array.isArray(parsed) ? parsed : [parsed];
      await handleImportList(list);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleFileImport(file: File) {
    setActionError('');
    try {
      const parsed = await readJsonFile(file);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      await handleImportList(list);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handlePush() {
    const list = sources() ?? [];
    if (!list.length) return;
    if (!confirm(`将 ${list.length} 个书源推送到 Reader？`)) return;
    setPushing(true);
    setActionError('');
    try {
      const submitted = list.map((s) => sourceUrlOf(s));
      const saved = await saveBookSources(list);
      const savedUrls = (saved as WebBookSource[]).map((s) => sourceUrlOf(s));
      const failed = markPushResults(submitted, savedUrls);
      setPushFailedUrls(loadPushFailedUrls());
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

  function exportSources(list: WebBookSource[], filename: string) {
    downloadJson(list, filename);
  }

  function exportOne(s: WebBookSource) {
    const name = sourceNameOf(s) || 'book-source';
    exportSources([s], `${name}.json`);
  }

  return (
    <Layout title="书源管理">
      <Show when={resourceError(sources) || actionError()}>
        <ErrorBox message={String(formatResourceError(resourceError(sources), '') || actionError())} />
      </Show>

      <div class="mb-4 flex flex-wrap gap-2">
        <Input class="max-w-xs flex-1" value={search()} onInput={setSearch} placeholder="搜索书源…" />
        <Button href="#/sources/edit">新建</Button>
        <Button variant="secondary" onClick={() => setImportOpen(true)}>导入</Button>
        <label class="cursor-pointer">
          <span class="inline-flex items-center justify-center rounded-lg border border-border bg-transparent px-4 py-2 text-sm hover:bg-accent">
            打开文件
          </span>
          <input
            type="file"
            accept=".json,.txt"
            class="hidden"
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              if (f) void handleFileImport(f);
              e.currentTarget.value = '';
            }}
          />
        </label>
        <Button variant="ghost" onClick={() => refetch()}>拉取源</Button>
        <Button variant="ghost" onClick={handlePush} disabled={pushing() || !sources()?.length}>
          {pushing() ? '推送中…' : '推送源'}
        </Button>
        <Button variant="ghost" onClick={() => exportSources(sources() ?? [], 'book-sources.json')} disabled={!sources()?.length}>
          导出全部
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            const list = filtered().filter((s) => selected().has(sourceUrlOf(s)));
            if (list.length) exportSources(list, 'book-sources-selected.json');
          }}
          disabled={!selected().size}
        >
          导出选中
        </Button>
        <Button variant="danger" onClick={handleBatchDelete} disabled={!selected().size}>
          删除选中
        </Button>
      </div>

      <Show when={!sources.loading && !resourceError(sources)} fallback={<Loading />}>
        <Show when={filtered()?.length} fallback={<Card>暂无书源</Card>}>
          <div class="mb-2">
            <label class="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={selected().size === filtered().length && filtered().length > 0} onChange={toggleSelectAll} />
              全选当前列表
            </label>
          </div>
          <VirtualSourceList
            items={filtered}
            estimateSize={96}
            maxHeight="calc(100vh - 16rem)"
            getKey={(s) => sourceUrlOf(s)}
          >
            {(s) => {
              const url = sourceUrlOf(s);
              const name = sourceNameOf(s);
              const failed = pushFailedUrls().has(url);
              return (
                <Card class={`mb-2 flex flex-wrap items-center justify-between gap-2 py-3 ${failed ? 'web-border-danger' : ''}`}>
                  <label class="flex min-w-0 flex-1 cursor-pointer items-start gap-2">
                    <input type="checkbox" class="mt-1" checked={selected().has(url)} onChange={() => toggleSelect(url)} />
                    <div class="min-w-0">
                      <p class={`font-medium ${failed ? 'web-text-danger' : ''}`}>{name}</p>
                      <p class="truncate text-xs text-muted-foreground">{url}</p>
                      <Show when={s.bookSourceGroup ?? s.sourceGroup}>
                        <p class="text-xs text-muted-foreground">分组：{s.bookSourceGroup ?? s.sourceGroup}</p>
                      </Show>
                    </div>
                  </label>
                  <div class="flex flex-wrap items-center gap-2">
                    <span class={`rounded-full px-2 py-0.5 text-xs ${s.enabled !== false ? 'web-badge-success' : 'bg-muted text-muted-foreground'}`}>
                      {s.enabled !== false ? '启用' : '禁用'}
                    </span>
                    <Button href={`#/sources/edit?url=${encodeURIComponent(url)}`} variant="ghost" class="px-3! py-1!">编辑</Button>
                    <Button variant="ghost" class="px-3! py-1!" onClick={() => exportOne(s)}>导出</Button>
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
            <h2 class="text-lg font-semibold">导入书源 JSON</h2>
            <textarea
              class="min-h-60 w-full rounded-lg border border-border bg-background p-3 font-mono text-sm"
              aria-label="书源 JSON 内容"
              value={importText()}
              placeholder="粘贴 Legado 书源 JSON 数组…"
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
