/**
 * MusicFree 插件管理（与 LX UserApi 设置隔离）
 */
import { createSignal, For, onCleanup, onMount, Show, type Component } from 'solid-js';
import {
  Trash2,
  RefreshCw,
  Upload,
  Download,
  ChevronUp,
  ChevronDown,
  Link,
} from 'lucide-solid';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { AppSwitch, AppSwitchControl, AppSwitchThumb } from '@/components/shared/AppSwitch';
import {
  importMfPluginFromText,
  importMfPluginFromUrl,
  listMfPlugins,
  mfImportMusicItemWithAnyPlugin,
  removeMfPlugin,
  reorderMfPlugins,
  setMfPluginEnabled,
  subscribeMfPlugins,
  type MfPluginRecord,
} from '@/lib/media/audio/online/mf-plugin';
import {
  getMfAlternativePluginId,
  getMfUserVariables,
  setMfAlternativePluginId,
  setMfUserVariables,
} from '@/lib/media/audio/online/mf-plugin/settings';
import {
  applyAllMfPluginUpdates,
  checkAllMfPluginUpdates,
  type MfPluginUpdateInfo,
} from '@/lib/media/audio/online/mf-plugin/update';
import {
  syncMusicFreeBackupViaWebDav,
} from '@/lib/media/audio/online/mf-plugin/webdav-backup';
import {
  getMfGlobalSettings,
  setMfGlobalSettings,
  subscribeMfGlobalSettings,
} from '@/lib/media/audio/online/mf-plugin/global-settings';
import {
  addMfPluginSubscribeUrl,
  removeMfPluginSubscribeUrl,
  updateAllMfPluginSubscriptions,
} from '@/lib/media/audio/online/mf-plugin/subscription';
// Hub 主题包 UI 已弃用：MF 主题能力保留在 theme-pack / theme-store，待主题工作室接入
import { ImportSourceNetworkDialog } from '@/components/media/reader/sources/ImportSourceNetworkDialog';
import { ImportCodeDialog } from '@/components/shared/ImportCodeDialog';
import { ImportMfPluginLocalDialog } from '@/components/media/viewer/audio/music/ImportMfPluginLocalDialog';
import { pickLocalMfPluginFiles } from '@/lib/media/audio/online/mf-plugin/pick-local-mf-plugin-file';
import { pickLocalMfPluginDirectory } from '@/lib/media/audio/online/mf-plugin/pick-local-mf-plugin-directory';
import { showAppToast } from '@/components/shared/AppToasts';
import { toUserFacingMusicError } from '@/lib/media/audio/music-user-error';
import { MusicAppSelect } from '@/components/media/viewer/audio/music/MusicAppSelect';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';

const MF_PLUGIN_DOC = 'https://github.com/maotoumao/MusicFreePlugins';

export const MusicFreePluginSettings: Component = () => {
  const [rev, setRev] = createSignal(0);
  const plugins = () => {
    rev();
    return listMfPlugins();
  };
  const [importing, setImporting] = createSignal(false);
  const [localChoiceOpen, setLocalChoiceOpen] = createSignal(false);
  const [onlineOpen, setOnlineOpen] = createSignal(false);
  const [codeOpen, setCodeOpen] = createSignal(false);
  const [varsTarget, setVarsTarget] = createSignal<MfPluginRecord | null>(null);
  const [varsDraft, setVarsDraft] = createSignal<Record<string, string>>({});
  const [altDraft, setAltDraft] = createSignal('');
  const [checkingUpdates, setCheckingUpdates] = createSignal(false);
  const [updateInfos, setUpdateInfos] = createSignal<MfPluginUpdateInfo[] | null>(null);
  const [webdavBusy, setWebdavBusy] = createSignal(false);
  const [globalRev, setGlobalRev] = createSignal(0);
  const [subscribeDraft, setSubscribeDraft] = createSignal('');
  const [importItemDraft, setImportItemDraft] = createSignal('');
  const [importItemBusy, setImportItemBusy] = createSignal(false);
  const mfGlobal = () => {
    globalRev();
    return getMfGlobalSettings();
  };

  onMount(() => {
    const unsub = subscribeMfPlugins(() => setRev((v) => v + 1));
    const unsubGlobal = subscribeMfGlobalSettings(() => setGlobalRev((v) => v + 1));
    onCleanup(() => {
      unsub();
      unsubGlobal();
    });
  });

  const importFiles = async (files: File[]) => {
    if (!files.length) {
      showAppToast({
        title: '未找到可导入文件',
        description: '目录中没有 .js / .json 插件文件',
        variant: 'warning',
      });
      return;
    }
    setImporting(true);
    try {
      let ok = 0;
      for (const file of files) {
        const text = await file.text();
        const result = await importMfPluginFromText({
          text,
          fileName: file.name,
        });
        if (result.ok) ok += 1;
        else {
          showAppToast({
            title: `导入失败：${file.name}`,
            description: result.error,
            variant: 'warning',
          });
        }
      }
      if (ok > 0) {
        showAppToast({
          title: `已导入 ${ok} 个 MusicFree 插件/订阅`,
          variant: 'success',
        });
      }
    } finally {
      setImporting(false);
    }
  };

  const handleLocalPickFile = () => {
    setLocalChoiceOpen(false);
    void (async () => {
      try {
        const files = await pickLocalMfPluginFiles();
        if (!files?.length) return;
        await importFiles(files);
      } catch (err) {
        showAppToast({
          title: '选择文件失败',
          description: toUserFacingMusicError(err),
          variant: 'error',
        });
      }
    })();
  };

  const handleLocalPickDirectory = () => {
    setLocalChoiceOpen(false);
    void (async () => {
      try {
        const picked = await pickLocalMfPluginDirectory();
        if (!picked) return;
        await importFiles(picked.files);
      } catch (err) {
        showAppToast({
          title: '选择目录失败',
          description: toUserFacingMusicError(err),
          variant: 'error',
        });
      }
    })();
  };

  const openVars = (p: MfPluginRecord) => {
    setVarsTarget(p);
    setVarsDraft(getMfUserVariables(p.id));
    setAltDraft(getMfAlternativePluginId(p.id) ?? '');
  };

  const saveVars = () => {
    const p = varsTarget();
    if (!p) return;
    setMfUserVariables(p.id, varsDraft());
    setMfAlternativePluginId(p.id, altDraft().trim() || null);
    setVarsTarget(null);
    showAppToast({ title: '已保存插件变量', variant: 'success' });
  };

  const altOptionIds = (): string[] => {
    const cur = varsTarget()?.id;
    return [
      '',
      ...plugins()
        .filter((p) => p.id !== cur && p.supportedMethods.includes('getMediaSource'))
        .map((p) => p.id),
    ];
  };

  const altLabel = (id: string) => {
    if (!id) return '无（本插件取链）';
    return plugins().find((p) => p.id === id)?.name ?? id;
  };

  const handleOnlineIdentify = async (url: string) => {
    setImporting(true);
    try {
      const result = await importMfPluginFromUrl(url);
      if (!result.ok) {
        showAppToast({
          title: '导入失败',
          description: result.error,
          variant: 'warning',
        });
        return;
      }
      showAppToast({
        title: result.skipped ? '插件已存在' : '导入成功',
        description: result.name,
        variant: 'success',
      });
    } finally {
      setImporting(false);
    }
  };

  const handleCodeIdentify = async (code: string) => {
    setImporting(true);
    try {
      const result = await importMfPluginFromText({ text: code });
      if (!result.ok) {
        showAppToast({
          title: '导入失败',
          description: result.error,
          variant: 'warning',
        });
        return;
      }
      showAppToast({
        title: result.skipped ? '插件已存在' : '导入成功',
        description: result.name,
        variant: 'success',
      });
    } finally {
      setImporting(false);
    }
  };

  const checkUpdates = async () => {
    setCheckingUpdates(true);
    try {
      const infos = await checkAllMfPluginUpdates();
      setUpdateInfos(infos);
      const count = infos.filter((i) => i.hasUpdate).length;
      showAppToast({
        title: count > 0 ? `发现 ${count} 个插件可更新` : '所有插件均为最新',
        variant: count > 0 ? 'success' : 'default',
      });
    } catch (err) {
      showAppToast({
        title: '检查更新失败',
        description: toUserFacingMusicError(err),
        variant: 'error',
      });
    } finally {
      setCheckingUpdates(false);
    }
  };

  const applyUpdates = async () => {
    setCheckingUpdates(true);
    try {
      const infos = updateInfos() ?? (await checkAllMfPluginUpdates());
      const count = await applyAllMfPluginUpdates(infos);
      setUpdateInfos(await checkAllMfPluginUpdates());
      showAppToast({
        title: count > 0 ? `已更新 ${count} 个插件` : '没有可应用的更新',
        variant: count > 0 ? 'success' : 'default',
      });
    } catch (err) {
      showAppToast({
        title: '更新失败',
        description: toUserFacingMusicError(err),
        variant: 'error',
      });
    } finally {
      setCheckingUpdates(false);
    }
  };

  const webdavAction = async (action: 'upload' | 'merge' | 'overwrite') => {
    setWebdavBusy(true);
    try {
      await syncMusicFreeBackupViaWebDav(action);
      showAppToast({
        title:
          action === 'upload'
            ? '已上传 MusicFree 风格备份'
            : action === 'merge'
              ? '已从 WebDAV 合并恢复'
              : '已从 WebDAV 覆盖恢复',
        variant: 'success',
      });
    } catch (err) {
      showAppToast({
        title: 'WebDAV 操作失败',
        description: toUserFacingMusicError(err),
        variant: 'error',
      });
    } finally {
      setWebdavBusy(false);
    }
  };

  const movePlugin = (id: string, direction: -1 | 1) => {
    const list = plugins();
    const index = list.findIndex((p) => p.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= list.length) return;
    const ids = list.map((p) => p.id);
    const next = [...ids];
    [next[index], next[target]] = [next[target]!, next[index]!];
    reorderMfPlugins(next);
  };

  const importMusicItem = async () => {
    const url = importItemDraft().trim();
    if (!url) {
      showAppToast({ title: '请输入歌曲链接', variant: 'warning' });
      return;
    }
    setImportItemBusy(true);
    try {
      const track = await mfImportMusicItemWithAnyPlugin(url);
      if (!track) {
        showAppToast({ title: '没有插件能识别此链接', variant: 'warning' });
        return;
      }
      const { playAsTemp } = await import('@/stores/viewer/media/audio');
      await playAsTemp([track], 0, { listName: '导入单曲', listKind: 'online-playlist' });
      showAppToast({ title: `已导入：${track.name}`, variant: 'success' });
      setImportItemDraft('');
    } catch (err) {
      showAppToast({
        title: '导入单曲失败',
        description: toUserFacingMusicError(err),
        variant: 'error',
      });
    } finally {
      setImportItemBusy(false);
    }
  };

  return (
    <div class="space-y-3">
      <div class="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={importing()} onClick={() => setLocalChoiceOpen(true)}>
          本地导入
        </Button>
        <Button size="sm" variant="outline" disabled={importing()} onClick={() => setOnlineOpen(true)}>
          在线 / 订阅
        </Button>
        <Button size="sm" variant="outline" disabled={importing()} onClick={() => setCodeOpen(true)}>
          粘贴代码
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => window.open(MF_PLUGIN_DOC, '_blank', 'noopener,noreferrer')}
        >
          插件说明
        </Button>
      </div>
      <p class="text-xs text-muted-foreground">
        MusicFree 插件与 LX 自定义源（UserApi）相互独立。源键为 mf:插件ID，不走 UserApi 协议。
      </p>

      <section class="space-y-2 rounded-md border p-3">
        <h3 class="text-sm font-medium">插件更新</h3>
        <p class="text-xs text-muted-foreground">
          根据插件 srcUrl 拉取远程脚本并比对版本号。
        </p>
        <div class="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={checkingUpdates()}
            onClick={() => void checkUpdates()}
          >
            <RefreshCw class="mr-1 h-3.5 w-3.5" />
            检查更新
          </Button>
          <Button
            size="sm"
            disabled={checkingUpdates() || (updateInfos()?.every((i) => !i.hasUpdate) ?? true)}
            onClick={() => void applyUpdates()}
          >
            应用全部更新
          </Button>
        </div>
        <Show when={updateInfos()?.length}>
          <ul class="max-h-32 space-y-1 overflow-y-auto text-xs text-muted-foreground">
            <For each={updateInfos() ?? []}>
              {(info) => (
                <li class="flex justify-between gap-2">
                  <span class="truncate">{info.name}</span>
                  <span class="shrink-0">
                    {info.hasUpdate
                      ? `${info.currentVersion ?? '?'} → ${info.remoteVersion ?? '?'}`
                      : info.error || '最新'}
                  </span>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </section>

      <section class="space-y-2 rounded-md border p-3">
        <h3 class="text-sm font-medium">全局选项</h3>
        <div class="flex flex-wrap items-center gap-4 text-sm">
          <label class="flex items-center gap-2">
            <AppSwitch
              checked={mfGlobal().autoUpdatePlugin}
              onChange={(v) => setMfGlobalSettings({ autoUpdatePlugin: v })}
            >
              <AppSwitchControl>
                <AppSwitchThumb />
              </AppSwitchControl>
            </AppSwitch>
            启动时自动更新插件
          </label>
          <label class="flex items-center gap-2">
            <AppSwitch
              checked={mfGlobal().autoSearchLyric}
              onChange={(v) => setMfGlobalSettings({ autoSearchLyric: v })}
            >
              <AppSwitchControl>
                <AppSwitchThumb />
              </AppSwitchControl>
            </AppSwitch>
            歌词缺失时自动搜索
          </label>
        </div>
        <div class="space-y-2">
          <Label>插件订阅源（plugins.json）</Label>
          <div class="flex gap-2">
            <input
              class="h-9 flex-1 rounded-md border bg-transparent px-3 text-sm"
              placeholder="https://example.com/plugins.json"
              value={subscribeDraft()}
              onInput={(e) => setSubscribeDraft(e.currentTarget.value)}
            />
            <Button
              size="sm"
              onClick={() => {
                addMfPluginSubscribeUrl(subscribeDraft());
                setSubscribeDraft('');
              }}
            >
              添加
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void updateAllMfPluginSubscriptions().then((r) =>
                  showAppToast({
                    title: `订阅更新完成：${r.ok} 成功 / ${r.failed} 失败`,
                    variant: 'success',
                  }),
                )
              }
            >
              更新全部订阅
            </Button>
          </div>
          <For each={mfGlobal().pluginSubscribeUrls}>
            {(url) => (
              <div class="flex items-center justify-between gap-2 text-xs">
                <span class="truncate">{url}</span>
                <Button size="sm" variant="ghost" onClick={() => removeMfPluginSubscribeUrl(url)}>
                  移除
                </Button>
              </div>
            )}
          </For>
        </div>
      </section>

      <section class="space-y-2 rounded-md border p-3">
        <h3 class="text-sm font-medium">导入单曲（importMusicItem）</h3>
        <p class="text-xs text-muted-foreground">
          粘贴歌曲分享链接，由支持 importMusicItem 的插件解析并播放。
        </p>
        <div class="flex gap-2">
          <input
            class="h-9 flex-1 rounded-md border bg-transparent px-3 text-sm"
            placeholder="https://..."
            value={importItemDraft()}
            onInput={(e) => setImportItemDraft(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void importMusicItem();
            }}
          />
          <Button size="sm" disabled={importItemBusy()} onClick={() => void importMusicItem()}>
            <Link class="mr-1 h-3.5 w-3.5" />
            导入
          </Button>
        </div>
      </section>

      <section class="space-y-2 rounded-md border p-3">
        <h3 class="text-sm font-medium">WebDAV 备份</h3>
        <p class="text-xs text-muted-foreground">
          上传/拉取 music/sync/musicfree_backup.json（歌单快照、插件清单、关联歌词）。
          需先在同步设置中配置 WebDAV。
        </p>
        <div class="flex flex-wrap items-center gap-4 text-sm">
          <label class="flex items-center gap-2">
            <AppSwitch
              checked={mfGlobal().webdavReinstallPlugins}
              onChange={(v) => setMfGlobalSettings({ webdavReinstallPlugins: v })}
            >
              <AppSwitchControl>
                <AppSwitchThumb />
              </AppSwitchControl>
            </AppSwitch>
            恢复时重装插件脚本
          </label>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={webdavBusy()}
            onClick={() => void webdavAction('upload')}
          >
            <Upload class="mr-1 h-3.5 w-3.5" />
            上传
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={webdavBusy()}
            onClick={() => void webdavAction('merge')}
          >
            <Download class="mr-1 h-3.5 w-3.5" />
            合并拉取
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={webdavBusy()}
            onClick={() => void webdavAction('overwrite')}
          >
            覆盖拉取
          </Button>
        </div>
      </section>

      <Show
        when={plugins().length > 0}
        fallback={
          <p class="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            暂无 MusicFree 插件。可从本地文件/目录、订阅源 URL 或粘贴代码导入。
          </p>
        }
      >
        <ul class="max-h-80 space-y-2 overflow-y-auto rounded-md border p-2">
          <For each={plugins()}>
            {(p) => (
              <li class="flex items-start gap-3 rounded-md border p-2">
                <div class="min-w-0 flex-1 space-y-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="truncate font-medium">{p.name}</span>
                    <Show when={p.version}>
                      <span class="text-xs text-muted-foreground">v{p.version}</span>
                    </Show>
                    <span class="text-[10px] text-muted-foreground">mf:{p.id.slice(0, 8)}</span>
                  </div>
                  <p class="truncate text-xs text-muted-foreground">
                    {p.supportedMethods.join(' · ') || '无方法'}
                  </p>
                  <Button size="sm" variant="ghost" class="h-7 px-2 text-xs" onClick={() => openVars(p)}>
                    变量 / 重定向
                  </Button>
                </div>
                <div class="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    class="h-8 w-8"
                    title="上移"
                    onClick={() => movePlugin(p.id, -1)}
                  >
                    <ChevronUp class="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    class="h-8 w-8"
                    title="下移"
                    onClick={() => movePlugin(p.id, 1)}
                  >
                    <ChevronDown class="h-4 w-4" />
                  </Button>
                  <AppSwitch
                    checked={p.enabled}
                    onChange={(v) => setMfPluginEnabled(p.id, v)}
                  >
                    <AppSwitchControl>
                      <AppSwitchThumb />
                    </AppSwitchControl>
                  </AppSwitch>
                  <Show when={!p.builtin}>
                    <Button
                      size="icon"
                      variant="ghost"
                      class="h-8 w-8 text-destructive"
                      onClick={() => {
                        if (window.confirm(`卸载插件「${p.name}」？`)) removeMfPlugin(p.id);
                      }}
                    >
                      <Trash2 class="h-4 w-4" />
                    </Button>
                  </Show>
                  <Show when={p.builtin}>
                    <span class="text-xs text-muted-foreground px-1">内置</span>
                  </Show>
                </div>
              </li>
            )}
          </For>
        </ul>
      </Show>

      <ImportMfPluginLocalDialog
        open={localChoiceOpen()}
        busy={importing()}
        onOpenChange={setLocalChoiceOpen}
        onPickFile={handleLocalPickFile}
        onPickDirectory={handleLocalPickDirectory}
      />
      <ImportSourceNetworkDialog
        open={onlineOpen()}
        onOpenChange={setOnlineOpen}
        title="导入 MusicFree 插件 / 订阅"
        description="支持单个插件 .js URL，或任意 MusicFree 订阅 JSON（plugins[].url）。"
        placeholder="https://example.com/plugin.js"
        onIdentify={(url) => {
          void handleOnlineIdentify(url);
        }}
      />

      <ImportCodeDialog
        open={codeOpen()}
        onOpenChange={setCodeOpen}
        title="粘贴 MusicFree 插件代码"
        language="javascript"
        description="粘贴 MusicFree 插件脚本，或 plugins.json 订阅清单。"
        onIdentify={(code) => {
          void handleCodeIdentify(code);
        }}
      />

      <AppDialog open={Boolean(varsTarget())} onOpenChange={(o) => !o && setVarsTarget(null)}>
        <AppDialogContent class="max-w-md">
          <AppDialogHeader>
            <AppDialogTitle>插件变量 · {varsTarget()?.name}</AppDialogTitle>
            <AppDialogDescription>
              用户变量供插件 env.getUserVariables() 读取；音源重定向用另一插件取链。
            </AppDialogDescription>
          </AppDialogHeader>
          <div class="space-y-3 py-2">
            <For each={varsTarget()?.userVariableDefs ?? []}>
              {(def) => (
                <div class="space-y-1">
                  <Label>{def.name || def.key}</Label>
                  <input
                    class="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                    placeholder={def.hint || def.key}
                    value={varsDraft()[def.key] ?? ''}
                    onInput={(e) =>
                      setVarsDraft((prev) => ({
                        ...prev,
                        [def.key]: e.currentTarget.value,
                      }))
                    }
                  />
                </div>
              )}
            </For>
            <Show when={(varsTarget()?.userVariableDefs?.length ?? 0) === 0}>
              <p class="text-xs text-muted-foreground">此插件未声明用户变量。</p>
            </Show>
            <div class="space-y-1">
              <Label>音源重定向（alternativePlugin）</Label>
              <MusicAppSelect
                value={altDraft()}
                options={altOptionIds()}
                optionLabel={altLabel}
                onChange={setAltDraft}
              />
            </div>
          </div>
          <AppDialogFooter>
            <Button variant="outline" onClick={() => setVarsTarget(null)}>
              取消
            </Button>
            <Button onClick={saveVars}>保存</Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>
    </div>
  );
};
