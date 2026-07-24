/**
 * 番剧规则导入与管理：本地 / 网络 / 代码 + 规则库列表 + 规则仓库订阅
 * 对齐 TvConfigSourceManager；规则与 FongMi sites[]/Spider 隔离
 */

import { createSignal, For, Show, createMemo, onMount } from 'solid-js';
import { Download, Trash2 } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { AppTextField, AppTextFieldInput } from '@/components/shared/AppTextField';
import { ImportSourceNetworkDialog } from '@/components/media/reader/sources/ImportSourceNetworkDialog';
import { ImportCodeDialog } from '@/components/shared/ImportCodeDialog';
import { ImportLocalChoiceDialog } from '@/components/shared/ImportLocalChoiceDialog';
import { ImportBangumiRuleSelectDialog } from '@/components/media/viewer/video/tv/settings/ImportBangumiRuleSelectDialog';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { AppSwitch, AppSwitchControl, AppSwitchThumb } from '@/components/shared/AppSwitch';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import { showAppToast } from '@/components/shared/AppToasts';
import {
  downloadTextFile,
  downloadTextFilesZip,
  sanitizeExportFileName,
} from '@/lib/shared/download-source-scripts';
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
  loadBangumiRules,
  removeBangumiRule,
  upsertBangumiRule,
  type BangumiRule,
} from '@/lib/media/video/bangumi/rules';
import { updateAllBangumiRuleSubscriptions } from '@/lib/media/video/bangumi/subscription';
import {
  BANGUMI_RULE_API_LEVEL,
  addBangumiRuleSubscribeUrl,
  getBangumiModulePrefs,
  removeBangumiRuleSubscribeUrl,
} from '@/lib/media/video/bangumi/prefs';

const BANGUMI_RULE_FILE_FILTERS = [
  { name: 'Bangumi Rules', extensions: ['json'] },
  { name: 'All Files', extensions: ['*'] },
];

const RULE_LIST_HEIGHT_CLASS = 'h-80';

function isBangumiRuleFileName(fileName: string): boolean {
  return fileName.trim().toLowerCase().endsWith('.json');
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
        const files = await collectEligibleFilesFromDirectory(picked.ref, isBangumiRuleFileName);
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

  return (
    <div class="space-y-4">
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

      <div class="space-y-1.5">
        <p class="text-xs font-medium text-muted-foreground">规则库（{rules().length}）</p>
        <Show when={rules().length === 0}>
          <div class={`flex ${RULE_LIST_HEIGHT_CLASS} items-center justify-center rounded-md border text-sm text-muted-foreground`}>
            暂无规则，请先导入
          </div>
        </Show>
        <Show when={rules().length > 0}>
          <ul class={`${RULE_LIST_HEIGHT_CLASS} space-y-2 overflow-y-auto rounded-md border p-2`}>
            <For each={rules()}>
              {(r) => (
                <li class="flex items-center gap-2 rounded-md border border-border/50 px-2 py-1.5 text-sm hover:bg-accent/50">
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
                  <div class="min-w-0 flex-1">
                    <p class="truncate font-medium">{r.name}</p>
                    <p class="truncate text-[11px] text-muted-foreground">{r.baseUrl}</p>
                  </div>
                  <AppTooltip>
                    <AppTooltipTrigger as="div">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        class="h-8 w-8 shrink-0"
                        disabled={busy()}
                        aria-label={`导出 ${r.name}`}
                        onClick={() => exportOne(r)}
                      >
                        <Download class="h-4 w-4" />
                      </Button>
                    </AppTooltipTrigger>
                    <AppTooltipContent layer="viewer">导出规则</AppTooltipContent>
                  </AppTooltip>
                  <AppTooltip>
                    <AppTooltipTrigger as="div">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        class="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={busy()}
                        aria-label={`删除 ${r.name}`}
                        onClick={() => {
                          removeBangumiRule(r.id);
                          refresh();
                        }}
                      >
                        <Trash2 class="h-4 w-4" />
                      </Button>
                    </AppTooltipTrigger>
                    <AppTooltipContent layer="viewer">删除规则</AppTooltipContent>
                  </AppTooltip>
                </li>
              )}
            </For>
          </ul>

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
        <h4 class="text-xs font-semibold">规则仓库订阅</h4>
        <div class="flex gap-2">
          <AppTextField class="flex-1">
            <AppTextFieldInput
              placeholder="https://…/rules.json"
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
        directoryButtonHint="扫描文件夹内全部 .json"
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
