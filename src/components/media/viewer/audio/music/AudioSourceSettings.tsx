/** 音源设置（对齐 lx：单一活跃 UserApi + 本地/在线/代码导入） */
import { createSignal, For, onCleanup, onMount, Show, type Component } from 'solid-js';
import { Download, LoaderCircle, Pencil, Trash2 } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { AppSwitch, AppSwitchControl, AppSwitchThumb } from '@/components/shared/AppSwitch';
import {
  getDefaultUserApiId,
  importUserApiScript,
  listUserApiScripts,
  removeUserApiScript,
  setUserApiDefaultScript,
  setUserApiScriptEnabled,
  setUserApiAllowShowUpdateAlert,
  subscribeUserApiScripts,
  ensureUserApiScriptsInitialized,
} from '@/lib/media/audio/online/user-api-engine';
import {
  getUserApiInitMode,
  setUserApiInitMode,
  type UserApiInitMode,
} from '@/lib/media/audio/online/user-api-update-prefs';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import {
  AppManualRadioGroup,
  AppManualRadioOption,
} from '@/components/shared/AppManualRadio';
import { AudioPanelShell } from '@/components/media/viewer/audio/music/AudioPanelShell';
import { request } from '@/lib/http';
import { MusicAppSelect } from '@/components/media/viewer/audio/music/MusicAppSelect';
import { ImportSourceNetworkDialog } from '@/components/media/reader/sources/ImportSourceNetworkDialog';
import { ImportCodeDialog } from '@/components/shared/ImportCodeDialog';
import { ImportUserApiLocalDialog } from '@/components/media/viewer/audio/music/ImportUserApiLocalDialog';
import { ImportUserApiSelectDialog } from '@/components/media/viewer/audio/music/ImportUserApiSelectDialog';
import { pickLocalUserApiFiles } from '@/lib/media/audio/online/pick-local-user-api-file';
import { pickLocalUserApiDirectory } from '@/lib/media/audio/online/pick-local-user-api-directory';
import {
  identifyUserApiScriptFromText,
  identifyUserApiScriptsFromCode,
  identifyUserApiScriptsFromFiles,
  type IdentifiedUserApiScript,
} from '@/lib/media/audio/online/user-api-import-identify';
import {
  buildUserApiImportComparisons,
  defaultUserApiImportSelection,
  type ImportUserApiComparison,
} from '@/lib/media/audio/online/user-api-import-compare';
import { openUrlInBrowser } from '@/lib/platform/open-url';
import { showAppToast } from '@/components/shared/AppToasts';
import { toUserFacingMusicError } from '@/lib/media/audio/music-user-error';
import { SourceScriptEditDialog } from '@/components/shared/SourceScriptEditDialog';
import {
  downloadTextFile,
  downloadTextFilesZip,
  sanitizeExportFileName,
} from '@/lib/shared/download-source-scripts';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';

const SOURCE_LIST_HEIGHT_CLASS = 'h-80';

export interface AudioSourceSettingsProps {
  open: boolean;
  onClose?: () => void;
  inline?: boolean;
}

const USER_API_README_URL = 'https://lyswhut.github.io/lx-music-doc/desktop/custom-source';
const MAX_USER_API_COUNT = 20;

/** 统一展示为 v1.2.0；脚本 @version 已带 v/V 时不再重复前缀 */
function formatUserApiVersionLabel(version: string): string {
  const raw = version.trim();
  if (!raw) return '';
  return /^\d/.test(raw) ? `v${raw}` : raw;
}

export const AudioSourceSettings: Component<AudioSourceSettingsProps> = (props) => {
  const [listRevision, setListRevision] = createSignal(0);
  const userApis = () => {
    listRevision();
    return listUserApiScripts().filter((s) => s.initStatus !== 'failed');
  };
  const [defaultId, setDefaultId] = createSignal(getDefaultUserApiId() ?? '');
  const [initMode, setInitMode] = createSignal<UserApiInitMode>(getUserApiInitMode());
  const [importing, setImporting] = createSignal(false);
  const [localChoiceOpen, setLocalChoiceOpen] = createSignal(false);
  const [localBusy, setLocalBusy] = createSignal(false);
  const [onlineOpen, setOnlineOpen] = createSignal(false);
  const [codeOpen, setCodeOpen] = createSignal(false);
  const [selectOpen, setSelectOpen] = createSignal(false);
  const [selectLoading, setSelectLoading] = createSignal(false);
  const [selectLoadingMessage, setSelectLoadingMessage] = createSignal<string | undefined>();
  const [identifiedSources, setIdentifiedSources] = createSignal<IdentifiedUserApiScript[]>([]);
  const [comparisons, setComparisons] = createSignal<ImportUserApiComparison[]>([]);
  const [selectedIds, setSelectedIds] = createSignal(new Set<string>());
  const [listSelectedIds, setListSelectedIds] = createSignal(new Set<string>());
  const [editTarget, setEditTarget] = createSignal<{ id: string; name: string; script: string } | null>(null);
  const [editOpen, setEditOpen] = createSignal(false);
  const [editSaving, setEditSaving] = createSignal(false);
  const [batchDeleteOpen, setBatchDeleteOpen] = createSignal(false);

  onMount(() => {
    const unsub = subscribeUserApiScripts(() => {
      setListRevision((v) => v + 1);
      setDefaultId(getDefaultUserApiId() ?? '');
    });
    onCleanup(() => {
      unsub();
    });
  });

  const canUseScript = (s: ReturnType<typeof listUserApiScripts>[number]) =>
    s.initStatus === 'ready';

  const initStatusIndicator = (
    status: ReturnType<typeof listUserApiScripts>[number]['initStatus'],
  ) => {
    if (status === 'ready') {
      return {
        class: 'bg-success-foreground',
        label: '初始化成功',
        pulse: false,
      };
    }
    if (status === 'failed') {
      return {
        class: 'bg-destructive',
        label: '初始化失败',
        pulse: false,
      };
    }
    return {
      class: 'bg-warning-foreground',
      label: '正在初始化',
      pulse: true,
    };
  };

  const setActive = (id: string) => {
    setUserApiDefaultScript(id);
    setDefaultId(id);
  };

  /** 仅新增计入容量；更新覆盖不占新名额 */
  const ensureImportCapacity = (newCount: number): boolean => {
    if (userApis().length + newCount <= MAX_USER_API_COUNT) return true;
    showAppToast({
      title: '自定义源数量已达上限',
      description:
        '最多只能同时存在 20 个源。想要继续导入的话，请先移除一些旧的源腾出位置吧',
      variant: 'warning',
    });
    return false;
  };

  const openIdentifyDialog = (sources: IdentifiedUserApiScript[]) => {
    const nextComparisons = buildUserApiImportComparisons(sources, userApis());
    setIdentifiedSources(sources);
    setComparisons(nextComparisons);
    setSelectedIds(defaultUserApiImportSelection(nextComparisons));
    setSelectLoading(false);
    setSelectLoadingMessage(undefined);
    setSelectOpen(true);
  };

  const beginIdentifyLoading = (message: string) => {
    setIdentifiedSources([]);
    setComparisons([]);
    setSelectedIds(new Set<string>());
    setSelectLoading(true);
    setSelectLoadingMessage(message);
    setSelectOpen(true);
  };

  const identifyFromFiles = async (files: File[]) => {
    if (files.length === 0) {
      showAppToast({ title: '未找到可导入的自定义源文件', variant: 'warning' });
      return;
    }
    beginIdentifyLoading('正在识别自定义源…');
    try {
      const sources = await identifyUserApiScriptsFromFiles(files);
      openIdentifyDialog(sources);
    } catch (err) {
      setSelectOpen(false);
      showAppToast({
        title: '识别失败',
        description: toUserFacingMusicError(err),
        variant: 'error',
      });
    }
  };

  const handleLocalPickFile = () => {
    setLocalChoiceOpen(false);
    void (async () => {
      setLocalBusy(true);
      try {
        const files = await pickLocalUserApiFiles();
        if (!files?.length) return;
        await identifyFromFiles(files);
      } catch (err) {
        showAppToast({
          title: '选择文件失败',
          description: toUserFacingMusicError(err),
          variant: 'error',
        });
      } finally {
        setLocalBusy(false);
      }
    })();
  };

  const handleLocalPickDirectory = () => {
    setLocalChoiceOpen(false);
    void (async () => {
      setLocalBusy(true);
      try {
        const picked = await pickLocalUserApiDirectory();
        if (!picked) return;
        await identifyFromFiles(picked.files);
      } catch (err) {
        showAppToast({
          title: '选择目录失败',
          description: toUserFacingMusicError(err),
          variant: 'error',
        });
      } finally {
        setLocalBusy(false);
      }
    })();
  };

  const handleOnlineIdentify = (url: string) => {
    void (async () => {
      beginIdentifyLoading('正在下载并识别自定义源…');
      try {
        const res = await request(url, {
          method: 'GET',
          allowNon2xx: true,
          useBackendHttp: true,
          ignorePageNavigationAbort: true,
        });
        if (res.status >= 400) {
          throw new Error(`下载失败 HTTP ${res.status}`);
        }
        const text = await res.text();
        if (!text.trim()) throw new Error('脚本内容为空');
        const nameGuess = url.split('/').pop()?.split('?')[0] || 'online.js';
        const identified = /\.json$/i.test(nameGuess)
          ? identifyUserApiScriptsFromCode(text)
          : (() => {
            const one = identifyUserApiScriptFromText(text, nameGuess);
            return one ? [one] : identifyUserApiScriptsFromCode(text);
          })();
        openIdentifyDialog(identified);
      } catch (err) {
        setSelectOpen(false);
        showAppToast({
          title: '在线导入失败',
          description: toUserFacingMusicError(err),
          variant: 'error',
        });
      }
    })();
  };

  const handleCodeIdentify = (raw: string) => {
    beginIdentifyLoading('正在识别自定义源…');
    try {
      const sources = identifyUserApiScriptsFromCode(raw);
      openIdentifyDialog(sources);
    } catch (err) {
      setSelectOpen(false);
      showAppToast({
        title: '识别失败',
        description: toUserFacingMusicError(err),
        variant: 'error',
      });
    }
  };

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const selectAllToggle = () => {
    const sources = identifiedSources();
    setSelectedIds((prev) =>
      prev.size === sources.length
        ? new Set<string>()
        : new Set<string>(sources.map((source) => source.id)),
    );
  };

  const invertSelect = () => {
    const sources = identifiedSources();
    setSelectedIds((prev) => {
      const next = new Set<string>();
      for (const source of sources) {
        if (!prev.has(source.id)) next.add(source.id);
      }
      return next;
    });
  };

  const selectNewToggle = () => {
    setSelectedIds(
      new Set(comparisons().filter((c) => c.isNew).map((c) => c.source.id)),
    );
  };

  const selectUpdateToggle = () => {
    setSelectedIds(
      new Set(comparisons().filter((c) => c.isUpdate).map((c) => c.source.id)),
    );
  };

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
    const all = userApis();
    setListSelectedIds((prev) =>
      prev.size === all.length ? new Set<string>() : new Set(all.map((s) => s.id)),
    );
  };

  const clearListSelection = () => setListSelectedIds(new Set<string>());

  const invertListSelection = () => {
    const all = userApis();
    setListSelectedIds((prev) => {
      const next = new Set<string>();
      for (const s of all) {
        if (!prev.has(s.id)) next.add(s.id);
      }
      return next;
    });
  };

  const openEdit = (s: ReturnType<typeof listUserApiScripts>[number]) => {
    setEditTarget({ id: s.id, name: s.name, script: s.script });
    setEditOpen(true);
  };

  const exportOne = (s: ReturnType<typeof listUserApiScripts>[number]) => {
    downloadTextFile(s.script, `${sanitizeExportFileName(s.name)}.js`, 'text/javascript;charset=utf-8');
    showAppToast({ title: '已导出', description: s.name, variant: 'success' });
  };

  const batchExport = () => {
    const selected = userApis().filter((s) => listSelectedIds().has(s.id));
    if (!selected.length) return;
    if (selected.length === 1) {
      exportOne(selected[0]!);
      clearListSelection();
      return;
    }
    downloadTextFilesZip(
      selected.map((s) => ({
        name: `${sanitizeExportFileName(s.name)}.js`,
        content: s.script,
      })),
      `自定义源_${selected.length}个_${Date.now()}.zip`,
    );
    showAppToast({ title: '已导出', description: `已打包 ${selected.length} 个自定义源`, variant: 'success' });
    clearListSelection();
  };

  const batchDelete = () => {
    for (const id of listSelectedIds()) {
      removeUserApiScript(id);
    }
    clearListSelection();
    setBatchDeleteOpen(false);
    showAppToast({ title: '已删除', description: '所选自定义源已移除', variant: 'success' });
  };

  const saveEditedScript = async (script: string) => {
    const target = editTarget();
    if (!target) return;
    setEditSaving(true);
    try {
      const result = await importUserApiScript({
        script,
        fallbackName: target.name,
        replaceId: target.id,
      });
      if (!result.ok) {
        throw new Error(result.error || '保存失败');
      }
      showAppToast({ title: '已保存', description: result.name, variant: 'success' });
    } catch (err) {
      showAppToast({
        title: '保存失败',
        description: toUserFacingMusicError(err),
        variant: 'error',
      });
      throw err;
    } finally {
      setEditSaving(false);
    }
  };

  const confirmImport = async () => {
    const selected = identifiedSources().filter((source) => selectedIds().has(source.id));
    if (selected.length === 0) return;

    const comparisonMap = new Map(comparisons().map((c) => [c.source.id, c]));
    const newCount = selected.filter((source) => comparisonMap.get(source.id)?.isNew).length;
    if (!ensureImportCapacity(newCount)) return;

    setImporting(true);
    setSelectLoading(true);
    setSelectLoadingMessage('正在导入自定义源…');
    try {
      let successCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;
      for (const source of selected) {
        const comparison = comparisonMap.get(source.id);
        const result = await importUserApiScript({
          script: source.script,
          fileName: source.fileName,
          fallbackName: source.name,
          replaceId: comparison?.isUpdate ? comparison.existing?.id : undefined,
        });
        if (result.skipped) {
          skippedCount += 1;
          continue;
        }
        if (result.ok) {
          successCount += 1;
          if (result.updated) updatedCount += 1;
        }
      }
      setSelectOpen(false);
      if (successCount > 0) {
        const parts = [`已处理 ${successCount} 个自定义源`];
        if (updatedCount > 0) parts.push(`更新 ${updatedCount}`);
        if (successCount - updatedCount > 0) {
          parts.push(`新增 ${successCount - updatedCount}`);
        }
        showAppToast({
          title: parts[0],
          description: parts.length > 1 ? parts.slice(1).join(' · ') : undefined,
          variant: 'success',
        });
      } else if (skippedCount > 0) {
        showAppToast({
          title: '未导入新源',
          description: '所选源与本地脚本文本相同，已跳过',
          variant: 'warning',
        });
      }
    } catch (err) {
      showAppToast({
        title: '导入失败',
        description: toUserFacingMusicError(err),
        variant: 'error',
      });
    } finally {
      setImporting(false);
      setSelectLoading(false);
      setSelectLoadingMessage(undefined);
    }
  };

  return (
    <AudioPanelShell
      open={props.open}
      inline={props.inline}
      title="自定义源管理"
      hideHeader={props.inline}
      onClose={props.onClose}
    >
      <div class={props.inline ? 'space-y-4 pt-2' : 'space-y-4 p-4'}>
        <section class="space-y-3">
          <div>
            <h3 class="mb-1 text-sm font-medium">自定义源管理</h3>
            <p class="text-xs text-muted-foreground">
              点选一项作为当前自定义源。版本与初始化状态跟随源名称显示；Reader
              额外允许启用多个源参与取链，当前源仍具有最高优先级。
            </p>
          </div>

          <div class="space-y-1">
            <div class="flex flex-wrap items-center gap-2 text-sm">
              <span class="text-muted-foreground">启动初始化：</span>
              <MusicAppSelect
                value={initMode()}
                onChange={(v) => {
                  const mode = v as UserApiInitMode;
                  setInitMode(mode);
                  setUserApiInitMode(mode);
                  void ensureUserApiScriptsInitialized({
                    mode,
                    forceUpdateCheck: true,
                  });
                }}
                options={['activeOnly', 'allEnabled']}
                optionLabel={(v) =>
                  v === 'activeOnly' ? '仅当前自定义源' : '全部已启用源'
                }
                triggerClass="w-44"
                aria-label="音源初始化策略"
              />
            </div>
            <p class="text-xs text-muted-foreground">
              「仅当前自定义源」最接近 LX Music 一次只加载当前源的行为；未启用的源不会初始化。
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={importing() || localBusy()}
              onClick={() => setLocalChoiceOpen(true)}
            >
              本地导入
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={importing() || localBusy()}
              onClick={() => setOnlineOpen(true)}
            >
              在线导入
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={importing() || localBusy()}
              onClick={() => setCodeOpen(true)}
            >
              代码导入
            </Button>
            <Show when={importing() || localBusy()}>
              <LoaderCircle class="h-4 w-4 animate-spin text-muted-foreground" />
            </Show>
          </div>

          <Show
            when={userApis().length > 0}
            fallback={
              <div class="flex h-40 items-center justify-center rounded-md border text-sm text-muted-foreground">
                这里竟然是空的
              </div>
            }
          >
            <AppManualRadioGroup
              class={`${SOURCE_LIST_HEIGHT_CLASS} space-y-2 overflow-y-auto rounded-md border p-2`}
              aria-label="当前自定义源"
            >
              <For each={userApis()}>
                {(s) => {
                  const indicator = initStatusIndicator(s.initStatus);
                  const isActive = () => defaultId() === s.id;
                  const showInitStatus = () =>
                    s.enabled && (initMode() === 'allEnabled' || isActive());
                  return (
                    <div
                      class={`group flex items-center gap-2 rounded-md border px-2 py-2 text-sm transition-colors ${isActive()
                          ? 'border-primary/60 bg-primary/5 hover:bg-primary/10'
                          : 'hover:bg-accent/50'
                        }`}
                    >
                      <div
                        class="shrink-0"
                        onClick={(e: MouseEvent) => e.stopPropagation()}
                        role="presentation"
                      >
                        <Checkbox
                          checked={listSelectedIds().has(s.id)}
                          onChange={(checked) => toggleListSelected(s.id, checked)}
                          aria-label={`选择 ${s.name}`}
                        />
                      </div>
                      <AppManualRadioOption
                        selected={isActive()}
                        disabled={!canUseScript(s)}
                        onSelect={() => setActive(s.id)}
                        class="min-h-0 min-w-0 flex-1 rounded-md border-0 px-1 py-1 hover:bg-transparent"
                      >
                        <div class="min-w-0 flex-1">
                          <p class="flex min-w-0 items-center gap-2 truncate">
                            <span class="truncate font-medium">{s.name}</span>
                            <Show when={s.version}>
                              <span class="shrink-0 text-xs font-normal text-muted-foreground">
                                {formatUserApiVersionLabel(s.version!)}
                              </span>
                            </Show>
                            <Show when={isActive()}>
                              <span class="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
                                当前
                              </span>
                            </Show>
                            <Show when={showInitStatus()}>
                              <AppTooltip>
                                <AppTooltipTrigger
                                  as="span"
                                  class={`size-2 shrink-0 rounded-full shadow-[0_0_0_1px_rgba(0,0,0,0.08)] ${indicator.class} ${indicator.pulse ? 'animate-pulse' : ''
                                    }`}
                                  aria-label={indicator.label}
                                />
                                <AppTooltipContent layer="viewer">
                                  {indicator.label}
                                </AppTooltipContent>
                              </AppTooltip>
                            </Show>
                          </p>
                          <Show when={showInitStatus() && s.initStatus === 'pending'}>
                            <p class="text-xs text-muted-foreground">初始化中…</p>
                          </Show>
                          <Show when={showInitStatus() && s.initStatus === 'failed' && s.initError}>
                            <p class="truncate text-xs text-destructive">{s.initError}</p>
                          </Show>
                        </div>
                      </AppManualRadioOption>

                      <div class="flex shrink-0 items-center gap-2">
                        <div class="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Checkbox
                            id={`user-api-update-alert-${s.id}-input`}
                            checked={s.allowShowUpdateAlert !== false}
                            onChange={(checked) =>
                              setUserApiAllowShowUpdateAlert(s.id, checked)
                            }
                          />
                          <Label
                            class="font-normal"
                            for={`user-api-update-alert-${s.id}-input`}
                          >
                            更新提示
                          </Label>
                        </div>
                        <AppTooltip>
                          <AppTooltipTrigger as="div">
                            <AppSwitch
                              checked={s.enabled}
                              disabled={s.initStatus === 'pending'}
                              onChange={(checked) => setUserApiScriptEnabled(s.id, checked)}
                              aria-label={s.enabled ? `禁用 ${s.name}` : `启用 ${s.name}`}
                            >
                              <AppSwitchControl>
                                <AppSwitchThumb />
                              </AppSwitchControl>
                            </AppSwitch>
                          </AppTooltipTrigger>
                          <AppTooltipContent layer="viewer">
                            {s.enabled ? '禁用此源' : '启用此源'}
                          </AppTooltipContent>
                        </AppTooltip>
                        <AppTooltip>
                          <AppTooltipTrigger as="div">
                            <Button
                              variant="ghost"
                              size="icon"
                              class="h-8 w-8 shrink-0"
                              aria-label={`编辑 ${s.name}`}
                              onClick={() => openEdit(s)}
                            >
                              <Pencil class="h-4 w-4" />
                            </Button>
                          </AppTooltipTrigger>
                          <AppTooltipContent layer="viewer">编辑脚本</AppTooltipContent>
                        </AppTooltip>
                        <AppTooltip>
                          <AppTooltipTrigger as="div">
                            <Button
                              variant="ghost"
                              size="icon"
                              class="h-8 w-8 shrink-0"
                              aria-label={`导出 ${s.name}`}
                              onClick={() => exportOne(s)}
                            >
                              <Download class="h-4 w-4" />
                            </Button>
                          </AppTooltipTrigger>
                          <AppTooltipContent layer="viewer">导出脚本</AppTooltipContent>
                        </AppTooltip>
                        <AppTooltip>
                          <AppTooltipTrigger as="div">
                            <Button
                              variant="ghost"
                              size="icon"
                              class="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              aria-label={`删除 ${s.name}`}
                              onClick={() => removeUserApiScript(s.id)}
                            >
                              <Trash2 class="h-4 w-4" />
                            </Button>
                          </AppTooltipTrigger>
                          <AppTooltipContent layer="viewer">移除自定义源</AppTooltipContent>
                        </AppTooltip>
                      </div>
                    </div>
                  );
                }}
              </For>
            </AppManualRadioGroup>

            <div class="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 px-2 py-2">
              <div class="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={toggleListSelectAll}>
                  {listSelectedIds().size === userApis().length ? '取消全选' : '全选'}
                  ({listSelectedCount()}/{userApis().length})
                </Button>
                <Button variant="outline" size="sm" onClick={clearListSelection} disabled={listSelectedCount() === 0}>
                  取消选中
                </Button>
                <Button variant="outline" size="sm" onClick={invertListSelection} disabled={userApis().length === 0}>
                  反选
                </Button>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={batchExport} disabled={listSelectedCount() === 0}>
                  导出所选
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setBatchDeleteOpen(true)}
                  disabled={listSelectedCount() === 0}
                >
                  删除所选
                </Button>
              </div>
            </div>
          </Show>

          <div class="space-y-1.5 rounded-md border bg-muted/20 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            <p>
              源编写说明：
              <button
                type="button"
                class="ml-1 underline underline-offset-2 hover:text-foreground"
                onClick={() => void openUrlInBrowser(USER_API_README_URL)}
              >
                FAQ
              </button>
            </p>
            <p>
              提示：虽然我们已经尽可能地隔离了脚本的运行环境，但导入包含恶意行为的脚本仍可能会影响你的系统，请谨慎导入。
            </p>
          </div>
        </section>
      </div>

      <ImportUserApiLocalDialog
        open={localChoiceOpen()}
        busy={localBusy()}
        onOpenChange={setLocalChoiceOpen}
        onPickFile={handleLocalPickFile}
        onPickDirectory={handleLocalPickDirectory}
      />
      <ImportSourceNetworkDialog
        open={onlineOpen()}
        onOpenChange={setOnlineOpen}
        onIdentify={handleOnlineIdentify}
        title="在线导入自定义源"
        description="输入自定义源脚本的链接（http/https），将拉取并识别。桌面端由应用内网络拉取，不受跨域限制；浏览器环境下若遇跨域请改用「本地导入」。"
        placeholder="https://example.com/source.js"
      />
      <ImportCodeDialog
        open={codeOpen()}
        onOpenChange={setCodeOpen}
        language="javascript"
        title="代码导入自定义源"
        description="粘贴自定义源 JS 脚本，或 JSON 字符串 / 对象（script/code 字段）/ 数组。识别后可选择新增或更新同名源。"
        onIdentify={handleCodeIdentify}
      />
      <ImportUserApiSelectDialog
        open={selectOpen()}
        loading={selectLoading()}
        loadingMessage={selectLoadingMessage()}
        sources={identifiedSources()}
        comparisons={comparisons()}
        selectedIds={selectedIds()}
        onOpenChange={setSelectOpen}
        onToggle={toggleSelected}
        onSelectAllToggle={selectAllToggle}
        onInvertSelect={invertSelect}
        onSelectNewToggle={selectNewToggle}
        onSelectUpdateToggle={selectUpdateToggle}
        onConfirm={() => void confirmImport()}
      />
      <SourceScriptEditDialog
        open={editOpen()}
        onOpenChange={setEditOpen}
        title={editTarget() ? `编辑 · ${editTarget()!.name}` : '编辑自定义源'}
        description="直接编辑 JS 脚本源码，保存后将重新初始化该源。"
        initialValue={editTarget()?.script ?? ''}
        language="javascript"
        saving={editSaving()}
        onSave={saveEditedScript}
        portalZClass="z-[70]"
      />
      <AppDialog open={batchDeleteOpen()} onOpenChange={setBatchDeleteOpen}>
        <AppDialogContent class="max-w-sm" portalZClass="z-[70]">
          <AppDialogHeader>
            <AppDialogTitle>删除所选自定义源</AppDialogTitle>
            <AppDialogDescription>
              确定删除已选的 {listSelectedCount()} 个自定义源吗？此操作不可撤销。
            </AppDialogDescription>
          </AppDialogHeader>
          <AppDialogFooter>
            <Button variant="outline" onClick={() => setBatchDeleteOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={batchDelete}>
              删除
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>
    </AudioPanelShell>
  );
};
