/**
 * 单一影视源导入与管理：本地 / 网络 / 代码 + 影视/直播各自选用
 */

import { createSignal, For, Show, createResource, createMemo } from 'solid-js';
import { Button } from '@/components/ui/button';
import { ImportSourceNetworkDialog } from '@/components/media/reader/sources/ImportSourceNetworkDialog';
import { ImportCodeDialog } from '@/components/shared/ImportCodeDialog';
import { ImportLocalChoiceDialog } from '@/components/shared/ImportLocalChoiceDialog';
import { ImportTvConfigSelectDialog } from '@/components/media/viewer/video/tv/settings/ImportTvConfigSelectDialog';
import { showAppToast } from '@/components/shared/AppToasts';
import { formatTvUserError } from '@/lib/media/tv/tv-user-error';
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

const EXT_LABEL = TV_CONFIG_IMPORT_EXTENSIONS.map((e) => `.${e}`).join('、');

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
          <p class="text-xs text-muted-foreground">加载中…</p>
        </Show>
        <Show when={!saved.loading && !(saved()?.length ?? 0)}>
          <p class="text-xs text-muted-foreground">暂无历史源，请先导入</p>
        </Show>
        <ul class="space-y-1">
          <For each={saved() ?? []}>
            {(c) => {
              const usedVod = () => c.url === home.configUrl;
              const usedLive = () => c.url === home.liveConfigUrl;
              const liveHint = () => {
                if (!home.liveNote) return '';
                // 只挂在「当前直播使用」的那条上，避免影视源的 lives 提示串到别的源
                if (home.liveConfigUrl) return usedLive() ? home.liveNote : '';
                return usedVod() ? home.liveNote : '';
              };
              return (
                <li class="flex items-center gap-2 rounded-md border border-border/50 px-2 py-1.5 text-sm">
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
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    class="h-7 shrink-0 px-2 text-xs text-destructive"
                    disabled={busy()}
                    onClick={() =>
                      void removeSavedTvConfig(c.id).then(() => refreshLibrary())
                    }
                  >
                    删除
                  </Button>
                </li>
              );
            }}
          </For>
        </ul>
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
    </div>
  );
}
