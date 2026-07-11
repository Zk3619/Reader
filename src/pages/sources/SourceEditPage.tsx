/**
 * 书源编辑页（对齐 Legado Max BookSourceEditActivity + web SourceEditor）
 */

import { createSignal, Show, For, onMount, onCleanup, createEffect, createMemo, type JSX } from 'solid-js';
import { useBackHandler } from '@/lib/navigation/use-back-handler';
import {
  APP_SOURCE_EDIT_DIALOG_Z,
  APP_SOURCE_EDIT_LAYER_Z,
} from '@/lib/ui/overlay-z';
import { cn } from '@/lib/utils';
import {
  PageHeader,
  type PageHeaderAction,
  type PageHeaderDropdownItem,
} from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { AppSwitch, AppSwitchControl, AppSwitchThumb } from '@/components/shared/AppSwitch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AppTextField, AppTextFieldInput, AppTextFieldTextArea } from '@/components/shared/AppTextField';
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
import { SourceDebugPanel } from '@/components/sources/SourceDebugPanel';
import { createSourceDebugPanelStore } from '@/lib/book-source/source-debug-panel-store';
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
  BOOK_SOURCE_EDIT_SECTIONS,
  type BookSourceEditField,
} from '@/lib/book-source/book-source-edit-config';
import {
  createEmptyLegadoEditSource,
  loadLegadoEditSource,
  saveLegadoEditSource,
  serializeLegadoEditSource,
  parseLegadoEditFromText,
  getEditFieldValue,
  setEditFieldValue,
  legadoEditSnapshot,
  legadoEditToBookSource,
  readBookSourceAutoCompleteEnabled,
  writeBookSourceAutoCompleteEnabled,
  type LegadoEditSource,
} from '@/lib/book-source/legado-source-editor';
import * as sourcesDb from '@/lib/database/sources';
import type { BookSource } from '@/types';

/** 书源规则多行输入：最小高度 + 随内容增高，超出后内部滚动 */
const SOURCE_EDIT_TEXTAREA_CLASS =
  'min-h-[4.5rem] max-h-60 resize-none overflow-y-auto [field-sizing:content]';

/** 编辑 / 调试分栏最小占比（corvu resizable 0–1） */
const SOURCE_EDIT_PANEL_MIN_SIZE = 0.28;

export interface SourceEditPageProps {
  /** 已有书源 URL；省略则为新建 */
  sourceUrl?: string;
  onClose: () => void;
  onSaved?: (source: BookSource) => void;
  /** 打开书源登录（loginUrl / loginUi） */
  onOpenLogin?: (source: BookSource) => void;
  /** 设置书源变量（对齐 Legado 设置源变量） */
  onOpenSourceVariables?: (source: BookSource) => void;
  /** 识别二维码导入书源（由 App 走统一导入流程） */
  onImportFromQr?: (raw: string) => void;
}

export function SourceEditPage(props: SourceEditPageProps) {
  const isNew = () => !props.sourceUrl;
  const [draft, setDraft] = createSignal<LegadoEditSource>(createEmptyLegadoEditSource());
  const [baseline, setBaseline] = createSignal('');
  const [loading, setLoading] = createSignal(!!props.sourceUrl);
  const [saving, setSaving] = createSignal(false);
  const [jsonDialogOpen, setJsonDialogOpen] = createSignal(false);
  const [jsonText, setJsonText] = createSignal('');
  const [groupDialogOpen, setGroupDialogOpen] = createSignal(false);
  const [sourceGroups, setSourceGroups] = createSignal<string[]>([]);
  const [activeTab, setActiveTab] = createSignal(BOOK_SOURCE_EDIT_SECTIONS[0].key);
  const [pageMode, setPageMode] = createSignal<'edit' | 'debug'>('edit');
  const [autoCompleteEnabled, setAutoCompleteEnabled] = createSignal(
    readBookSourceAutoCompleteEnabled(),
  );
  const [codeEditTarget, setCodeEditTarget] = createSignal<SourceCodeEditTarget | null>(null);
  const [codeEditOpen, setCodeEditOpen] = createSignal(false);
  const [shareQrOpen, setShareQrOpen] = createSignal(false);
  const [qrImportOpen, setQrImportOpen] = createSignal(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = createSignal(false);
  const debugStore = createSourceDebugPanelStore();

  const isDirty = () => baseline() !== legadoEditSnapshot(draft());
  const checkKeyword = () => draft().ruleSearch?.checkKeyWord?.trim() || '我的';
  const hasLoginUrl = () => Boolean(draft().loginUrl?.trim());
  const pageTitle = () => (isNew() ? '新建书源' : '编辑书源');
  const pageDescription = () =>
    isNew() ? '填写书源规则后保存' : draft().bookSourceName || props.sourceUrl || '';

  const debugSource = () => {
    try {
      return legadoEditToBookSource(draft());
    } catch {
      return null;
    }
  };

  onMount(async () => {
    void debugStore.initHttp();
    try {
      const groups = await sourcesDb.getAllSourceGroups();
      setSourceGroups(groups);
    } catch {
      /* ignore */
    }
    if (!props.sourceUrl) {
      const empty = createEmptyLegadoEditSource();
      setDraft(empty);
      setBaseline(legadoEditSnapshot(empty));
      setLoading(false);
      return;
    }
    try {
      const edit = await loadLegadoEditSource(props.sourceUrl);
      setDraft(edit);
      setBaseline(legadoEditSnapshot(edit));
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
    void debugStore.loadExploreSections(debugSource());
  });

  function cloneDraft(prev: LegadoEditSource): LegadoEditSource {
    return {
      ...prev,
      ruleSearch: { ...prev.ruleSearch },
      ruleExplore: { ...prev.ruleExplore },
      ruleBookInfo: { ...prev.ruleBookInfo },
      ruleToc: { ...prev.ruleToc },
      ruleContent: { ...prev.ruleContent },
    };
  }

  function updateDraft(updater: (prev: LegadoEditSource) => LegadoEditSource) {
    setDraft((prev) => updater(cloneDraft(prev)));
  }

  function requestLeave() {
    if (isDirty()) {
      setLeaveDialogOpen(true);
      return;
    }
    props.onClose();
  }

  function handleBack() {
    if (leaveDialogOpen()) {
      setLeaveDialogOpen(false);
      return;
    }
    requestLeave();
  }

  useBackHandler(() => () => {
    if (leaveDialogOpen()) {
      setLeaveDialogOpen(false);
      return true;
    }
    if (isDirty()) {
      setLeaveDialogOpen(true);
      return true;
    }
    props.onClose();
    return true;
  });

  async function persistDraft(): Promise<boolean> {
    setSaving(true);
    try {
      const saved = await saveLegadoEditSource(draft(), props.sourceUrl, {
        autoComplete: autoCompleteEnabled(),
      });
      setBaseline(legadoEditSnapshot(draft()));
      showAppToast({ title: isNew() ? '书源已创建' : '书源已保存', variant: 'default' });
      props.onSaved?.(saved);
      return true;
    } catch (e) {
      showAppToast({
        title: '保存失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    if (await persistDraft()) {
      props.onClose();
    }
  }

  async function handleLeaveSaveAndExit() {
    if (await persistDraft()) {
      setLeaveDialogOpen(false);
      props.onClose();
    }
  }

  function handleLeaveDiscard() {
    setLeaveDialogOpen(false);
    props.onClose();
  }

  function openJsonDialog() {
    setJsonText(serializeLegadoEditSource(draft()));
    setJsonDialogOpen(true);
  }

  function applyJson() {
    try {
      const parsed = parseLegadoEditFromText(jsonText());
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
      await navigator.clipboard.writeText(serializeLegadoEditSource(draft()));
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
      const parsed = parseLegadoEditFromText(text);
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
      const current = prev.bookSourceGroup?.trim() ?? '';
      const parts = current ? current.split(',').map((s) => s.trim()).filter(Boolean) : [];
      if (!parts.includes(group)) parts.push(group);
      return { ...prev, bookSourceGroup: parts.join(',') };
    });
    setGroupDialogOpen(false);
  }

  async function persistDraftForDebug(): Promise<BookSource | null> {
    const d = draft();
    if (!d.bookSourceUrl.trim() || !d.bookSourceName.trim()) {
      return null;
    }
    try {
      return await saveLegadoEditSource(d, props.sourceUrl, {
        autoComplete: autoCompleteEnabled(),
      });
    } catch {
      return legadoEditToBookSource(d);
    }
  }

  function openCodeEdit(field: BookSourceEditField, sectionKey: string) {
    const value = getEditFieldValue(draft(), field);
    setCodeEditTarget({
      title: field.title,
      value: value === undefined ? '' : String(value),
      tabKey: sectionKey,
      fieldKey: field.namespace ? `${field.namespace}.${field.id}` : field.id,
    });
    setCodeEditOpen(true);
  }

  function applyCodeEdit(value: string, meta: { tabKey: string; fieldKey: string }) {
    const [namespace, id] = meta.fieldKey.includes('.')
      ? (meta.fieldKey.split('.') as [string, string])
      : [undefined, meta.fieldKey];
    const field: BookSourceEditField = {
      title: meta.fieldKey,
      id: id!,
      type: 'String',
      namespace,
    };
    updateDraft((prev) => {
      setEditFieldValue(prev, field, value);
      return prev;
    });
  }

  function renderField(field: BookSourceEditField, sectionKey: string): JSX.Element {
    const value = () => getEditFieldValue(draft(), field);

    if (field.type === 'Boolean') {
      const checked = () => Boolean(value());
      return (
        <div class="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
          <div class="min-w-0">
            <div class="text-sm font-medium text-foreground">{field.title}</div>
          </div>
          <AppSwitch
            checked={checked()}
            onChange={(v) =>
              updateDraft((prev) => {
                setEditFieldValue(prev, field, v);
                return prev;
              })
            }
          >
            <AppSwitchControl>
              <AppSwitchThumb />
            </AppSwitchControl>
          </AppSwitch>
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
          <AppTextField>
            <AppTextFieldInput
              type="number"
              min={0}
              value={numValue()}
              onInput={(e) =>
                updateDraft((prev) => {
                  setEditFieldValue(prev, field, Number(e.currentTarget.value) || 0);
                  return prev;
                })
              }
            />
          </AppTextField>
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
                setEditFieldValue(prev, field, v);
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
            <AppSelectContent portalZClass={APP_SOURCE_EDIT_DIALOG_Z}>
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
            <Show when={field.id === 'bookSourceGroup'}>
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
        <AppTextField>
          <AppTextFieldTextArea
            class={SOURCE_EDIT_TEXTAREA_CLASS}
            placeholder={field.hint}
            value={strValue()}
            onInput={(e) =>
              updateDraft((prev) => {
                setEditFieldValue(prev, field, e.currentTarget.value);
                return prev;
              })
            }
          />
        </AppTextField>
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
        <For each={BOOK_SOURCE_EDIT_SECTIONS}>
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
        <For each={BOOK_SOURCE_EDIT_SECTIONS}>
          {(section) => (
            <TabsContent value={section.key} class="mt-0 space-y-4 pb-8">
              <For each={section.children}>
                {(field) => renderField(field, section.key)}
              </For>
            </TabsContent>
          )}
        </For>
      </div>
    </Tabs>
  );

  const DebugPane = () => (
    <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <SourceDebugPanel
        store={debugStore}
        source={debugSource}
        checkKeyword={checkKeyword}
        onBeforeDebug={persistDraftForDebug}
      />
    </div>
  );

  const headerActions = createMemo((): PageHeaderAction[] => {
    const moreItems: PageHeaderDropdownItem[] = [
      {
        label: '调试书源',
        onClick: () => setPageMode('debug'),
      },
      { separatorOnly: true, label: '' },
      {
        label: '规则自动补全',
        checkbox: {
          checked: () => autoCompleteEnabled(),
          onChange: (checked) => {
            setAutoCompleteEnabled(checked);
            writeBookSourceAutoCompleteEnabled(checked);
          },
        },
      },
    ];
    if (hasLoginUrl()) {
      moreItems.push({
        icon: CookieIcon,
        label: '登录',
        onClick: () => props.onOpenLogin?.(legadoEditToBookSource(draft())),
      });
    }
    moreItems.push({
      icon: FileTextIcon,
      label: '设置源变量',
      onClick: () => {
        try {
          props.onOpenSourceVariables?.(legadoEditToBookSource(draft()));
        } catch {
          showAppToast({
            title: '无法打开',
            description: '请先填写源域名与源名称',
            variant: 'destructive',
          });
        }
      },
    });
    moreItems.push(
      { icon: ScanQrCodeIcon, label: '扫码导入', onClick: () => setQrImportOpen(true) },
      { icon: QrCodeIcon, label: '分享二维码', onClick: () => setShareQrOpen(true) },
      { icon: FileTextIcon, label: '编辑 JSON', onClick: openJsonDialog },
      { label: '复制书源', onClick: () => void copySourceJson() },
      { label: '粘贴书源', onClick: () => void pasteSourceJson() },
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
      class={cn(
        'pointer-events-auto fixed inset-0 flex flex-col overflow-hidden bg-background',
        APP_SOURCE_EDIT_LAYER_Z,
      )}
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
          {/* 窄屏：编辑 / 调试分页（md 以下独占） */}
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

          {/* 宽屏：左右分栏（外层 hidden，避免 Resizable 内联 display 覆盖断点） */}
          <div class="hidden min-h-0 min-w-0 flex-1 overflow-hidden md:flex">
            <Resizable class="size-full min-h-0 min-w-0">
              <ResizablePanel
                initialSize={0.58}
                minSize={SOURCE_EDIT_PANEL_MIN_SIZE}
                class="flex min-h-0 min-w-0 flex-col pr-1"
              >
                <EditSectionsTabs />
              </ResizablePanel>
              <ResizableHandle withHandle class="mx-1" />
              <ResizablePanel
                initialSize={0.42}
                minSize={SOURCE_EDIT_PANEL_MIN_SIZE}
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
          portalZClass={APP_SOURCE_EDIT_DIALOG_Z}
        >
          <AppDialogHeader>
            <AppDialogTitle>编辑 JSON</AppDialogTitle>
            <AppDialogDescription>直接编辑 Legado 书源 JSON，应用后将覆盖当前表单内容。</AppDialogDescription>
          </AppDialogHeader>
          <div class="min-h-0 flex-1 px-6 pb-4">
            <SourceCodeEditor
              class="h-[min(56vh,460px)]"
              value={jsonText()}
              onChange={setJsonText}
              language="json"
              ariaLabel="书源 JSON"
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
        <AppDialogContent class="max-w-sm">
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
        portalZClass={APP_SOURCE_EDIT_DIALOG_Z}
      />

      <SourceShareQrDialog
        open={shareQrOpen()}
        onOpenChange={setShareQrOpen}
        jsonText={serializeLegadoEditSource(draft())}
      />

      <ImportSourceQrDialog
        open={qrImportOpen()}
        onOpenChange={setQrImportOpen}
        portalZClass={APP_SOURCE_EDIT_DIALOG_Z}
        autoImport
        onIdentify={(raw) => {
          props.onImportFromQr?.(raw);
          setQrImportOpen(false);
        }}
      />

      <AppDialog open={leaveDialogOpen()} onOpenChange={setLeaveDialogOpen}>
        <AppDialogContent class="max-w-sm" portalZClass={APP_SOURCE_EDIT_DIALOG_Z}>
          <AppDialogHeader>
            <AppDialogTitle>未保存的修改</AppDialogTitle>
            <AppDialogDescription>
              当前书源有未保存的修改，离开前请选择如何处理。
            </AppDialogDescription>
          </AppDialogHeader>
          <AppDialogFooter class="flex-col gap-2 sm:flex-col sm:space-x-0">
            <Button
              class="w-full"
              onClick={() => void handleLeaveSaveAndExit()}
              disabled={saving()}
            >
              {saving() ? '保存中…' : '保存并退出'}
            </Button>
            <Button
              variant="outline"
              class="w-full"
              onClick={handleLeaveDiscard}
              disabled={saving()}
            >
              不保存退出
            </Button>
            <Button
              variant="ghost"
              class="w-full"
              onClick={() => setLeaveDialogOpen(false)}
              disabled={saving()}
            >
              取消
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>
    </section>
  );
}
