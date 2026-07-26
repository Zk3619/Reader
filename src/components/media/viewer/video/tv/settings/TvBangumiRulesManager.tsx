/**
 * 番剧规则导入与管理：本地 / 网络 / 代码 + 规则库列表 + 规则仓库订阅
 * 对齐 TvConfigSourceManager；规则与 FongMi sites[]/Spider 隔离
 */

import { createSignal, For, Show, createMemo, onMount } from 'solid-js';
import { ChevronDown, ChevronUp, Download, Pencil, Trash2 } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { AppTextField, AppTextFieldInput } from '@/components/shared/AppTextField';
import { ImportSourceNetworkDialog } from '@/components/media/reader/sources/ImportSourceNetworkDialog';
import { ImportCodeDialog } from '@/components/shared/ImportCodeDialog';
import { ImportLocalChoiceDialog } from '@/components/shared/ImportLocalChoiceDialog';
import { ImportBangumiRuleSelectDialog } from '@/components/media/viewer/video/tv/settings/ImportBangumiRuleSelectDialog';
import { SourceScriptEditDialog } from '@/components/shared/SourceScriptEditDialog';
import {
  SourceListItemActions,
  SourceListLayoutRoot,
  SOURCE_LIST_MAIN_CLASS,
  SOURCE_LIST_ROW_CLASS,
} from '@/components/shared/SourceListItemActions';
import { cn } from '@/lib/utils';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { AppSwitch, AppSwitchControl, AppSwitchThumb } from '@/components/shared/AppSwitch';
import { showAppToast } from '@/components/shared/AppToasts';
import {
  downloadTextFile,
  downloadTextFilesZip,
  sanitizeExportFileName,
} from '@/lib/shared/download-source-scripts';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '@/lib/platform/detect';
import { pickFiles } from '@/lib/platform/fs/pick-file';
import { pickDirectory } from '@/lib/platform/fs/pick-directory';
import { collectEligibleFilesFromDirectory } from '@/lib/platform/fs/collect-directory-files';
import { readBytes } from '@/lib/platform/fs/read-write';
import { isUserCancelled } from '@/lib/platform/fs/errors';
import type { PickResult } from '@/lib/platform/fs/pick-types';
import type { ScannedDirectoryFile } from '@/lib/platform/fs/collect-directory-files';
import { tvRequest } from '@/lib/media/tv/net/rules';
import { ensureBangumiDaoMigrated } from '@/lib/media/video/bangumi/dao-bridge';
import {
  identifyBangumiRulesFromText,
  buildBangumiRuleImportComparisons,
  defaultBangumiRuleImportSelection,
  type IdentifiedBangumiRule,
  type BangumiRuleImportComparison,
} from '@/lib/media/video/bangumi/rule-import-identify';
import {
  BANGUMI_EXAMPLE_RULE,
  BANGUMI_ISOLATION_NOTE,
  exportRulesJson,
  getBangumiRulePayloadJson,
  loadBangumiRules,
  normalizeBangumiRule,
  removeBangumiRule,
  reorderBangumiRules,
  upsertBangumiRule,
  type BangumiRule,
} from '@/lib/media/video/bangumi/rules';
import {
  importRulesFromKazumiShop,
  resolveKazumiRulesShopBase,
  updateAllBangumiRuleSubscriptions,
} from '@/lib/media/video/bangumi/subscription';
import {
  BANGUMI_RULE_API_LEVEL,
  addBangumiRuleSubscribeUrl,
  getBangumiModulePrefs,
  removeBangumiRuleSubscribeUrl,
  setBangumiModulePrefs,
} from '@/lib/media/video/bangumi/prefs';

const BANGUMI_RULE_FILE_FILTERS = [
  { name: 'Bangumi Rules', extensions: ['json'] },
  { name: 'All Files', extensions: ['*'] },
];

const RULE_LIST_HEIGHT_CLASS = 'h-80';

function isBangumiRuleFileName(fileName: string): boolean {
  const n = fileName.trim().toLowerCase();
  if (!n.endsWith('.json')) return false;
  // KazumiRules 仓库根目录的索引 / 元数据，不是可执行规则
  return n !== 'index.json' && n !== 'package.json' && n !== 'package-lock.json';
}

async function allowPickedDirectory(pathValue: string) {
  if (!isTauri() || !pathValue.trim()) return;
  try {
    await invoke('video_allow_local_media_asset', { path: pathValue });
  } catch (e) {
    console.warn('[bangumi-rules] allow directory failed', e);
  }
}

async function textFromPickResult(p: PickResult): Promise<string> {
  if (p.legacyFile) return p.legacyFile.text();
  const bytes = p.bytes ?? (await readBytes(p.ref));
  return new TextDecoder().decode(bytes);
}

async function textFromScannedFile(f: ScannedDirectoryFile): Promise<string> {
  if (f.legacyFile) return f.legacyFile.text();
  const bytes = await readBytes(f.ref);
  return new TextDecoder().decode(bytes);
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export interface TvBangumiRulesManagerProps {
  /** 导入 / 增删 / 订阅更新后回调，供上层刷新其它区块 */
  onChanged?: () => void;
}

export function TvBangumiRulesManager(props: TvBangumiRulesManagerProps) {
  const [rulesTick, setRulesTick] = createSignal(0);
  const [localOpen, setLocalOpen] = createSignal(false);
  const [localBusy, setLocalBusy] = createSignal(false);
  const [onlineOpen, setOnlineOpen] = createSignal(false);
  const [codeOpen, setCodeOpen] = createSignal(false);
  const [selectOpen, setSelectOpen] = createSignal(false);
  const [selectLoading, setSelectLoading] = createSignal(false);
  const [selectLoadingMessage, setSelectLoadingMessage] = createSignal<string>();
  const [comparisons, setComparisons] = createSignal<BangumiRuleImportComparison[]>([]);
  const [selectedKeys, setSelectedKeys] = createSignal(new Set<string>());
  const [importing, setImporting] = createSignal(false);
  const [listSelectedIds, setListSelectedIds] = createSignal(new Set<string>());
  const [batchDeleteOpen, setBatchDeleteOpen] = createSignal(false);
  const [editTarget, setEditTarget] = createSignal<{
    id: string;
    name: string;
    json: string;
    enabled: boolean;
  } | null>(null);
  const [editOpen, setEditOpen] = createSignal(false);
  const [editSaving, setEditSaving] = createSignal(false);
  const [subUrl, setSubUrl] = createSignal('');
  const [subsTick, setSubsTick] = createSignal(0);

  const rules = createMemo(() => {
    rulesTick();
    return loadBangumiRules();
  });

  const subscribeUrls = createMemo(() => {
    subsTick();
    return getBangumiModulePrefs().ruleSubscribeUrls;
  });

  const useRulesShopMirror = createMemo(() => {
    subsTick();
    return getBangumiModulePrefs().useRulesShopMirror;
  });

  const shopBase = createMemo(() => {
    subsTick();
    return resolveKazumiRulesShopBase();
  });

  onMount(() => {
    void ensureBangumiDaoMigrated().then(() => refresh());
  });

  const notifyChanged = () => props.onChanged?.();

  const refresh = () => {
    setRulesTick((n) => n + 1);
    setSubsTick((n) => n + 1);
    notifyChanged();
  };

  const busy = () => importing() || localBusy();

  const beginIdentifyLoading = (message: string) => {
    setComparisons([]);
    setSelectedKeys(new Set<string>());
    setSelectLoading(true);
    setSelectLoadingMessage(message);
    setSelectOpen(true);
  };

  const openIdentifyDialog = (identified: IdentifiedBangumiRule[]) => {
    const next = buildBangumiRuleImportComparisons(identified);
    setComparisons(next);
    setSelectedKeys(defaultBangumiRuleImportSelection(next));
    setSelectLoading(false);
    setSelectLoadingMessage(undefined);
    setSelectOpen(true);
  };

  const identifyFromTexts = (items: { text: string; label: string }[]) => {
    const all: IdentifiedBangumiRule[] = [];
    for (const item of items) {
      all.push(...identifyBangumiRulesFromText(item.text, item.label));
    }
    if (!all.length) {
      setSelectOpen(false);
      showAppToast({ title: '未识别到可导入规则', variant: 'warning' });
      return;
    }
    openIdentifyDialog(all);
  };

  const handleLocalPickFile = () => {
    setLocalOpen(false);
    void (async () => {
      setLocalBusy(true);
      try {
        const picked = await pickFiles({ filters: BANGUMI_RULE_FILE_FILTERS, multiple: true });
        if (!picked.length) return;
        beginIdentifyLoading('正在识别规则…');
        const items = await Promise.all(
          picked.map(async (p) => ({ text: await textFromPickResult(p), label: p.fileName })),
        );
        identifyFromTexts(items);
      } catch (err) {
        if (isUserCancelled(err)) return;
        setSelectOpen(false);
        showAppToast({ title: '选择文件失败', description: errMsg(err), variant: 'error' });
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
        const picked = await pickDirectory();
        if (picked.ref.kind === 'path') {
          await allowPickedDirectory(picked.ref.value);
        }
        // KazumiRules 为扁平仓库；跳过 .github 等隐藏目录，避免 scope/无关扫描
        const files = await collectEligibleFilesFromDirectory(
          picked.ref,
          isBangumiRuleFileName,
          { maxDepth: 0 },
        );
        if (!files.length) {
          showAppToast({ title: '目录内未找到 .json 规则文件', variant: 'warning' });
          return;
        }
        beginIdentifyLoading('正在识别规则…');
        const items = await Promise.all(
          files.map(async (f) => ({ text: await textFromScannedFile(f), label: f.fileName })),
        );
        identifyFromTexts(items);
      } catch (err) {
        if (isUserCancelled(err)) return;
        setSelectOpen(false);
        showAppToast({ title: '选择目录失败', description: errMsg(err), variant: 'error' });
      } finally {
        setLocalBusy(false);
      }
    })();
  };

  const handleOnlineIdentify = (url: string) => {
    void (async () => {
      beginIdentifyLoading('正在下载并识别规则…');
      try {
        const res = await tvRequest(url, { method: 'GET', useBackendHttp: true });
        if (res.status >= 400) throw new Error(`下载失败 HTTP ${res.status}`);
        const text = await res.text();
        if (!text.trim()) throw new Error('内容为空');
        identifyFromTexts([{ text, label: url }]);
      } catch (err) {
        setSelectOpen(false);
        showAppToast({ title: '网络导入失败', description: errMsg(err), variant: 'error' });
      }
    })();
  };

  const handleCodeIdentify = (raw: string) => {
    beginIdentifyLoading('正在识别规则…');
    try {
      identifyFromTexts([{ text: raw, label: 'code' }]);
    } catch (err) {
      setSelectOpen(false);
      showAppToast({ title: '识别失败', description: errMsg(err), variant: 'error' });
    }
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
      const selected = comparisons()
        .filter((c) => keys.has(c.key))
        .map((c) => c.rule);
      if (!selected.length) return;
      setImporting(true);
      setSelectOpen(false);
      try {
        for (const rule of selected) upsertBangumiRule(rule);
        refresh();
        showAppToast({ title: '规则已导入', description: `已写入 ${selected.length} 条` });
      } catch (err) {
        showAppToast({ title: '导入失败', description: errMsg(err), variant: 'error' });
      } finally {
        setImporting(false);
      }
    })();
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
    const all = rules();
    setListSelectedIds((prev) =>
      prev.size === all.length ? new Set<string>() : new Set(all.map((r) => r.id)),
    );
  };

  const clearListSelection = () => setListSelectedIds(new Set<string>());

  const invertListSelection = () => {
    const all = rules();
    setListSelectedIds((prev) => {
      const next = new Set<string>();
      for (const r of all) {
        if (!prev.has(r.id)) next.add(r.id);
      }
      return next;
    });
  };

  const exportOne = (r: BangumiRule) => {
    downloadTextFile(
      exportRulesJson([r]),
      `${sanitizeExportFileName(r.name || r.id)}.json`,
      'application/json;charset=utf-8',
    );
    showAppToast({ title: '已导出', description: r.name });
  };

  const batchExport = () => {
    const all = rules();
    const selected = all.filter((r) => listSelectedIds().has(r.id));
    if (!selected.length) return;
    if (selected.length === 1) {
      exportOne(selected[0]!);
      clearListSelection();
      return;
    }
    downloadTextFilesZip(
      selected.map((r) => ({
        name: `${sanitizeExportFileName(r.name || r.id)}.json`,
        content: exportRulesJson([r]),
      })),
      `番剧规则_${selected.length}个_${Date.now()}.zip`,
    );
    showAppToast({ title: '已导出', description: `已打包 ${selected.length} 条规则` });
    clearListSelection();
  };

  const batchDelete = () => {
    for (const id of listSelectedIds()) removeBangumiRule(id);
    clearListSelection();
    setBatchDeleteOpen(false);
    refresh();
    showAppToast({ title: '已删除', description: '所选规则已移除' });
  };

  const batchEnable = (enabled: boolean) => {
    const selected = rules().filter((r) => listSelectedIds().has(r.id));
    for (const r of selected) upsertBangumiRule({ ...r, enabled });
    clearListSelection();
    refresh();
    showAppToast({
      title: enabled ? '已启用' : '已禁用',
      description: `${enabled ? '已启用' : '已禁用'} ${selected.length} 条规则`,
    });
  };

  const moveRule = (id: string, direction: -1 | 1) => {
    const list = rules();
    const index = list.findIndex((r) => r.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= list.length) return;
    const ids = list.map((r) => r.id);
    const next = [...ids];
    [next[index], next[target]] = [next[target]!, next[index]!];
    reorderBangumiRules(next);
    refresh();
  };

  const openEdit = (r: BangumiRule) => {
    void (async () => {
      try {
        const payload = await getBangumiRulePayloadJson(r.id);
        const json = payload?.trim()
          ? (() => {
              try {
                return JSON.stringify(JSON.parse(payload), null, 2);
              } catch {
                return payload;
              }
            })()
          : JSON.stringify({ ...r, version: 2 }, null, 2);
        setEditTarget({ id: r.id, name: r.name, json, enabled: r.enabled });
        setEditOpen(true);
      } catch (err) {
        showAppToast({ title: '读取规则失败', description: errMsg(err), variant: 'error' });
      }
    })();
  };

  const saveEditedRule = async (json: string, displayName: string) => {
    const target = editTarget();
    if (!target) return;
    setEditSaving(true);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch {
        throw new Error('JSON 解析失败');
      }
      const normalized = normalizeBangumiRule(parsed);
      if (!normalized) throw new Error('规则格式无效');
      const name = displayName.trim() || target.name || normalized.name;
      upsertBangumiRule(
        {
          ...normalized,
          id: target.id,
          name,
          enabled: target.enabled,
        },
        { payload: isRecord(parsed) ? { ...parsed, id: target.id, version: 2 } : { ...normalized, version: 2 } },
      );
      refresh();
      showAppToast({ title: '已保存', description: name });
    } catch (err) {
      showAppToast({ title: '保存失败', description: errMsg(err), variant: 'error' });
      throw err;
    } finally {
      setEditSaving(false);
    }
  };

  function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
  }

  return (
    <div class="min-w-0 space-y-4">
      <div class="space-y-1">
        <h3 class="text-sm font-semibold">番剧规则</h3>
        <p class="text-xs text-muted-foreground">{BANGUMI_ISOLATION_NOTE}</p>
        <p class="text-xs text-muted-foreground">规则 apiLevel：{BANGUMI_RULE_API_LEVEL}</p>
      </div>

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
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy()}
          onClick={() => {
            upsertBangumiRule({ ...BANGUMI_EXAMPLE_RULE, id: `demo_${Date.now()}` });
            refresh();
          }}
        >
          示例规则
        </Button>
      </div>

      <div class="min-w-0 space-y-1.5">
        <p class="text-xs font-medium text-muted-foreground">规则库（{rules().length}）</p>
        <Show when={rules().length === 0}>
          <div class={`flex ${RULE_LIST_HEIGHT_CLASS} items-center justify-center rounded-md border text-sm text-muted-foreground`}>
            暂无规则，请先导入
          </div>
        </Show>
        <Show when={rules().length > 0}>
          <SourceListLayoutRoot
            class={`${RULE_LIST_HEIGHT_CLASS} min-w-0 w-full max-w-full space-y-2 overflow-auto rounded-md border p-2`}
          >
            <For each={rules()}>
              {(r) => (
                <li
                  class={cn(
                    SOURCE_LIST_ROW_CLASS,
                    'border-border/50 hover:bg-accent/50',
                  )}
                >
                  <div
                    class="shrink-0"
                    onClick={(e: MouseEvent) => e.stopPropagation()}
                    role="presentation"
                  >
                    <Checkbox
                      checked={listSelectedIds().has(r.id)}
                      onChange={(checked) => toggleListSelected(r.id, checked)}
                      aria-label={`选择 ${r.name}`}
                    />
                  </div>
                  <div class={SOURCE_LIST_MAIN_CLASS}>
                    <p class="truncate font-medium">{r.name}</p>
                    <p class="truncate text-[11px] text-muted-foreground">{r.baseUrl}</p>
                  </div>
                  <SourceListItemActions
                    moreAriaLabel={`更多操作 · ${r.name}`}
                    enabledSwitch={
                      <AppSwitch
                        checked={r.enabled}
                        disabled={busy()}
                        onChange={(checked) => {
                          upsertBangumiRule({ ...r, enabled: checked });
                          refresh();
                        }}
                        aria-label={`启用规则 ${r.name}`}
                      >
                        <AppSwitchControl>
                          <AppSwitchThumb />
                        </AppSwitchControl>
                      </AppSwitch>
                    }
                    actions={[
                      {
                        id: 'up',
                        label: '上移',
                        icon: ChevronUp,
                        disabled: busy(),
                        onSelect: () => moveRule(r.id, -1),
                      },
                      {
                        id: 'down',
                        label: '下移',
                        icon: ChevronDown,
                        disabled: busy(),
                        onSelect: () => moveRule(r.id, 1),
                      },
                      {
                        id: 'edit',
                        label: '编辑规则',
                        icon: Pencil,
                        disabled: busy(),
                        onSelect: () => openEdit(r),
                      },
                      {
                        id: 'export',
                        label: '导出规则',
                        icon: Download,
                        disabled: busy(),
                        onSelect: () => exportOne(r),
                      },
                      {
                        id: 'delete',
                        label: '删除规则',
                        icon: Trash2,
                        destructive: true,
                        disabled: busy(),
                        onSelect: () => {
                          removeBangumiRule(r.id);
                          refresh();
                        },
                      },
                    ]}
                  />
                </li>
              )}
            </For>
          </SourceListLayoutRoot>

          <div class="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 px-2 py-2">
            <div class="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={toggleListSelectAll}>
                {listSelectedIds().size === rules().length ? '取消全选' : '全选'}
                ({listSelectedCount()}/{rules().length})
              </Button>
              <Button variant="outline" size="sm" onClick={clearListSelection} disabled={listSelectedCount() === 0}>
                取消选中
              </Button>
              <Button variant="outline" size="sm" onClick={invertListSelection} disabled={rules().length === 0}>
                反选
              </Button>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => batchEnable(true)}
                disabled={listSelectedCount() === 0 || busy()}
              >
                启用所选
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => batchEnable(false)}
                disabled={listSelectedCount() === 0 || busy()}
              >
                禁用所选
              </Button>
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

      <div class="space-y-2">
        <h4 class="text-xs font-semibold">官方规则仓库</h4>
        <p class="text-[11px] text-muted-foreground">
          对齐 Kazumi：拉取 Predidit/KazumiRules 的 index.json，再逐条下载插件 JSON。
        </p>
        <div class="flex items-center justify-between gap-2 rounded-md border border-border/50 px-2 py-1.5">
          <div class="min-w-0">
            <p class="text-xs font-medium">规则仓库镜像</p>
            <p class="truncate text-[11px] text-muted-foreground">
              {useRulesShopMirror() ? 'GitCode 镜像' : 'GitHub raw'}
            </p>
          </div>
          <AppSwitch
            checked={useRulesShopMirror()}
            onChange={(checked) => {
              setBangumiModulePrefs({ useRulesShopMirror: checked });
              refresh();
            }}
            aria-label="规则仓库镜像"
          >
            <AppSwitchControl>
              <AppSwitchThumb />
            </AppSwitchControl>
          </AppSwitch>
        </div>
        <p class="truncate text-[11px] text-muted-foreground">{shopBase()}</p>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy()}
          onClick={() => {
            void importRulesFromKazumiShop()
              .then((r) => {
                refresh();
                showAppToast({
                  title: `官方仓库：导入 ${r.imported}/${r.catalogSize}`,
                  description: r.skipped.slice(0, 2).join('；') || undefined,
                  variant: 'success',
                });
              })
              .catch((e) =>
                showAppToast({ title: '官方仓库更新失败', description: errMsg(e), variant: 'error' }),
              );
          }}
        >
          更新官方仓库
        </Button>
      </div>

      <div class="space-y-2">
        <h4 class="text-xs font-semibold">自定义仓库订阅</h4>
        <p class="text-[11px] text-muted-foreground">
          支持 Kazumi index.json、内联规则包，或 MusicFree 式 URL 清单。
        </p>
        <div class="flex gap-2">
          <AppTextField class="flex-1">
            <AppTextFieldInput
              placeholder="https://…/index.json"
              value={subUrl()}
              onChange={(e: Event & { currentTarget: HTMLInputElement }) =>
                setSubUrl(e.currentTarget.value)
              }
            />
          </AppTextField>
          <Button
            size="sm"
            disabled={!subUrl().trim()}
            onClick={() => {
              addBangumiRuleSubscribeUrl(subUrl());
              setSubUrl('');
              refresh();
            }}
          >
            添加
          </Button>
        </div>
        <ul class="space-y-1 text-xs">
          <For each={subscribeUrls()}>
            {(u) => (
              <li class="flex items-center justify-between gap-2">
                <span class="truncate">{u}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  class="h-7"
                  onClick={() => {
                    removeBangumiRuleSubscribeUrl(u);
                    refresh();
                  }}
                >
                  移除
                </Button>
              </li>
            )}
          </For>
        </ul>
        <Button
          size="sm"
          variant="secondary"
          disabled={!subscribeUrls().length}
          onClick={() => {
            void updateAllBangumiRuleSubscriptions()
              .then((r) => {
                refresh();
                showAppToast({
                  title: `订阅更新：导入 ${r.imported}`,
                  description: r.skipped.slice(0, 2).join('；') || undefined,
                  variant: 'success',
                });
              })
              .catch((e) =>
                showAppToast({ title: '订阅失败', description: errMsg(e), variant: 'error' }),
              );
          }}
        >
          更新全部订阅
        </Button>
      </div>

      <ImportLocalChoiceDialog
        open={localOpen()}
        busy={localBusy()}
        onOpenChange={setLocalOpen}
        onPickFile={handleLocalPickFile}
        onPickDirectory={handleLocalPickDirectory}
        title="本地导入番剧规则"
        description="选择单个规则 JSON 文件，或扫描文件夹中的 .json（兼容 Kazumi 插件 / Reader 规则包）。"
        fileButtonHint="可一次选择多个 json"
        directoryButtonHint="扫描目录根级 .json（跳过 .github 等）"
      />
      <ImportSourceNetworkDialog
        open={onlineOpen()}
        onOpenChange={setOnlineOpen}
        title="网络导入番剧规则"
        description="输入规则 JSON 链接。桌面端由应用内网络拉取。"
        placeholder="https://example.com/bangumi-rule.json"
        onIdentify={handleOnlineIdentify}
      />
      <ImportCodeDialog
        open={codeOpen()}
        onOpenChange={setCodeOpen}
        title="代码导入番剧规则"
        description="粘贴 Kazumi 插件 JSON 或 Reader 番剧规则 JSON 文本后识别导入。"
        onIdentify={handleCodeIdentify}
      />
      <ImportBangumiRuleSelectDialog
        open={selectOpen()}
        loading={selectLoading()}
        loadingMessage={selectLoadingMessage()}
        comparisons={comparisons()}
        selectedKeys={selectedKeys()}
        importing={importing()}
        onOpenChange={setSelectOpen}
        onToggle={toggleSelected}
        onSelectAll={selectAllToggle}
        onInvert={invertSelect}
        onSelectNew={selectNewToggle}
        onSelectUpdate={selectUpdateToggle}
        onConfirm={confirmImport}
      />
      <SourceScriptEditDialog
        open={editOpen()}
        onOpenChange={setEditOpen}
        title={editTarget() ? `编辑 · ${editTarget()!.name}` : '编辑番剧规则'}
        description="直接编辑规则 JSON。显示名称仅用于列表展示，不会改写 payload 内的真实 name。"
        initialValue={editTarget()?.json ?? ''}
        initialDisplayName={editTarget()?.name ?? ''}
        language="json"
        saving={editSaving()}
        onSave={saveEditedRule}
        portalZClass="z-[70]"
      />
      <AppDialog open={batchDeleteOpen()} onOpenChange={setBatchDeleteOpen}>
        <AppDialogContent class="max-w-sm" portalZClass="z-[70]">
          <AppDialogHeader>
            <AppDialogTitle>删除所选规则</AppDialogTitle>
            <AppDialogDescription>
              确定删除已选的 {listSelectedCount()} 条规则吗？此操作不可撤销。
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
