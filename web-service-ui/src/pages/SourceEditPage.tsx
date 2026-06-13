import { createMemo, createResource, createSignal, For, Show, onCleanup, onMount } from 'solid-js';
import {
  Layout,
  Card,
  Button,
  ErrorBox,
  Loading,
  Input,
  TextArea,
  Label,
} from '@/components/Layout';
import {
  BOOK_SOURCE_EDIT_SECTIONS,
  type BookSourceEditField,
} from '@/lib/book-source-edit-config';
import {
  cloneLegadoEdit,
  createEmptyLegadoEditSource,
  getEditFieldValue,
  legadoEditSnapshot,
  legadoEditToExportObject,
  parseLegadoEditFromText,
  serializeLegadoEditSource,
  setEditFieldValue,
  apiBookSourceToLegadoEdit,
  type ApiBookSource,
  type LegadoEditSource,
} from '@/lib/legado-source-edit';
import {
  debugBookSource,
  getBookSource,
  getBookSources,
  runBookSourceDebugWs,
  saveBookSource,
  saveBookSources,
  sourceNameOf,
  sourceUrlOf,
  type BookSourceDebugLogEntry,
  type WebBookSource,
} from '@/lib/api';
import { SourceQrModal } from '@/components/SourceQrModal';
import { VirtualSourceList } from '@/components/VirtualSourceList';
import { SourceHotkeysDialog } from '@/components/SourceHotkeysDialog';
import { SourceHelpPanel } from '@/components/SourceHelpPanel';
import {
  SourceEditorLayout,
  SourceEditorToolBtn,
  type SourceEditorRightTab,
} from '@/components/SourceEditorLayout';
import {
  loadSourceHotkeys,
  matchHotkey,
  saveSourceHotkeys,
  type SourceHotkeyAction,
} from '@/lib/source-hotkeys';
import { loadPushFailedUrls, markPushResults } from '@/lib/api-config';
import { formatResourceError, resourceError } from '@/lib/resource';
import { showToast } from '@/lib/toast';

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

export function SourceEditPage() {
  const route = parseEditRoute();
  const isNew = () => !route.url;
  const [draft, setDraft] = createSignal<LegadoEditSource>(createEmptyLegadoEditSource());
  const [baseline, setBaseline] = createSignal('');
  const [activeTab, setActiveTab] = createSignal(BOOK_SOURCE_EDIT_SECTIONS[0].key);
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
  const [hotkeysOpen, setHotkeysOpen] = createSignal(false);
  const [hotkeyActions, setHotkeyActions] = createSignal<SourceHotkeyAction[]>(loadSourceHotkeys());
  const [past, setPast] = createSignal<string[]>([]);
  const [future, setFuture] = createSignal<string[]>([]);
  const [sourceListFilter, setSourceListFilter] = createSignal('');
  const [pushFailedUrls, setPushFailedUrls] = createSignal(loadPushFailedUrls());
  const [pushing, setPushing] = createSignal(false);
  const MAX_HISTORY = 40;

  const canUndo = () => past().length > 0;
  const canRedo = () => future().length > 0;

  function pushHistory(before: LegadoEditSource) {
    setPast((p) => [...p.slice(-MAX_HISTORY), legadoEditSnapshot(before)]);
    setFuture([]);
  }

  function undo() {
    const stack = past();
    if (!stack.length) return;
    const prev = stack[stack.length - 1];
    setPast(stack.slice(0, -1));
    setFuture((f) => [legadoEditSnapshot(draft()), ...f]);
    setDraft(JSON.parse(prev) as LegadoEditSource);
  }

  function redo() {
    const stack = future();
    if (!stack.length) return;
    const next = stack[0];
    setFuture(stack.slice(1));
    setPast((p) => [...p, legadoEditSnapshot(draft())]);
    setDraft(JSON.parse(next) as LegadoEditSource);
  }

  const [loaded] = createResource(
    () => route.url,
    async (url) => {
      if (!url) {
        const empty = createEmptyLegadoEditSource();
        setDraft(empty);
        setBaseline(legadoEditSnapshot(empty));
        setPast([]);
        setFuture([]);
        setJsonText(serializeLegadoEditSource(empty));
        setDebugKey((empty.ruleSearch?.checkKeyWord as string) || '我的');
        return empty;
      }
      const source = await getBookSource(url);
      const edit = apiBookSourceToLegadoEdit(source as ApiBookSource);
      setDraft(edit);
      setBaseline(legadoEditSnapshot(edit));
      setPast([]);
      setFuture([]);
      setJsonText(serializeLegadoEditSource(edit));
      setDebugKey((edit.ruleSearch?.checkKeyWord as string) || '我的');
      return edit;
    },
  );

  const [allSources, { refetch: refetchAllSources }] = createResource(getBookSources);

  const snapshotEntries = createMemo(() => Object.entries(snapshots()));
  const filteredSources = createMemo(() => {
    const q = sourceListFilter().trim().toLowerCase();
    const list = allSources() ?? [];
    if (!q) return list;
    return list.filter(
      (s) =>
        sourceNameOf(s).toLowerCase().includes(q) ||
        sourceUrlOf(s).toLowerCase().includes(q),
    );
  });

  const isDirty = () => baseline() !== legadoEditSnapshot(draft());

  function updateField(field: BookSourceEditField, raw: string | boolean) {
    setDraft((prev) => {
      pushHistory(prev);
      const next = cloneLegadoEdit(prev);
      let value: string | number | boolean = raw;
      if (field.type === 'Number') value = Number(raw);
      if (field.type === 'Boolean') value = Boolean(raw);
      if (field.type === 'Array' && typeof raw === 'string') {
        const idx = field.array?.indexOf(raw) ?? 0;
        value = idx;
      }
      setEditFieldValue(next, field, value);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    try {
      const payload = legadoEditToExportObject(draft());
      await saveBookSource(payload);
      setBaseline(legadoEditSnapshot(draft()));
      setJsonText(serializeLegadoEditSource(draft()));
      if (isNew()) {
        const url = draft().bookSourceUrl;
        window.location.hash = `#/sources/edit?url=${encodeURIComponent(url)}`;
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function syncJsonFromDraft() {
    setJsonText(serializeLegadoEditSource(draft()));
  }

  function applyJson() {
    try {
      const edit = parseLegadoEditFromText(jsonText());
      pushHistory(draft());
      setDraft(edit);
      setSaveError('');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  }

  const [debugMode, setDebugMode] = createSignal<'ws' | 'rest'>('ws');
  let debugWs: WebSocket | null = null;

  async function runDebug() {
    setRightTab('debug');
    setDebugRunning(true);
    setDebugError('');
    setDebugLogs([]);
    setSnapshots({});

    if (isDirty()) {
      try {
        await saveBookSource(legadoEditToExportObject(draft()));
        setBaseline(legadoEditSnapshot(draft()));
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

    const source = legadoEditToExportObject(draft());
    const tag = draft().bookSourceUrl;
    const key = debugKey();

    if (debugMode() === 'ws' && tag) {
      try {
        await new Promise<void>((resolve, reject) => {
          debugWs?.close();
          debugWs = runBookSourceDebugWs(tag, key, source, (line) => appendLog(line));
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
      const result = await debugBookSource(source, key);
      setDebugLogs(result.logs);
      setSnapshots(result.snapshots as Record<string, string>);
    } catch (e) {
      setDebugError(e instanceof Error ? e.message : String(e));
    } finally {
      setDebugRunning(false);
    }
  }

  function exportSource() {
    const payload = legadoEditToExportObject(draft());
    const name = (payload.bookSourceName as string) || 'book-source';
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportQrText() {
    return JSON.stringify(legadoEditToExportObject(draft()));
  }

  async function handlePullSources() {
    setRightTab('list');
    try {
      await refetchAllSources();
      showToast(`成功拉取 ${(allSources() ?? []).length} 条书源`, 'success');
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
      showToast(e instanceof Error ? e.message : '推送失败', 'error');
    } finally {
      setPushing(false);
    }
  }

  function clearForm() {
    const empty = createEmptyLegadoEditSource();
    pushHistory(draft());
    setDraft(empty);
    setJsonText(serializeLegadoEditSource(empty));
    showToast('已清除表单', 'success');
  }

  function clearAllHistory() {
    setPast([]);
    setFuture([]);
    showToast('已清除所有历史记录', 'success');
  }

  function openSource(s: WebBookSource) {
    const url = sourceUrlOf(s);
    if (url) window.location.hash = `#/sources/edit?url=${encodeURIComponent(url)}`;
  }

  onMount(() => {
    if (!isNew() && !debugKey()) setDebugKey('我的');
    setHotkeyActions(loadSourceHotkeys());
    if (!localStorage.getItem('reader_web_hotkeys_seen')) {
      setHotkeysOpen(true);
      localStorage.setItem('reader_web_hotkeys_seen', '1');
    }

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

  const formPanel = (
    <>
      <div class="mb-4 flex flex-wrap gap-1">
        <For each={BOOK_SOURCE_EDIT_SECTIONS}>
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
      <div class="space-y-4">
        <For each={BOOK_SOURCE_EDIT_SECTIONS.find((s) => s.key === activeTab())?.children ?? []}>
          {(field) => (
            <div class="space-y-1">
              <Label hint={field.hint}>
                {field.title}
                {field.required ? ' *' : ''}
              </Label>
              <Show
                when={field.type === 'Boolean'}
                fallback={
                  <Show
                    when={field.type === 'Array'}
                    fallback={
                      <Show
                        when={
                          field.id.includes('Js') ||
                          field.id.includes('Url') ||
                          field.id === 'header' ||
                          field.namespace
                        }
                        fallback={
                          <Input
                            value={String(getEditFieldValue(draft(), field) ?? '')}
                            onInput={(v) => updateField(field, v)}
                          />
                        }
                      >
                        <TextArea
                          value={String(getEditFieldValue(draft(), field) ?? '')}
                          onInput={(v) => updateField(field, v)}
                          rows={3}
                        />
                      </Show>
                    }
                  >
                    <select
                      class="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      aria-label={field.title}
                      value={String(
                        field.array?.[Number(getEditFieldValue(draft(), field) ?? 0)] ?? '',
                      )}
                      onChange={(e) => updateField(field, e.currentTarget.value)}
                    >
                      <For each={field.array ?? []}>
                        {(opt) => <option value={opt}>{opt}</option>}
                      </For>
                    </select>
                  </Show>
                }
              >
                <label class="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(getEditFieldValue(draft(), field))}
                    onChange={(e) => updateField(field, e.currentTarget.checked)}
                  />
                  启用
                </label>
              </Show>
            </div>
          )}
        </For>
      </div>
    </>
  );

  return (
    <Layout title={isNew() ? '新建书源' : '编辑书源'}>
      <Show when={resourceError(loaded)}>
        <ErrorBox message={formatResourceError(resourceError(loaded))} />
      </Show>
      <Show when={saveError()}>
        <ErrorBox message={saveError()} />
      </Show>

      <div class="mb-3 flex flex-wrap items-center gap-2">
        <Button href="#/sources" variant="ghost">
          返回列表
        </Button>
        <label class="ml-auto flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(getEditFieldValue(draft(), { id: 'enabled', type: 'Boolean', title: '启用' }))}
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
                <Label hint="关键字 | URL | 分类::URL | ++目录URL | --正文URL">调试关键字</Label>
                <div class="mt-2 flex flex-col gap-2">
                  <Input value={debugKey()} onInput={setDebugKey} placeholder="我的" />
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
                placeholder="筛选书源…"
              />
              <Show when={!allSources.loading} fallback={<Loading />}>
                <VirtualSourceList
                  items={filteredSources}
                  estimateSize={48}
                  maxHeight="60vh"
                  getKey={(s) => sourceUrlOf(s)}
                >
                  {(s) => {
                    const url = sourceUrlOf(s);
                    const current = url === draft().bookSourceUrl;
                    const failed = pushFailedUrls().has(url);
                    return (
                      <button
                        type="button"
                        class={`w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent ${current ? 'bg-accent font-medium' : ''} ${failed ? 'web-text-danger' : ''}`}
                        onClick={() => openSource(s)}
                      >
                        <span class="block truncate">{sourceNameOf(s)}</span>
                        <span class="block truncate opacity-60">{url}</span>
                      </button>
                    );
                  }}
                </VirtualSourceList>
              </Show>
            </div>
          }
          helpPanel={<SourceHelpPanel kind="book" />}
        />
      </Show>

      <SourceQrModal open={qrOpen()} jsonText={exportQrText()} onClose={() => setQrOpen(false)} />
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
