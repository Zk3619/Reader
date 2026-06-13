import { createMemo, createResource, createSignal, For, Show, onCleanup, onMount } from 'solid-js';
import {
  Layout,
  Button,
  ErrorBox,
  Loading,
  Input,
  TextArea,
  Label,
} from '@/components/Layout';
import { SourceFieldForm } from '@/components/SourceFieldForm';
import { SourceHelpPanel } from '@/components/SourceHelpPanel';
import { SourceQrModal } from '@/components/SourceQrModal';
import { VirtualSourceList } from '@/components/VirtualSourceList';
import { SourceHotkeysDialog } from '@/components/SourceHotkeysDialog';
import {
  SourceEditorLayout,
  SourceEditorToolBtn,
  type SourceEditorRightTab,
} from '@/components/SourceEditorLayout';
import { RSS_SOURCE_EDIT_SECTIONS } from '@/lib/rss-source-edit-config';
import type { RssSourceEditField } from '@/lib/rss-source-edit-config';
import {
  apiRssSourceToEdit,
  cloneRssEdit,
  createEmptyRssEditSource,
  getRssEditFieldValue,
  parseRssEditFromText,
  rssEditSnapshot,
  serializeRssEditSource,
  setRssEditFieldValue,
  type RssEditSource,
} from '@/lib/legado-rss-source-edit';
import {
  debugRssSource,
  getRssSource,
  getRssSources,
  runRssSourceDebugWs,
  saveRssSource,
  saveRssSources,
  type BookSourceDebugLogEntry,
  type WebRssSource,
} from '@/lib/api';
import { loadRssPushFailedUrls, markRssPushResults } from '@/lib/api-config';
import { downloadJson } from '@/lib/download-json';
import { showToast } from '@/lib/toast';
import { formatResourceError, resourceError } from '@/lib/resource';
import {
  loadSourceHotkeys,
  matchHotkey,
  saveSourceHotkeys,
  type SourceHotkeyAction,
} from '@/lib/source-hotkeys';

function parseEditRoute() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [, qs = ''] = hash.split('?');
  const params = new URLSearchParams(qs);
  return { url: params.get('url') ?? '' };
}

function logClass(state: number): string {
  if (state < 0) return 'web-text-danger';
  if (state >= 1000) return 'web-text-success';
  return 'text-foreground';
}

export function RssSourceEditPage() {
  const route = parseEditRoute();
  const isNew = () => !route.url;
  const [draft, setDraft] = createSignal<RssEditSource>(createEmptyRssEditSource());
  const [baseline, setBaseline] = createSignal('');
  const [activeTab, setActiveTab] = createSignal(RSS_SOURCE_EDIT_SECTIONS[0].key);
  const [rightTab, setRightTab] = createSignal<SourceEditorRightTab>('json');
  const [jsonText, setJsonText] = createSignal('');
  const [saving, setSaving] = createSignal(false);
  const [saveError, setSaveError] = createSignal('');
  const [debugKey, setDebugKey] = createSignal('');
  const [debugLogs, setDebugLogs] = createSignal<BookSourceDebugLogEntry[]>([]);
  const [debugRunning, setDebugRunning] = createSignal(false);
  const [debugError, setDebugError] = createSignal('');
  const [snapshots, setSnapshots] = createSignal<Record<string, string>>({});
  const [qrOpen, setQrOpen] = createSignal(false);
  const [debugMode, setDebugMode] = createSignal<'ws' | 'rest'>('ws');
  const [past, setPast] = createSignal<string[]>([]);
  const [future, setFuture] = createSignal<string[]>([]);
  const [sourceListFilter, setSourceListFilter] = createSignal('');
  const [pushFailedUrls, setPushFailedUrls] = createSignal(loadRssPushFailedUrls());
  const [pushing, setPushing] = createSignal(false);
  const [hotkeysOpen, setHotkeysOpen] = createSignal(false);
  const [hotkeyActions, setHotkeyActions] = createSignal<SourceHotkeyAction[]>(loadSourceHotkeys());
  const MAX_HISTORY = 40;
  let debugWs: WebSocket | null = null;

  const canUndo = () => past().length > 0;
  const canRedo = () => future().length > 0;

  function pushHistory(before: RssEditSource) {
    setPast((p) => [...p.slice(-MAX_HISTORY), rssEditSnapshot(before)]);
    setFuture([]);
  }

  function undo() {
    const stack = past();
    if (!stack.length) return;
    const prev = stack[stack.length - 1];
    setPast(stack.slice(0, -1));
    setFuture((f) => [rssEditSnapshot(draft()), ...f]);
    setDraft(JSON.parse(prev) as RssEditSource);
    setJsonText(serializeRssEditSource(JSON.parse(prev) as RssEditSource));
  }

  function redo() {
    const stack = future();
    if (!stack.length) return;
    const next = stack[0];
    setFuture(stack.slice(1));
    setPast((p) => [...p, rssEditSnapshot(draft())]);
    const edit = JSON.parse(next) as RssEditSource;
    setDraft(edit);
    setJsonText(serializeRssEditSource(edit));
  }

  const isDirty = () => baseline() !== rssEditSnapshot(draft());
  const snapshotEntries = createMemo(() => Object.entries(snapshots()));

  const [loaded] = createResource(
    () => route.url,
    async (url) => {
      if (!url) {
        const empty = createEmptyRssEditSource();
        setDraft(empty);
        setBaseline(rssEditSnapshot(empty));
        setPast([]);
        setFuture([]);
        setJsonText(serializeRssEditSource(empty));
        return empty;
      }
      const source = await getRssSource(url);
      const edit = apiRssSourceToEdit(source);
      setDraft(edit);
      setBaseline(rssEditSnapshot(edit));
      setPast([]);
      setFuture([]);
      setJsonText(serializeRssEditSource(edit));
      return edit;
    },
  );

  const [allSources, { refetch: refetchAllSources }] = createResource(getRssSources);

  const filteredSources = createMemo(() => {
    const q = sourceListFilter().trim().toLowerCase();
    const list = allSources() ?? [];
    if (!q) return list;
    return list.filter(
      (s) =>
        s.sourceName.toLowerCase().includes(q) ||
        s.sourceUrl.toLowerCase().includes(q) ||
        (s.sourceGroup ?? '').toLowerCase().includes(q),
    );
  });

  function updateField(field: RssSourceEditField, raw: string | boolean) {
    setDraft((prev) => {
      pushHistory(prev);
      const next = cloneRssEdit(prev);
      let value: string | number | boolean = raw;
      if (field.type === 'Number') value = Number(raw);
      if (field.type === 'Boolean') value = Boolean(raw);
      if (field.type === 'Array' && typeof raw === 'string') {
        const idx = field.array?.indexOf(raw) ?? 0;
        value = idx;
      }
      setRssEditFieldValue(next, field, value);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    try {
      await saveRssSource(draft());
      setBaseline(rssEditSnapshot(draft()));
      setJsonText(serializeRssEditSource(draft()));
      if (isNew()) {
        const url = draft().sourceUrl;
        window.location.hash = `#/rss/edit?url=${encodeURIComponent(url)}`;
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function syncJsonFromDraft() {
    setJsonText(serializeRssEditSource(draft()));
  }

  function applyJson() {
    try {
      const edit = parseRssEditFromText(jsonText());
      pushHistory(draft());
      setDraft(edit);
      setSaveError('');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  }

  function exportSource() {
    downloadJson(draft(), `${draft().sourceName || 'rss-source'}.json`);
  }

  async function runDebug() {
    setRightTab('debug');
    setDebugRunning(true);
    setDebugError('');
    setDebugLogs([]);
    setSnapshots({});

    if (isDirty()) {
      try {
        await saveRssSource(draft());
        setBaseline(rssEditSnapshot(draft()));
      } catch (e) {
        setDebugError(e instanceof Error ? e.message : '调试前保存失败');
        setDebugRunning(false);
        return;
      }
    }

    const appendLog = (message: string, state = 1) => {
      if (!message) return;
      setDebugLogs((prev) => [...prev, { state, message }]);
    };

    const source = draft();
    const tag = draft().sourceUrl;
    const key = debugKey();

    if (debugMode() === 'ws' && tag) {
      try {
        await new Promise<void>((resolve, reject) => {
          debugWs?.close();
          debugWs = runRssSourceDebugWs(tag, key, source, (line) => appendLog(line));
          debugWs.onerror = () => reject(new Error('WebSocket 连接失败，可切换 REST 模式重试'));
          debugWs.onclose = () => {
            setDebugRunning(false);
            resolve();
          };
        });
        return;
      } catch (e) {
        setDebugError(e instanceof Error ? e.message : String(e));
        setDebugRunning(false);
        return;
      }
    }

    try {
      const result = await debugRssSource(source, key);
      setDebugLogs(result.logs);
      setSnapshots(result.snapshots as Record<string, string>);
    } catch (e) {
      setDebugError(e instanceof Error ? e.message : String(e));
    } finally {
      setDebugRunning(false);
    }
  }

  async function handlePullSources() {
    setRightTab('list');
    try {
      await refetchAllSources();
      showToast(`成功拉取 ${(allSources() ?? []).length} 条订阅源`, 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '拉取失败', 'error');
    }
  }

  async function handlePushSources() {
    const list = allSources() ?? [];
    if (!list.length) {
      showToast('空空如也', 'info');
      return;
    }
    setPushing(true);
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
      showToast(e instanceof Error ? e.message : '推送失败', 'error');
    } finally {
      setPushing(false);
    }
  }

  function clearForm() {
    const empty = createEmptyRssEditSource();
    pushHistory(draft());
    setDraft(empty);
    setJsonText(serializeRssEditSource(empty));
    showToast('已清除表单', 'success');
  }

  function clearAllHistory() {
    setPast([]);
    setFuture([]);
    showToast('已清除所有历史记录', 'success');
  }

  function openSource(s: WebRssSource) {
    const url = s.sourceUrl;
    if (url) window.location.hash = `#/rss/edit?url=${encodeURIComponent(url)}`;
  }

  onMount(() => {
    setHotkeyActions(loadSourceHotkeys());

    const onKey = (e: KeyboardEvent) => {
      if (hotkeysOpen() || qrOpen()) return;
      for (const action of hotkeyActions()) {
        if (!matchHotkey(e, action.hotKeys)) continue;
        e.preventDefault();
        switch (action.id) {
          case 'save':
            if (!saving() && isDirty()) void handleSave();
            break;
          case 'undo':
            undo();
            break;
          case 'redo':
            redo();
            break;
          case 'debug':
            setRightTab('debug');
            if (!debugRunning()) void runDebug();
            break;
          case 'export':
            exportSource();
            break;
          case 'qr':
            setQrOpen(true);
            break;
          case 'json':
            syncJsonFromDraft();
            setRightTab('json');
            break;
        }
        break;
      }
    };
    window.addEventListener('keydown', onKey);
    onCleanup(() => {
      window.removeEventListener('keydown', onKey);
      debugWs?.close();
    });
  });

  const activeFields = () =>
    RSS_SOURCE_EDIT_SECTIONS.find((s) => s.key === activeTab())?.children ?? [];

  const formPanel = (
    <>
      <div class="mb-4 flex flex-wrap gap-1">
        <For each={RSS_SOURCE_EDIT_SECTIONS}>
          {(section) => (
            <button
              type="button"
              class={`rounded-lg px-3 py-1.5 text-sm ${activeTab() === section.key ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'}`}
              onClick={() => setActiveTab(section.key)}
            >
              {section.name}
            </button>
          )}
        </For>
      </div>
      <SourceFieldForm
        fields={activeFields()}
        getValue={(field) => getRssEditFieldValue(draft(), field as RssSourceEditField)}
        onChange={(field, raw) => updateField(field as RssSourceEditField, raw)}
      />
    </>
  );

  return (
    <Layout title={isNew() ? '新建订阅源' : '编辑订阅源'}>
      <Show when={resourceError(loaded)}>
        <ErrorBox message={formatResourceError(resourceError(loaded))} />
      </Show>
      <Show when={saveError()}>
        <ErrorBox message={saveError()} />
      </Show>

      <div class="mb-3 flex flex-wrap items-center gap-2">
        <Button href="#/rss" variant="ghost">
          返回列表
        </Button>
        <label class="ml-auto flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(draft().enabled)}
            onChange={(e) =>
              updateField({ id: 'enabled', type: 'Boolean', title: '启用' }, e.currentTarget.checked)
            }
          />
          启用
        </label>
        <Show when={isDirty()}>
          <span class="text-xs web-text-warning">未保存</span>
        </Show>
      </div>

      <Show when={!loaded.loading && !resourceError(loaded)} fallback={<Loading />}>
        <SourceEditorLayout
          left={formPanel}
          rightTab={rightTab()}
          onRightTabChange={(tab) => {
            if (tab === 'json') syncJsonFromDraft();
            setRightTab(tab);
          }}
          toolbar={
            <>
              <SourceEditorToolBtn
                icon="⇈"
                label="推送"
                disabled={pushing()}
                onClick={() => void handlePushSources()}
              />
              <SourceEditorToolBtn icon="⇊" label="拉取" onClick={() => void handlePullSources()} />
              <SourceEditorToolBtn
                icon="⋙"
                label="生成"
                onClick={() => {
                  syncJsonFromDraft();
                  setRightTab('json');
                }}
              />
              <SourceEditorToolBtn
                icon="⋘"
                label="编辑"
                onClick={() => {
                  applyJson();
                  setRightTab('json');
                }}
              />
              <SourceEditorToolBtn icon="✗" label="清空" onClick={clearForm} />
              <SourceEditorToolBtn
                icon="💾"
                label="保存"
                disabled={saving() || !isDirty()}
                onClick={() => void handleSave()}
              />
              <SourceEditorToolBtn icon="↶" label="撤销" disabled={!canUndo()} onClick={undo} />
              <SourceEditorToolBtn icon="↷" label="清历史" onClick={clearAllHistory} />
              <SourceEditorToolBtn
                icon="{ }"
                label="JSON"
                active={rightTab() === 'json'}
                onClick={() => {
                  syncJsonFromDraft();
                  setRightTab('json');
                }}
              />
              <SourceEditorToolBtn
                icon="▶"
                label="调试"
                active={rightTab() === 'debug'}
                onClick={() => {
                  setRightTab('debug');
                  if (!debugRunning()) void runDebug();
                }}
              />
              <SourceEditorToolBtn icon="📤" label="导出" onClick={exportSource} />
              <SourceEditorToolBtn icon="QR" label="二维码" onClick={() => setQrOpen(true)} />
              <SourceEditorToolBtn
                icon="?"
                label="帮助"
                active={rightTab() === 'help'}
                onClick={() => setRightTab('help')}
              />
              <SourceEditorToolBtn icon="⌨" label="快捷键" onClick={() => setHotkeysOpen(true)} />
            </>
          }
          jsonPanel={
            <div class="flex h-full flex-col gap-2">
              <TextArea
                class="min-h-[50vh] flex-1 font-mono text-xs"
                value={jsonText()}
                onInput={setJsonText}
                rows={16}
              />
              <div class="flex gap-2">
                <Button variant="ghost" class="flex-1" onClick={syncJsonFromDraft}>
                  从表单同步
                </Button>
                <Button class="flex-1" onClick={applyJson}>
                  应用到表单
                </Button>
              </div>
            </div>
          }
          debugPanel={
            <div class="space-y-3">
              <div>
                <Label hint="关键字 | 分类::URL | 文章 URL">调试关键字</Label>
                <div class="mt-2 flex flex-col gap-2">
                  <Input value={debugKey()} onInput={setDebugKey} placeholder="留空列出分类" />
                  <select
                    class="rounded-lg border border-border bg-background px-2 py-2 text-sm"
                    aria-label="调试模式"
                    value={debugMode()}
                    onChange={(e) => setDebugMode(e.currentTarget.value as 'ws' | 'rest')}
                  >
                    <option value="ws">WebSocket</option>
                    <option value="rest">REST</option>
                  </select>
                  <Button onClick={runDebug} disabled={debugRunning()}>
                    {debugRunning() ? '调试中…' : '开始调试'}
                  </Button>
                </div>
              </div>
              <Show when={debugError()}>
                <ErrorBox message={debugError()} />
              </Show>
              <div class="max-h-[50vh] overflow-y-auto rounded-lg border border-border bg-muted/30 p-2 font-mono text-xs">
                <Show when={debugLogs().length} fallback={<p class="text-muted-foreground">调试日志</p>}>
                  <For each={debugLogs()}>
                    {(line) => (
                      <p class={`whitespace-pre-wrap ${logClass(line.state)}`}>{line.message}</p>
                    )}
                  </For>
                </Show>
              </div>
              <Show when={snapshotEntries().length > 0}>
                <For each={snapshotEntries()}>
                  {([key, html]) => (
                    <details class="rounded-lg border border-border">
                      <summary class="cursor-pointer px-2 py-1.5 text-xs font-medium">{key}</summary>
                      <pre class="max-h-32 overflow-auto p-2 text-[10px]">{html.slice(0, 4000)}</pre>
                    </details>
                  )}
                </For>
              </Show>
            </div>
          }
          listPanel={
            <div class="space-y-2">
              <Input
                value={sourceListFilter()}
                onInput={setSourceListFilter}
                placeholder="筛选订阅源…"
              />
              <Show when={!allSources.loading} fallback={<Loading />}>
                <VirtualSourceList
                  items={filteredSources}
                  estimateSize={48}
                  maxHeight="60vh"
                  getKey={(s) => s.sourceUrl}
                >
                  {(s) => {
                    const current = s.sourceUrl === draft().sourceUrl;
                    const failed = pushFailedUrls().has(s.sourceUrl);
                    return (
                      <button
                        type="button"
                        class={`w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent ${current ? 'bg-accent font-medium' : ''} ${failed ? 'web-text-danger' : ''}`}
                        onClick={() => openSource(s)}
                      >
                        <span class="block truncate">{s.sourceName}</span>
                        <span class="block truncate opacity-60">{s.sourceUrl}</span>
                      </button>
                    );
                  }}
                </VirtualSourceList>
              </Show>
            </div>
          }
          helpPanel={<SourceHelpPanel kind="rss" />}
        />
      </Show>

      <SourceQrModal
        open={qrOpen()}
        jsonText={serializeRssEditSource(draft())}
        onClose={() => setQrOpen(false)}
      />
      <SourceHotkeysDialog
        open={hotkeysOpen()}
        actions={hotkeyActions()}
        onSave={(actions) => {
          saveSourceHotkeys(actions);
          setHotkeyActions(actions);
        }}
        onClose={() => setHotkeysOpen(false)}
      />
    </Layout>
  );
}
