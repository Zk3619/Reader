/**
 * 订阅源编辑页（对齐 Legado RssSourceEditActivity + SourceEditPage）
 */

import {
  createSignal,
  Show,
  For,
  onMount,
  onCleanup,
  createEffect,
  createMemo,
  type JSX,
} from 'solid-js';
import { useBackHandler } from '@/lib/navigation/use-back-handler';
import {
  PageHeader,
  type PageHeaderAction,
  type PageHeaderDropdownItem,
} from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { Switch, SwitchControl, SwitchThumb } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TextField, TextFieldInput, TextFieldTextArea } from '@/components/ui/text-field';
import {
  Resizable,
  ResizableHandle,
  ResizablePanel,
} from '@/components/ui/resizable';
import {
  AppSelect,
  AppSelectContent,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import {
  CodeIcon,
  CookieIcon,
  FileTextIcon,
  MoreIcon,
  QrCodeIcon,
  SaveIcon,
  ScanQrCodeIcon,
} from '@/components/shared/icons';
import { SourceCodeEditor } from '@/components/shared/SourceCodeEditor';
import { RssSourceDebugPanel } from '@/components/rss/RssSourceDebugPanel';
import { createRssSourceDebugPanelStore } from '@/lib/rss-source/rss-source-debug-panel-store';
import {
  SourceCodeEditDialog,
  type SourceCodeEditTarget,
} from '@/components/sources/SourceCodeEditDialog';
import { SourceShareQrDialog } from '@/components/sources/SourceShareQrDialog';
import { ImportSourceQrDialog } from '@/components/sources/ImportSourceQrDialog';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { showAppToast } from '@/components/shared/AppToasts';
import {
  RSS_SOURCE_EDIT_SECTIONS,
  type RssSourceEditField,
} from '@/lib/rss-source/rss-source-edit-config';
import {
  createEmptyRssEditSource,
  loadRssEditSource,
  saveRssEditSource,
  serializeRssEditSource,
  parseRssEditFromText,
  getRssEditFieldValue,
  setRssEditFieldValue,
  rssEditSnapshot,
  readRssSourceAutoCompleteEnabled,
  writeRssSourceAutoCompleteEnabled,
} from '@/lib/rss-source/legado-rss-source-editor';
import * as rssSourcesDb from '@/lib/database/rss-sources';
import type { RssSource } from '@/types';

const RSS_EDIT_TEXTAREA_CLASS =
  'min-h-[4.5rem] max-h-60 resize-none overflow-y-auto [field-sizing:content]';

const RSS_EDIT_PANEL_MIN_SIZE = 0.28;

export interface RssSourceEditPageProps {
  sourceUrl?: string;
  onClose: () => void;
  onSaved?: (source: RssSource) => void;
  onOpenLogin?: (source: RssSource) => void;
}

export function RssSourceEditPage(props: RssSourceEditPageProps) {
  const isNew = () => !props.sourceUrl;
  const [draft, setDraft] = createSignal<RssSource>(createEmptyRssEditSource());
  const [baseline, setBaseline] = createSignal('');
  const [loading, setLoading] = createSignal(!!props.sourceUrl);
  const [saving, setSaving] = createSignal(false);
  const [jsonDialogOpen, setJsonDialogOpen] = createSignal(false);
  const [jsonText, setJsonText] = createSignal('');
  const [groupDialogOpen, setGroupDialogOpen] = createSignal(false);
  const [sourceGroups, setSourceGroups] = createSignal<string[]>([]);
  const [activeTab, setActiveTab] = createSignal(RSS_SOURCE_EDIT_SECTIONS[0].key);
  const [pageMode, setPageMode] = createSignal<'edit' | 'debug'>('edit');
  const [autoCompleteEnabled, setAutoCompleteEnabled] = createSignal(
    readRssSourceAutoCompleteEnabled(),
  );
  const [codeEditTarget, setCodeEditTarget] = createSignal<SourceCodeEditTarget | null>(null);
  const [codeEditOpen, setCodeEditOpen] = createSignal(false);
  const [shareQrOpen, setShareQrOpen] = createSignal(false);
  const [qrImportOpen, setQrImportOpen] = createSignal(false);
  const debugStore = createRssSourceDebugPanelStore();

  const isDirty = () => baseline() !== rssEditSnapshot(draft());
  const hasLoginUrl = () => Boolean(draft().loginUrl?.trim() || draft().loginUi?.trim());
  const pageTitle = () => (isNew() ? '新建订阅源' : '编辑订阅源');
  const pageDescription = () =>
    isNew() ? '填写订阅源规则后保存' : draft().sourceName || props.sourceUrl || '';

  const debugSource = () => draft();

  onMount(async () => {
    try {
      const groups = await rssSourcesDb.getAllRssSourceGroups();
      setSourceGroups(groups);
    } catch {
      /* ignore */
    }
    if (!props.sourceUrl) {
      const empty = createEmptyRssEditSource();
      setDraft(empty);
      setBaseline(rssEditSnapshot(empty));
      setLoading(false);
      return;
    }
    try {
      const edit = await loadRssEditSource(props.sourceUrl);
      setDraft(edit);
      setBaseline(rssEditSnapshot(edit));
    } catch (e) {
      showAppToast({
        title: '加载失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
      props.onClose();
    } finally {
      setLoading(false);
    }
  });

  onCleanup(() => debugStore.dispose());

  createEffect(() => {
    void debugStore.loadSortSections(debugSource().sourceUrl?.trim() ? debugSource() : null);
  });

  function updateDraft(updater: (prev: RssSource) => RssSource) {
    setDraft((prev) => updater({ ...prev }));
  }

  function handleBack() {
    if (isDirty()) {
      if (!confirm('有未保存的修改，确定离开吗？')) return;
    }
    props.onClose();
  }

  useBackHandler(() => () => {
    if (isDirty()) {
      if (!confirm('有未保存的修改，确定离开吗？')) return true;
    }
    props.onClose();
    return true;
  });

  async function handleSave() {
    setSaving(true);
    try {
      const saved = await saveRssEditSource(draft(), props.sourceUrl, {
        autoComplete: autoCompleteEnabled(),
      });
      setBaseline(rssEditSnapshot(draft()));
      showAppToast({ title: isNew() ? '订阅源已创建' : '订阅源已保存', variant: 'default' });
      props.onSaved?.(saved);
      props.onClose();
    } catch (e) {
      showAppToast({
        title: '保存失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  function openJsonDialog() {
    setJsonText(serializeRssEditSource(draft()));
    setJsonDialogOpen(true);
  }

  function applyJson() {
    try {
      const parsed = parseRssEditFromText(jsonText());
      setDraft(parsed);
      setJsonDialogOpen(false);
      showAppToast({ title: '已应用 JSON', variant: 'default' });
    } catch (e) {
      showAppToast({
        title: 'JSON 无效',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    }
  }

  async function copySourceJson() {
    try {
      await navigator.clipboard.writeText(serializeRssEditSource(draft()));
      showAppToast({ title: '已复制到剪贴板', variant: 'default' });
    } catch {
      showAppToast({ title: '复制失败', variant: 'destructive' });
    }
  }

  async function pasteSourceJson() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        showAppToast({ title: '剪贴板为空', variant: 'destructive' });
        return;
      }
      const parsed = parseRssEditFromText(text);
      setDraft(parsed);
      showAppToast({ title: '已从剪贴板粘贴', variant: 'default' });
    } catch (e) {
      showAppToast({
        title: '粘贴失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    }
  }

  function appendGroup(group: string) {
    updateDraft((prev) => {
      const current = prev.sourceGroup?.trim() ?? '';
      const parts = current ? current.split(',').map((s) => s.trim()).filter(Boolean) : [];
      if (!parts.includes(group)) parts.push(group);
      return { ...prev, sourceGroup: parts.join(',') };
    });
    setGroupDialogOpen(false);
  }

  async function persistDraftForDebug(): Promise<RssSource | null> {
    const d = draft();
    if (!d.sourceUrl.trim() || !d.sourceName.trim()) {
      return null;
    }
    try {
      return await saveRssEditSource(d, props.sourceUrl, {
        autoComplete: autoCompleteEnabled(),
      });
    } catch {
      return d;
    }
  }

  function openCodeEdit(field: RssSourceEditField, sectionKey: string) {
    const value = getRssEditFieldValue(draft(), field);
    setCodeEditTarget({
      title: field.title,
      value: value === undefined ? '' : String(value),
      tabKey: sectionKey,
      fieldKey: field.id,
    });
    setCodeEditOpen(true);
  }

  function applyCodeEdit(value: string, meta: { tabKey: string; fieldKey: string }) {
    const field: RssSourceEditField = {
      title: meta.fieldKey,
      id: meta.fieldKey,
      type: 'String',
    };
    updateDraft((prev) => {
      setRssEditFieldValue(prev, field, value);
      return prev;
    });
  }

  function renderField(field: RssSourceEditField, sectionKey: string): JSX.Element {
    const value = () => getRssEditFieldValue(draft(), field);

    if (field.type === 'Boolean') {
      const checked = () => Boolean(value());
      return (
        <div class="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
          <div class="min-w-0">
            <div class="text-sm font-medium text-foreground">{field.title}</div>
          </div>
          <Switch
            checked={checked()}
            onChange={(v) =>
              updateDraft((prev) => {
                setRssEditFieldValue(prev, field, v);
                return prev;
              })
            }
          >
            <SwitchControl>
              <SwitchThumb />
            </SwitchControl>
          </Switch>
        </div>
      );
    }

    if (field.type === 'Number') {
      const numValue = () => {
        const v = value();
        return typeof v === 'number' ? v : Number(v ?? 0) || 0;
      };
      return (
        <div class="block space-y-1.5">
          <span class="text-sm font-medium text-foreground">{field.title}</span>
          <TextField>
            <TextFieldInput
              type="number"
              min={0}
              value={numValue()}
              onInput={(e) =>
                updateDraft((prev) => {
                  setRssEditFieldValue(prev, field, Number(e.currentTarget.value) || 0);
                  return prev;
                })
              }
            />
          </TextField>
        </div>
      );
    }

    if (field.type === 'Array' && field.array) {
      const options = field.array;
      const arrayIndices = options.map((_, index) => index);
      const selectedIndex = () => {
        const v = value();
        return typeof v === 'number' ? v : Number(v ?? 0);
      };
      return (
        <div class="block space-y-1.5">
          <span class="text-sm font-medium text-foreground">
            {field.title}
            {field.required ? <span class="text-destructive"> *</span> : null}
          </span>
          <AppSelect
            value={selectedIndex()}
            onChange={(v) => {
              if (v == null) return;
              updateDraft((prev) => {
                setRssEditFieldValue(prev, field, v);
                return prev;
              });
            }}
            options={arrayIndices}
            itemComponent={(itemProps) => (
              <AppSelectItem item={itemProps.item}>
                {options[itemProps.item.rawValue as number] ?? itemProps.item.rawValue}
              </AppSelectItem>
            )}
          >
            <AppSelectTrigger aria-label={field.title}>
              <AppSelectValue>
                {(state) => {
                  const raw = state.selectedOption();
                  const idx =
                    typeof raw === 'number' ? raw : raw != null ? Number(raw) : selectedIndex();
                  return options[idx] ?? '';
                }}
              </AppSelectValue>
              <AppSelectIcon />
            </AppSelectTrigger>
            <AppSelectContent portalZClass="z-[130]">
              <AppSelectListbox />
            </AppSelectContent>
          </AppSelect>
        </div>
      );
    }

    const strValue = () => (value() === undefined ? '' : String(value()));

    return (
      <div class="block space-y-1.5">
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm font-medium text-foreground">
            {field.title}
            {field.required ? <span class="text-destructive"> *</span> : null}
          </span>
          <div class="flex shrink-0 gap-1">
            <Show when={field.id === 'sourceGroup'}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                class="h-7 px-2 text-xs"
                onClick={() => setGroupDialogOpen(true)}
              >
                插入分组
              </Button>
            </Show>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="h-7 w-7 shrink-0"
              onClick={() => openCodeEdit(field, sectionKey)}
              aria-label={`代码编辑：${field.title}`}
            >
              <CodeIcon class="h-4 w-4" />
            </Button>
          </div>
        </div>
        <TextField>
          <TextFieldTextArea
            class={RSS_EDIT_TEXTAREA_CLASS}
            placeholder={field.hint}
            value={strValue()}
            onInput={(e) =>
              updateDraft((prev) => {
                setRssEditFieldValue(prev, field, e.currentTarget.value);
                return prev;
              })
            }
          />
        </TextField>
        <Show when={field.hint}>
          <p class="text-xs text-muted-foreground">{field.hint}</p>
        </Show>
      </div>
    );
  }

  const EditSectionsTabs = () => (
    <Tabs
      value={activeTab()}
      onChange={setActiveTab}
      class="flex min-h-0 flex-1 flex-col"
    >
      <TabsList class="mb-3 flex h-auto w-full shrink-0 gap-1 p-1">
        <For each={RSS_SOURCE_EDIT_SECTIONS}>
          {(section) => (
            <TabsTrigger
              value={section.key}
              class="min-w-0 flex-1 truncate text-xs hover:bg-background/60 hover:text-foreground sm:text-sm"
            >
              {section.name}
            </TabsTrigger>
          )}
        </For>
      </TabsList>
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 mb-4">
        <For each={RSS_SOURCE_EDIT_SECTIONS}>
          {(section) => (
            <TabsContent value={section.key} class="mt-0 space-y-4 pb-8">
              <For each={section.children}>{(field) => renderField(field, section.key)}</For>
            </TabsContent>
          )}
        </For>
      </div>
    </Tabs>
  );

  const DebugPane = () => (
    <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <RssSourceDebugPanel
        store={debugStore}
        source={debugSource}
        onBeforeDebug={persistDraftForDebug}
      />
    </div>
  );

  const headerActions = createMemo((): PageHeaderAction[] => {
    const moreItems: PageHeaderDropdownItem[] = [
      {
        label: '调试订阅源',
        onClick: () => setPageMode('debug'),
      },
      { separatorOnly: true, label: '' },
      {
        label: '规则自动补全',
        checkbox: {
          checked: () => autoCompleteEnabled(),
          onChange: (checked) => {
            setAutoCompleteEnabled(checked);
            writeRssSourceAutoCompleteEnabled(checked);
          },
        },
      },
    ];
    if (hasLoginUrl()) {
      moreItems.push({
        icon: CookieIcon,
        label: '登录',
        onClick: () => props.onOpenLogin?.(draft()),
      });
    }
    moreItems.push(
      { icon: ScanQrCodeIcon, label: '扫码导入', onClick: () => setQrImportOpen(true) },
      { icon: QrCodeIcon, label: '分享二维码', onClick: () => setShareQrOpen(true) },
      { icon: FileTextIcon, label: '编辑 JSON', onClick: openJsonDialog },
      { label: '复制订阅源', onClick: () => void copySourceJson() },
      { label: '粘贴订阅源', onClick: () => void pasteSourceJson() },
    );

    return [
      {
        icon: MoreIcon,
        label: '更多',
        isDropdown: true,
        dropdownItems: moreItems,
      },
      {
        icon: SaveIcon,
        label: saving() ? '保存中…' : '保存并关闭',
        onClick: () => void handleSave(),
        disabled: saving() || loading(),
        showTooltip: true,
        iconClass: 'text-primary',
      },
    ];
  });

  return (
    <section
      class="fixed inset-0 z-[120] flex flex-col overflow-hidden bg-background"
      role="dialog"
      aria-modal="true"
      aria-label={pageTitle()}
    >
      <PageHeader
        onBack={handleBack}
        title={pageTitle()}
        subtitle={pageDescription()}
        actions={headerActions()}
        pinToTop
        draggable
        class="border-b"
      />

      <div class="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4 pt-2 app-bottom-edge-inset">
        <Show
          when={!loading()}
          fallback={
            <div class="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              加载中…
            </div>
          }
        >
          <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:hidden">
            <Tabs
              value={pageMode()}
              onChange={(v) => setPageMode(v as 'edit' | 'debug')}
              class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
            >
              <TabsList class="mb-2 flex h-auto w-full shrink-0 gap-1 p-1">
                <TabsTrigger
                  value="edit"
                  class="flex-1 text-sm hover:bg-background/60 hover:text-foreground"
                >
                  编辑
                </TabsTrigger>
                <TabsTrigger
                  value="debug"
                  class="flex-1 text-sm hover:bg-background/60 hover:text-foreground"
                >
                  调试
                </TabsTrigger>
              </TabsList>

              <TabsContent value="edit" class="mt-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <EditSectionsTabs />
              </TabsContent>

              <TabsContent
                value="debug"
                class="mt-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
              >
                <DebugPane />
              </TabsContent>
            </Tabs>
          </div>

          <div class="hidden min-h-0 min-w-0 flex-1 overflow-hidden md:flex">
            <Resizable class="size-full min-h-0 min-w-0">
              <ResizablePanel
                initialSize={0.58}
                minSize={RSS_EDIT_PANEL_MIN_SIZE}
                class="flex min-h-0 min-w-0 flex-col pr-1"
              >
                <EditSectionsTabs />
              </ResizablePanel>
              <ResizableHandle withHandle class="mx-1" />
              <ResizablePanel
                initialSize={0.42}
                minSize={RSS_EDIT_PANEL_MIN_SIZE}
                class="flex min-h-0 min-w-0 flex-col pl-1"
              >
                <DebugPane />
              </ResizablePanel>
            </Resizable>
          </div>
        </Show>
      </div>

      <AppDialog open={jsonDialogOpen()} onOpenChange={setJsonDialogOpen}>
        <AppDialogContent
          class="flex max-h-[min(90vh,720px)] max-w-2xl flex-col"
          portalZClass="z-[130]"
        >
          <AppDialogHeader>
            <AppDialogTitle>编辑 JSON</AppDialogTitle>
            <AppDialogDescription>
              直接编辑 Legado 订阅源 JSON，应用后将覆盖当前表单内容。
            </AppDialogDescription>
          </AppDialogHeader>
          <div class="min-h-0 flex-1 px-6 pb-4">
            <SourceCodeEditor
              class="h-[min(56vh,460px)]"
              value={jsonText()}
              onChange={setJsonText}
              language="json"
              ariaLabel="订阅源 JSON"
              minHeight="min(48vh, 340px)"
            />
          </div>
          <AppDialogFooter>
            <Button variant="outline" onClick={() => setJsonDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={applyJson}>应用</Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>

      <AppDialog open={groupDialogOpen()} onOpenChange={setGroupDialogOpen}>
        <AppDialogContent class="max-w-sm" portalZClass="z-[130]">
          <AppDialogHeader>
            <AppDialogTitle>选择分组</AppDialogTitle>
            <AppDialogDescription>将分组追加到「源分组」字段（逗号分隔）</AppDialogDescription>
          </AppDialogHeader>
          <Show
            when={sourceGroups().length > 0}
            fallback={<p class="text-sm text-muted-foreground">暂无已有分组，请直接在源分组中输入</p>}
          >
            <ul class="max-h-60 space-y-1 overflow-y-auto mb-2">
              <For each={sourceGroups()}>
                {(g) => (
                  <li>
                    <button
                      type="button"
                      class="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => appendGroup(g)}
                    >
                      {g}
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
          <AppDialogFooter>
            <Button variant="outline" onClick={() => setGroupDialogOpen(false)}>
              关闭
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>

      <SourceCodeEditDialog
        open={codeEditOpen()}
        target={codeEditTarget()}
        onOpenChange={setCodeEditOpen}
        onApply={applyCodeEdit}
        portalZClass="z-[130]"
      />

      <SourceShareQrDialog
        open={shareQrOpen()}
        onOpenChange={setShareQrOpen}
        jsonText={serializeRssEditSource(draft())}
      />

      <ImportSourceQrDialog
        open={qrImportOpen()}
        onOpenChange={setQrImportOpen}
        portalZClass="z-[130]"
        autoImport
        onIdentify={(raw) => {
          try {
            const parsed = parseRssEditFromText(raw);
            setDraft(parsed);
            showAppToast({ title: '已从二维码导入', variant: 'default' });
          } catch (e) {
            showAppToast({
              title: '导入失败',
              description: e instanceof Error ? e.message : String(e),
              variant: 'destructive',
            });
          }
          setQrImportOpen(false);
        }}
      />
    </section>
  );
}
