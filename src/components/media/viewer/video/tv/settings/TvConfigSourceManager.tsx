/**
 * 单一影视源导入与管理：本地 / 网络 / 代码 + 影视/直播各自选用
 */

import { createSignal, For, Show, createResource, createMemo } from 'solid-js';
import { Download, Pencil, Trash2 } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ImportSourceNetworkDialog } from '@/components/media/reader/sources/ImportSourceNetworkDialog';
import { ImportCodeDialog } from '@/components/shared/ImportCodeDialog';
import { ImportLocalChoiceDialog } from '@/components/shared/ImportLocalChoiceDialog';
import { ImportTvConfigSelectDialog } from '@/components/media/viewer/video/tv/settings/ImportTvConfigSelectDialog';
import { SourceScriptEditDialog } from '@/components/shared/SourceScriptEditDialog';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import { showAppToast } from '@/components/shared/AppToasts';
import { formatTvUserError } from '@/lib/media/tv/tv-user-error';
import {
  downloadTextFile,
  downloadTextFilesZip,
  sanitizeExportFileName,
} from '@/lib/shared/download-source-scripts';
import {
  AppSelect,
  AppSelectContent,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import { request } from '@/lib/http';
import * as TvDao from '@/lib/media/tv/db/tv-dao';
import {
  pickLocalTvConfigDirectory,
  pickLocalTvConfigFiles,
  TV_CONFIG_IMPORT_EXTENSIONS,
} from '@/lib/media/tv/config/pick-local-tv-config';
import {
  identifyTvConfigFromText,
  identifyTvConfigsFromCode,
  identifyTvConfigsFromFiles,
  type IdentifiedTvConfig,
} from '@/lib/media/tv/config/tv-config-import-identify';
import {
  buildTvConfigImportComparisons,
  defaultTvConfigImportSelection,
  type ImportTvConfigComparison,
} from '@/lib/media/tv/config/tv-config-import-compare';
import {
  commitIdentifiedTvConfigs,
  getTvHomeState,
  removeSavedTvConfig,
  setActiveLiveSource,
  setActiveVodSource,
  setSavedTvConfigEnabled,
} from '@/stores/tv-hub/home';
import { AppSwitch, AppSwitchControl, AppSwitchThumb } from '@/components/shared/AppSwitch';
import type { TvConfigRow } from '@/lib/media/tv/types';

const EXT_LABEL = TV_CONFIG_IMPORT_EXTENSIONS.map((e) => `.${e}`).join('、');
const SOURCE_LIST_HEIGHT_CLASS = 'h-80';

type SourceOption = { url: string; label: string };

export function TvConfigSourceManager() {
  const home = getTvHomeState();
  /** 仅在导入/删除后刷新源库列表；勿订阅 configRevision（选用源也会 bump，会抖） */
  const [libraryTick, setLibraryTick] = createSignal(0);
  const [localOpen, setLocalOpen] = createSignal(false);
  const [localBusy, setLocalBusy] = createSignal(false);
  const [onlineOpen, setOnlineOpen] = createSignal(false);
  const [codeOpen, setCodeOpen] = createSignal(false);
  const [selectOpen, setSelectOpen] = createSignal(false);
  const [selectLoading, setSelectLoading] = createSignal(false);
  const [selectLoadingMessage, setSelectLoadingMessage] = createSignal<string>();
  const [identified, setIdentified] = createSignal<IdentifiedTvConfig[]>([]);
  const [comparisons, setComparisons] = createSignal<ImportTvConfigComparison[]>([]);
  const [selectedKeys, setSelectedKeys] = createSignal(new Set<string>());
  const [importing, setImporting] = createSignal(false);
  const [listSelectedIds, setListSelectedIds] = createSignal(new Set<string>());
  const [editTarget, setEditTarget] = createSignal<TvConfigRow | null>(null);
  const [editOpen, setEditOpen] = createSignal(false);
  const [editSaving, setEditSaving] = createSignal(false);
  const [batchDeleteOpen, setBatchDeleteOpen] = createSignal(false);

  const [saved] = createResource(libraryTick, () => TvDao.listTvConfigLibrary());

  const sourceOptions = createMemo(
    (): SourceOption[] => {
      const all = saved() ?? [];
      const activeUrls = new Set(
        [home.configUrl, home.liveConfigUrl].filter(Boolean) as string[],
      );
      return all
        .filter((c) => c.enabled || activeUrls.has(c.url))
        .map((c) => ({
          url: c.url,
          label: c.name || c.url,
        }));
    },
    undefined,
    {
      equals: (a, b) =>
        a.length === b.length && a.every((v, i) => v.url === b[i]?.url && v.label === b[i]?.label),
    },
  );

  const optionUrls = createMemo(
    () => sourceOptions().map((o) => o.url),
    undefined,
    {
      equals: (a, b) => a.length === b.length && a.every((v, i) => v === b[i]),
    },
  );

  const labelOf = (url: string) =>
    sourceOptions().find((o) => o.url === url)?.label ?? url;

  const refreshLibrary = () => setLibraryTick((n) => n + 1);

  const openIdentifyDialog = async (sources: IdentifiedTvConfig[]) => {
    const locals = await TvDao.listTvConfigLibrary();
    const next = buildTvConfigImportComparisons(sources, locals);
    setIdentified(sources);
    setComparisons(next);
    setSelectedKeys(defaultTvConfigImportSelection(next));
    setSelectLoading(false);
    setSelectLoadingMessage(undefined);
    setSelectOpen(true);
  };

  const beginIdentifyLoading = (message: string) => {
    setIdentified([]);
    setComparisons([]);
    setSelectedKeys(new Set<string>());
    setSelectLoading(true);
    setSelectLoadingMessage(message);
    setSelectOpen(true);
  };

  const identifyFromFiles = async (files: File[]) => {
    if (!files.length) {
      showAppToast({ title: '未找到可导入的配置文件', variant: 'warning' });
      return;
    }
    beginIdentifyLoading('正在识别配置…');
    try {
      const sources = await identifyTvConfigsFromFiles(files);
      await openIdentifyDialog(sources);
    } catch (err) {
      setSelectOpen(false);
      showAppToast({
        title: '识别失败',
        description: err instanceof Error ? err.message : String(err),
        variant: 'error',
      });
    }
  };

  const handleLocalPickFile = () => {
    setLocalOpen(false);
    void (async () => {
      setLocalBusy(true);
      try {
        const files = await pickLocalTvConfigFiles();
        if (!files?.length) return;
        await identifyFromFiles(files);
      } catch (err) {
        showAppToast({
          title: '选择文件失败',
          description: err instanceof Error ? err.message : String(err),
          variant: 'error',
        });
      } finally {
        setLocalBusy(false);
      }
    })();
  };

  const handleLocalPickDirectory = () => {
    setLocalOpen(false);
    void (async () => {
      setLocalBusy(true);
      try {
        const picked = await pickLocalTvConfigDirectory();
        if (!picked) return;
        await identifyFromFiles(picked.files);
      } catch (err) {
        showAppToast({
          title: '选择目录失败',
          description: err instanceof Error ? err.message : String(err),
          variant: 'error',
        });
      } finally {
        setLocalBusy(false);
      }
    })();
  };

  const handleOnlineIdentify = (url: string) => {
    void (async () => {
      beginIdentifyLoading('正在下载并识别配置…');
      try {
        const res = await request(url, {
          method: 'GET',
          allowNon2xx: true,
          useBackendHttp: true,
          ignorePageNavigationAbort: true,
        });
        if (res.status >= 400) throw new Error(`下载失败 HTTP ${res.status}`);
        const text = await res.text();
        if (!text.trim()) throw new Error('配置内容为空');
        const one = await identifyTvConfigFromText(text, url);
        await openIdentifyDialog(one ? [one] : []);
      } catch (err) {
        setSelectOpen(false);
        showAppToast({
          title: '网络导入失败',
          description: err instanceof Error ? err.message : String(err),
          variant: 'error',
        });
      }
    })();
  };

  const handleCodeIdentify = (raw: string) => {
    void (async () => {
      beginIdentifyLoading('正在识别配置…');
      try {
        const sources = await identifyTvConfigsFromCode(raw);
        await openIdentifyDialog(sources);
      } catch (err) {
        setSelectOpen(false);
        showAppToast({
          title: '识别失败',
          description: err instanceof Error ? err.message : String(err),
          variant: 'error',
        });
      }
    })();
  };

  const toggleSelected = (key: string, checked: boolean) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const selectAllToggle = () => {
    const all = comparisons();
    if (selectedKeys().size === all.length) setSelectedKeys(new Set<string>());
    else setSelectedKeys(new Set(all.map((c) => c.key)));
  };

  const invertSelect = () => {
    const all = comparisons();
    const cur = selectedKeys();
    setSelectedKeys(new Set(all.filter((c) => !cur.has(c.key)).map((c) => c.key)));
  };

  const selectNewToggle = () => {
    setSelectedKeys(new Set(comparisons().filter((c) => c.isNew).map((c) => c.key)));
  };

  const selectUpdateToggle = () => {
    setSelectedKeys(new Set(comparisons().filter((c) => c.isUpdate).map((c) => c.key)));
  };

  const confirmImport = () => {
    void (async () => {
      const keys = selectedKeys();
      const sources = comparisons()
        .filter((c) => keys.has(c.key))
        .map((c) => c.source);
      if (!sources.length) return;
      setImporting(true);
      setSelectOpen(false);
      try {
        const n = await commitIdentifiedTvConfigs(sources);
        refreshLibrary();
        const h = getTvHomeState();
        showAppToast({
          title: '影视源已导入',
          description: `已写入 ${n} 项 · 站点 ${h.siteCount} · 直播 ${h.liveCount}`,
        });
        // 再刷一次，避免与异步启用竞态
        refreshLibrary();
      } catch (err) {
        showAppToast({
          title: '导入失败',
          description: formatTvUserError(err),
          variant: 'error',
        });
      } finally {
        setImporting(false);
      }
    })();
  };

  const busy = () => importing() || localBusy();

  const listSelectedCount = () => listSelectedIds().size;

  const toggleListSelected = (id: string, checked: boolean) => {
    setListSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleListSelectAll = () => {
    const all = saved() ?? [];
    setListSelectedIds((prev) =>
      prev.size === all.length ? new Set<string>() : new Set(all.map((c) => c.id)),
    );
  };

  const clearListSelection = () => setListSelectedIds(new Set<string>());

  const invertListSelection = () => {
    const all = saved() ?? [];
    setListSelectedIds((prev) => {
      const next = new Set<string>();
      for (const c of all) {
        if (!prev.has(c.id)) next.add(c.id);
      }
      return next;
    });
  };

  const openEdit = (c: TvConfigRow) => {
    setEditTarget(c);
    setEditOpen(true);
  };

  const exportOne = (c: TvConfigRow) => {
    const content = c.json?.trim() ? c.json : '{}';
    downloadTextFile(content, `${sanitizeExportFileName(c.name || c.url)}.json`, 'application/json;charset=utf-8');
    showAppToast({ title: '已导出', description: c.name || c.url });
  };

  const batchExport = () => {
    const all = saved() ?? [];
    const selected = all.filter((c) => listSelectedIds().has(c.id));
    if (!selected.length) return;
    if (selected.length === 1) {
      exportOne(selected[0]!);
      clearListSelection();
      return;
    }
    downloadTextFilesZip(
      selected.map((c) => ({
        name: `${sanitizeExportFileName(c.name || c.url)}.json`,
        content: c.json?.trim() ? c.json : '{}',
      })),
      `影视源_${selected.length}个_${Date.now()}.zip`,
    );
    showAppToast({ title: '已导出', description: `已打包 ${selected.length} 个影视源` });
    clearListSelection();
  };

  const batchDelete = () => {
    void (async () => {
      for (const id of listSelectedIds()) {
        await removeSavedTvConfig(id);
      }
      clearListSelection();
      setBatchDeleteOpen(false);
      refreshLibrary();
      showAppToast({ title: '已删除', description: '所选影视源已移除' });
    })();
  };

  const saveEditedConfig = async (json: string) => {
    const target = editTarget();
    if (!target) return;
    setEditSaving(true);
    try {
      const identified = await identifyTvConfigFromText(json, target.url);
      if (!identified) throw new Error('配置格式无效，请检查 JSON');
      await TvDao.upsertTvConfig({
        id: target.id,
        url: target.url,
        name: identified.name || target.name,
        type: target.type,
        json: identified.json,
        updatedAt: Date.now(),
        enabled: target.enabled,
      });
      refreshLibrary();
      const h = getTvHomeState();
      if (h.configUrl === target.url) {
        await setActiveVodSource(target.url);
      } else if (h.liveConfigUrl === target.url) {
        await setActiveLiveSource(target.url);
      }
      showAppToast({ title: '已保存', description: identified.name || target.name });
    } catch (err) {
      showAppToast({
        title: '保存失败',
        description: formatTvUserError(err),
        variant: 'error',
      });
      throw err;
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div class="space-y-4">
      <div class="space-y-2">
        <h3 class="text-sm font-semibold">影视源</h3>
        <p class="text-xs text-muted-foreground">
          统一导入与管理；下方分别选择影视首页与直播页使用的源（可相同或不同）
        </p>
        <div class="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={busy()} onClick={() => setLocalOpen(true)}>
            本地导入
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy()}
            onClick={() => setOnlineOpen(true)}
          >
            网络导入
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy()}
            onClick={() => setCodeOpen(true)}
          >
            代码导入
          </Button>
        </div>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <div class="space-y-1.5">
          <p class="text-xs font-medium text-muted-foreground">影视使用</p>
          <AppSelect
            value={home.configUrl || null}
            onChange={(url) => {
              if (!url || url === home.configUrl) return;
              void setActiveVodSource(url);
            }}
            options={optionUrls()}
            itemComponent={(itemProps) => (
              <AppSelectItem item={itemProps.item}>
                {labelOf(String(itemProps.item.rawValue))}
              </AppSelectItem>
            )}
          >
            <AppSelectTrigger layout="form" class="h-9" aria-label="影视使用的源" disabled={busy()}>
              <AppSelectValue>
                {(sel) => {
                  const raw = sel.selectedOption();
                  return raw != null ? labelOf(String(raw)) : '选择影视源';
                }}
              </AppSelectValue>
              <AppSelectIcon />
            </AppSelectTrigger>
            <AppSelectContent>
              <AppSelectListbox />
            </AppSelectContent>
          </AppSelect>
        </div>
        <div class="space-y-1.5">
          <p class="text-xs font-medium text-muted-foreground">直播使用</p>
          <AppSelect
            value={home.liveConfigUrl || null}
            onChange={(url) => {
              if (!url || url === home.liveConfigUrl) return;
              void setActiveLiveSource(url);
            }}
            options={optionUrls()}
            itemComponent={(itemProps) => (
              <AppSelectItem item={itemProps.item}>
                {labelOf(String(itemProps.item.rawValue))}
              </AppSelectItem>
            )}
          >
            <AppSelectTrigger layout="form" class="h-9" aria-label="直播使用的源" disabled={busy()}>
              <AppSelectValue>
                {(sel) => {
                  const raw = sel.selectedOption();
                  return raw != null ? labelOf(String(raw)) : '选择直播源';
                }}
              </AppSelectValue>
              <AppSelectIcon />
            </AppSelectTrigger>
            <AppSelectContent>
              <AppSelectListbox />
            </AppSelectContent>
          </AppSelect>
          <Show when={home.liveSyncedFromVod && home.liveConfigUrl === home.configUrl}>
            <p class="text-[11px] text-muted-foreground">当前与影视同源</p>
          </Show>
        </div>
      </div>

      <div class="space-y-1.5">
        <p class="text-xs font-medium text-muted-foreground">已保存源</p>
        <Show when={saved.loading}>
          <div class={`flex ${SOURCE_LIST_HEIGHT_CLASS} items-center justify-center rounded-md border text-xs text-muted-foreground`}>
            加载中…
          </div>
        </Show>
        <Show when={!saved.loading && !(saved()?.length ?? 0)}>
          <div class={`flex ${SOURCE_LIST_HEIGHT_CLASS} items-center justify-center rounded-md border text-sm text-muted-foreground`}>
            暂无历史源，请先导入
          </div>
        </Show>
        <Show when={!saved.loading && (saved()?.length ?? 0) > 0}>
          <ul class={`${SOURCE_LIST_HEIGHT_CLASS} space-y-2 overflow-y-auto rounded-md border p-2`}>
            <For each={saved() ?? []}>
              {(c) => {
                const usedVod = () => c.url === home.configUrl;
                const usedLive = () => c.url === home.liveConfigUrl;
                const liveHint = () => {
                  if (!home.liveNote) return '';
                  if (home.liveConfigUrl) return usedLive() ? home.liveNote : '';
                  return usedVod() ? home.liveNote : '';
                };
                return (
                  <li class="flex items-center gap-2 rounded-md border border-border/50 px-2 py-1.5 text-sm">
                    <div
                      class="shrink-0"
                      onClick={(e: MouseEvent) => e.stopPropagation()}
                      role="presentation"
                    >
                      <Checkbox
                        checked={listSelectedIds().has(c.id)}
                        onChange={(checked) => toggleListSelected(c.id, checked)}
                        aria-label={`选择 ${c.name || c.url}`}
                      />
                    </div>
                    <div class="min-w-0 flex-1">
                      <p class="truncate font-medium">{c.name || c.url}</p>
                      <p class="truncate text-[11px] text-muted-foreground">{c.url}</p>
                      <p class="text-[11px] text-muted-foreground">
                        <Show when={usedVod()}>
                          <span class="mr-2 text-primary">影视</span>
                        </Show>
                        <Show when={usedLive()}>
                          <span class="text-primary">直播</span>
                        </Show>
                        <Show when={!usedVod() && !usedLive()}>未使用</Show>
                        <Show when={!c.enabled}>
                          <span class="ml-2 text-muted-foreground">已禁用</span>
                        </Show>
                      </p>
                      <Show when={liveHint()}>
                        <p class="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">{liveHint()}</p>
                      </Show>
                    </div>
                    <AppSwitch
                      checked={c.enabled}
                      disabled={busy()}
                      onChange={(checked) => {
                        void setSavedTvConfigEnabled(c.id, checked).then(() => refreshLibrary());
                      }}
                      aria-label={`启用源 ${c.name || c.url}`}
                    >
                      <AppSwitchControl>
                        <AppSwitchThumb />
                      </AppSwitchControl>
                    </AppSwitch>
                    <AppTooltip>
                      <AppTooltipTrigger as="div">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          class="h-8 w-8 shrink-0"
                          disabled={busy()}
                          aria-label={`编辑 ${c.name || c.url}`}
                          onClick={() => openEdit(c)}
                        >
                          <Pencil class="h-4 w-4" />
                        </Button>
                      </AppTooltipTrigger>
                      <AppTooltipContent layer="viewer">编辑配置</AppTooltipContent>
                    </AppTooltip>
                    <AppTooltip>
                      <AppTooltipTrigger as="div">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          class="h-8 w-8 shrink-0"
                          disabled={busy()}
                          aria-label={`导出 ${c.name || c.url}`}
                          onClick={() => exportOne(c)}
                        >
                          <Download class="h-4 w-4" />
                        </Button>
                      </AppTooltipTrigger>
                      <AppTooltipContent layer="viewer">导出配置</AppTooltipContent>
                    </AppTooltip>
                    <AppTooltip>
                      <AppTooltipTrigger as="div">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          class="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={busy()}
                          aria-label={`删除 ${c.name || c.url}`}
                          onClick={() =>
                            void removeSavedTvConfig(c.id).then(() => refreshLibrary())
                          }
                        >
                          <Trash2 class="h-4 w-4" />
                        </Button>
                      </AppTooltipTrigger>
                      <AppTooltipContent layer="viewer">删除源</AppTooltipContent>
                    </AppTooltip>
                  </li>
                );
              }}
            </For>
          </ul>

          <div class="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 px-2 py-2">
            <div class="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={toggleListSelectAll}>
                {listSelectedIds().size === (saved()?.length ?? 0) ? '取消全选' : '全选'}
                ({listSelectedCount()}/{saved()?.length ?? 0})
              </Button>
              <Button variant="outline" size="sm" onClick={clearListSelection} disabled={listSelectedCount() === 0}>
                取消选中
              </Button>
              <Button variant="outline" size="sm" onClick={invertListSelection} disabled={(saved()?.length ?? 0) === 0}>
                反选
              </Button>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={batchExport} disabled={listSelectedCount() === 0 || busy()}>
                导出所选
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setBatchDeleteOpen(true)}
                disabled={listSelectedCount() === 0 || busy()}
              >
                删除所选
              </Button>
            </div>
          </div>
        </Show>
      </div>

      <ImportLocalChoiceDialog
        open={localOpen()}
        busy={localBusy()}
        onOpenChange={setLocalOpen}
        onPickFile={handleLocalPickFile}
        onPickDirectory={handleLocalPickDirectory}
        title="本地导入影视源"
        description={`选择单个配置文件，或扫描文件夹中的 ${EXT_LABEL}。`}
        fileButtonHint="可一次选择多个 json / txt"
        directoryButtonHint="扫描文件夹内全部配置文件"
      />
      <ImportSourceNetworkDialog
        open={onlineOpen()}
        onOpenChange={setOnlineOpen}
        title="网络导入影视源"
        description="输入配置 JSON 链接。桌面端由应用内网络拉取。"
        placeholder="https://example.com/api.json"
        onIdentify={handleOnlineIdentify}
      />
      <ImportCodeDialog
        open={codeOpen()}
        onOpenChange={setCodeOpen}
        title="粘贴影视配置 JSON"
        description="粘贴完整配置文本后识别导入。"
        onIdentify={handleCodeIdentify}
      />
      <ImportTvConfigSelectDialog
        open={selectOpen()}
        loading={selectLoading()}
        loadingMessage={selectLoadingMessage()}
        sources={identified()}
        comparisons={comparisons()}
        selectedKeys={selectedKeys()}
        onOpenChange={setSelectOpen}
        onToggle={toggleSelected}
        onSelectAllToggle={selectAllToggle}
        onInvertSelect={invertSelect}
        onSelectNewToggle={selectNewToggle}
        onSelectUpdateToggle={selectUpdateToggle}
        onConfirm={confirmImport}
      />
      <SourceScriptEditDialog
        open={editOpen()}
        onOpenChange={setEditOpen}
        title={editTarget() ? `编辑 · ${editTarget()!.name || editTarget()!.url}` : '编辑影视源'}
        description="直接编辑配置 JSON，保存后将重新加载当前使用的源。"
        initialValue={editTarget()?.json ?? ''}
        language="json"
        saving={editSaving()}
        onSave={saveEditedConfig}
        portalZClass="z-[70]"
      />
      <AppDialog open={batchDeleteOpen()} onOpenChange={setBatchDeleteOpen}>
        <AppDialogContent class="max-w-sm" portalZClass="z-[70]">
          <AppDialogHeader>
            <AppDialogTitle>删除所选影视源</AppDialogTitle>
            <AppDialogDescription>
              确定删除已选的 {listSelectedCount()} 个影视源吗？此操作不可撤销。
            </AppDialogDescription>
          </AppDialogHeader>
          <AppDialogFooter>
            <Button variant="outline" onClick={() => setBatchDeleteOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={batchDelete} disabled={busy()}>
              删除
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>
    </div>
  );
}
