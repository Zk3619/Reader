import { createSignal, Show, onMount, For, createMemo, createEffect } from 'solid-js';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  getTvHomeState,
  refreshJarKind,
  refreshPyKind,
} from '@/stores/tv-hub/home';
import { pingLocalApi } from '@/lib/media/tv/local/api-client';
import {
  getAds,
  getHosts,
  getParses,
  getSites,
  getDefaultParseName,
  setDefaultParseName,
  updateSitePref,
  refreshSitePrefs,
} from '@/lib/media/tv/config/vod-config';
import * as LiveConfig from '@/lib/media/tv/config/live-config';
import { getTvNetSettings, setTvNetSettings } from '@/lib/media/tv/net/rules';
import { ensureTvProxyBridge } from '@/lib/media/tv/proxy/bridge';
import { clearJsSpiderCache } from '@/lib/media/tv/spider/js-engine';
import {
  getTvLiveUi,
  setTvLiveAcross,
  setTvLiveChange,
  setTvLiveHomeSourceName,
} from '@/stores/tv-hub/tv-live-ui';
import {
  cycleTvBuiltinWall,
  getTvWallUi,
  setTvWallIndex,
  setTvWallMode,
  TV_BUILTIN_WALL_COLORS,
  TV_WALL_MODE_LABELS,
} from '@/stores/tv-hub/tv-wall-ui';
import {
  getWallDesc,
  getVodWallUrl,
  listLibraryWallpaperOptions,
  loadWallFromLocalFile,
  loadWallMedia,
  refreshWallMedia,
  resolveWallPickInput,
  type LibraryWallpaperOption,
} from '@/lib/media/tv/config/wall-config';
import { pickFiles } from '@/lib/platform/fs/pick-file';
import { isUserCancelled } from '@/lib/platform/fs/errors';
import { readBytes } from '@/lib/platform/fs/read-write';
import { AppCombobox } from '@/components/shared/AppCombobox';
import { AppTabs } from '@/components/shared/AppTabs';
import { TvConfigSourceManager } from '@/components/media/viewer/video/tv/settings/TvConfigSourceManager';
import { TvHubPageShell } from '@/components/media/viewer/video/tv/hub/TvHubPageShell';
import { AppSwitch, AppSwitchControl, AppSwitchThumb } from '@/components/shared/AppSwitch';
import {
  AppSelect,
  AppSelectContent,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import { AppTextField, AppTextFieldInput } from '@/components/shared/AppTextField';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { LocalLibraryStorageSetting } from '@/components/settings/LocalLibraryStorageSetting';
import { RememberedChoicesSetting } from '@/components/settings/RememberedChoicesSetting';
import { settingsStore } from '@/stores/settings';
import { resolveModuleMediaRoot, getModuleSubdir } from '@/lib/media/media-root';
import { migrateModuleCaches } from '@/lib/media/media-root-migration';
import { getTvPlayPrefs, setTvPlayPrefs } from '@/lib/media/tv/play/tv-play-prefs';
import {
  getPreferredExternalPlayer,
  setPreferredExternalPlayer,
  type ExternalPlayerKind,
} from '@/lib/media/tv/play/external-player';
import {
  getVideoPlaybackPrefs,
  setVideoPlaybackPrefs,
  type VideoPlaybackPrefs,
} from '@/lib/media/video/playback/prefs';
import type { Anime4KMode, Anime4KQuality } from '@/lib/media/video/playback/types';
import {
  getDanDanPlayConfig,
  setDanDanPlayConfig,
} from '@/lib/media/video/danmaku/dandanplay';
import { getBiliCookie, setBiliCookie } from '@/lib/media/video/danmaku/bilibili-danmaku';
import { getWyzieConfig, setWyzieConfig } from '@/lib/media/video/subtitle/wyzie';
import { getLocalApiBase, pushSyncToDevice } from '@/lib/media/tv/local/sync';
import { getSniffRules } from '@/lib/media/tv/net/sniff-rules';
import { showAppToast } from '@/components/shared/AppToasts';

/** Kobalte Select 不能用空串作 option value，否则触发器不显示选中项 */
const LIVE_SOURCE_ORDER_FIRST = '__tv_live_order_first__';
const PARSE_ORDER_FIRST = '__tv_parse_order_first__';

function uniqueNonEmptyNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

function pickSelectValue(want: string, options: string[], fallback: string): string {
  if (options.includes(want)) return want;
  return fallback;
}

export function TvSettingsPane() {
  const home = getTvHomeState();
  const [localOk, setLocalOk] = createSignal<boolean | null>(null);
  const [net, setNet] = createSignal(getTvNetSettings());
  const [parseName, setParseName] = createSignal(getDefaultParseName());
  const [sitesTick, setSitesTick] = createSignal(0);
  const [wallUrlDraft, setWallUrlDraft] = createSignal(getTvWallUi().configUrl);
  const [wallLibOptions, setWallLibOptions] = createSignal<LibraryWallpaperOption[]>([]);
  const [videoRootPath, setVideoRootPath] = createSignal('');
  const [playPrefs, setPlayPrefs] = createSignal(getTvPlayPrefs());
  const [extPlayer, setExtPlayer] = createSignal(getPreferredExternalPlayer());
  const [playbackPrefs, setPlaybackPrefs] = createSignal(getVideoPlaybackPrefs());
  const [dandanCfg, setDandanCfg] = createSignal(getDanDanPlayConfig());
  const [biliCookie, setBiliCookieState] = createSignal(getBiliCookie());
  const [wyzieCfg, setWyzieCfg] = createSignal(getWyzieConfig());
  const [syncPeer, setSyncPeer] = createSignal('http://127.0.0.1:9978');
  const [localApi, setLocalApi] = createSignal('');
  const [syncBusy, setSyncBusy] = createSignal(false);
  const followGlobalRoot = () => settingsStore.state.app.videoUseGlobalMediaRoot !== false;

  const wallComboboxOptions = createMemo(() => {
    const labels = wallLibOptions().map((o) => o.label);
    const draft = wallUrlDraft().trim();
    if (!draft) return labels;
    if (labels.includes(draft)) return labels;
    if (wallLibOptions().some((o) => o.wallpaperUrl === draft)) return labels;
    return [draft, ...labels];
  });

  const reloadWallLibOptions = () => {
    void listLibraryWallpaperOptions().then(setWallLibOptions);
  };

  const liveSourceCount = createMemo(() => {
    void home.configRevision;
    void sitesTick();
    return LiveConfig.getLiveSources().length;
  });

  const liveNames = createMemo(() => {
    void home.configRevision;
    void sitesTick();
    return [
      LIVE_SOURCE_ORDER_FIRST,
      ...uniqueNonEmptyNames(LiveConfig.getLiveSources().map((l) => l.name ?? '')),
    ];
  }, undefined, {
    equals: (a, b) => a.length === b.length && a.every((v, i) => v === b[i]),
  });

  const parseNames = createMemo(() => {
    void home.configRevision;
    void sitesTick();
    // 用全量 parses 名作选项；勿依赖 getParses 的「首选置顶」副作用
    return [
      PARSE_ORDER_FIRST,
      ...uniqueNonEmptyNames(getParses().map((p) => p.name ?? '')),
    ];
  }, undefined, {
    equals: (a, b) => a.length === b.length && a.every((v, i) => v === b[i]),
  });

  // 配置切换后同步解析器偏好（避免 mount 时读到空配置）
  createEffect(() => {
    void home.configRevision;
    setParseName(getDefaultParseName());
    reloadWallLibOptions();
    const url = getTvWallUi().configUrl || getVodWallUrl();
    // label 在 options 刷新后由下一拍对齐；此处先放裸 URL
    setWallUrlDraft(url);
  });

  createEffect(() => {
    const url = getTvWallUi().configUrl || getVodWallUrl();
    const hit = wallLibOptions().find((o) => o.wallpaperUrl === url);
    if (hit) setWallUrlDraft(hit.label);
  });

  const liveSourceSelectValue = () => {
    const stored = getTvLiveUi().homeSourceName.trim();
    const want = stored || LIVE_SOURCE_ORDER_FIRST;
    return pickSelectValue(want, liveNames(), LIVE_SOURCE_ORDER_FIRST);
  };

  const parseSelectValue = () => {
    const stored = parseName().trim();
    const want = stored || PARSE_ORDER_FIRST;
    return pickSelectValue(want, parseNames(), PARSE_ORDER_FIRST);
  };

  const labelLiveSource = (raw: string) =>
    raw === LIVE_SOURCE_ORDER_FIRST ? '（配置顺序第一个）' : raw;
  const labelParse = (raw: string) =>
    raw === PARSE_ORDER_FIRST ? '（按配置顺序）' : raw;

  const pickLocalWall = () => {
    void (async () => {
      try {
        const picked = await pickFiles({
          multiple: false,
          filters: [
            {
              name: 'Wallpaper',
              extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'webm'],
            },
            { name: 'All Files', extensions: ['*'] },
          ],
        });
        if (!picked?.length) return;
        const p = picked[0]!;
        const file =
          p.legacyFile ??
          new File([await readBytes(p.ref)], p.fileName, {
            type: 'application/octet-stream',
          });
        await loadWallFromLocalFile(file);
        setWallUrlDraft(getTvWallUi().configUrl);
      } catch (e) {
        if (!isUserCancelled(e)) console.warn('[tv-wall] pick', e);
      }
    })();
  };

  onMount(() => {
    void refreshJarKind();
    void refreshPyKind(false);
    void ensureTvProxyBridge();
    void pingLocalApi().then(setLocalOk);
    void refreshSitePrefs().then(() => setSitesTick((n) => n + 1));
    reloadWallLibOptions();
    void resolveModuleMediaRoot('video').then(setVideoRootPath);
    void getLocalApiBase().then(setLocalApi);
  });

  const migrateIfNeeded = async (previousRoot: string, nextRoot: string) => {
    if (!previousRoot || !nextRoot || previousRoot.toLowerCase() === nextRoot.toLowerCase()) return;
    if (!confirm('影视模块目录已变化，是否立即迁移旧缓存到新目录？')) return;
    const result = await migrateModuleCaches('video', previousRoot, nextRoot);
    showAppToast({
      title: result.movedDirs.length > 0 ? '影视缓存迁移完成' : '无可迁移缓存',
      description: result.movedDirs.length > 0 ? `已迁移：${result.movedDirs.join('、')}` : '旧目录中未发现可迁移缓存目录',
    });
  };

  const pickVideoRoot = () => {
    void (async () => {
      const previousRoot = await resolveModuleMediaRoot('video');
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: settingsStore.state.app.videoMediaRootDirectory?.trim() || videoRootPath(),
      });
      if (typeof selected === 'string') {
        await settingsStore.updateAppSettings({
          videoUseGlobalMediaRoot: false,
          videoMediaRootDirectory: selected.trim(),
        });
        const nextRoot = await resolveModuleMediaRoot('video');
        setVideoRootPath(nextRoot);
        await migrateIfNeeded(previousRoot, nextRoot);
      }
    })();
  };

  return (
    <TvHubPageShell
      section="settings"
      description="源导入与选用、网络与 Spider 引擎"
    >
      <div class="flex min-h-0 flex-1 flex-col gap-6 py-3">
        <TvConfigSourceManager />

        <div class="space-y-3">
          <h3 class="text-sm font-semibold">影视媒体目录</h3>
          <p class="text-xs text-muted-foreground">
            影视缓存默认使用 MediaRoot/{getModuleSubdir('video')} 子目录；可在此切换为模块自定义目录。
          </p>
          <div class="flex items-center gap-2">
            <Checkbox
              id="tv-root-follow-global-input"
              checked={followGlobalRoot()}
              onChange={(checked) => {
                void (async () => {
                  const previousRoot = await resolveModuleMediaRoot('video');
                  await settingsStore.updateAppSettings({ videoUseGlobalMediaRoot: checked });
                  const nextRoot = await resolveModuleMediaRoot('video');
                  setVideoRootPath(nextRoot);
                  await migrateIfNeeded(previousRoot, nextRoot);
                })();
              }}
            />
            <Label for="tv-root-follow-global-input">跟随全局 MediaRoot</Label>
          </div>
          <p class="break-all font-mono text-xs text-muted-foreground">{videoRootPath() || '—'}</p>
          <Show when={!followGlobalRoot()}>
            <div class="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={pickVideoRoot}>
                选择自定义目录
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  void (async () => {
                    const previousRoot = await resolveModuleMediaRoot('video');
                    await settingsStore.updateAppSettings({ videoMediaRootDirectory: undefined });
                    const nextRoot = await resolveModuleMediaRoot('video');
                    setVideoRootPath(nextRoot);
                    await migrateIfNeeded(previousRoot, nextRoot);
                  })();
                }}
              >
                清除自定义目录
              </Button>
            </div>
          </Show>
        </div>

        <div class="space-y-3 border-t border-border/40 pt-4">
          <LocalLibraryStorageSetting moduleKey="video" />
        </div>

        <div class="space-y-3 border-t border-border/40 pt-4">
          <RememberedChoicesSetting scope="video" />
        </div>

        <div class="space-y-2">
          <h3 class="text-sm font-semibold">引擎状态</h3>
          <p class="text-sm text-muted-foreground">
            JAR 后端：<span class="font-mono text-foreground">{home.jarKind}</span>
          </p>
          <p class="text-xs text-muted-foreground">
            dex-native = Android DexClassLoader；dex2jar-host = 桌面 Java 侧车；unavailable = 未就绪
          </p>
          <p class="text-sm text-muted-foreground">
            Python：<span class="font-mono text-foreground">{home.pyKind}</span>
            <Show when={home.pyDetail}>
              <span class="ml-2 text-xs">({home.pyDetail})</span>
            </Show>
          </p>
          <p class="text-xs text-muted-foreground">
            Guard/JNI/.so 类 JAR 仅 Android 可用；桌面侧车覆盖纯 Java CSP。Python 优先本机
            CPython（需 PATH），否则 Pyodide（无 lxml）。嗅探 rules：
            {getSniffRules().length} 条 · ads {getAds().length} · hosts {getHosts().length}
          </p>
          <div class="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void refreshPyKind(true)}
            >
              重新检测 Python
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                clearJsSpiderCache();
                void (async () => {
                  try {
                    const { invoke } = await import('@tauri-apps/api/core');
                    await invoke('tv_jar_clear_cache');
                  } catch (e) {
                    console.warn('[tv] clear jar cache', e);
                  }
                })();
              }}
            >
              清理 JS / JAR 缓存
            </Button>
          </div>
        </div>

        <div class="space-y-3">
          <h3 class="text-sm font-semibold">网络（DoH / 代理）</h3>
          <div class="flex items-center justify-between gap-3">
            <Label for="tv-net-doh-input" class="text-sm font-normal">
              启用 DoH
            </Label>
            <AppSwitch
              checked={net().dohEnabled}
              onChange={(checked) => setNet(setTvNetSettings({ dohEnabled: checked }))}
              aria-label="启用 DoH"
            >
              <AppSwitchControl>
                <AppSwitchThumb />
              </AppSwitchControl>
            </AppSwitch>
          </div>
          <AppTextField layout="bare">
            <AppTextFieldInput
              value={net().dohUrl}
              onInput={(e: Event) =>
                setNet(setTvNetSettings({ dohUrl: (e.currentTarget as HTMLInputElement).value }))
              }
              placeholder="https://dns.alidns.com/dns-query"
            />
          </AppTextField>
          <div class="flex items-center justify-between gap-3">
            <Label for="tv-net-proxy-input" class="text-sm font-normal">
              启用 HTTP 代理前缀
            </Label>
            <AppSwitch
              checked={net().proxyEnabled}
              onChange={(checked) => setNet(setTvNetSettings({ proxyEnabled: checked }))}
              aria-label="启用 HTTP 代理前缀"
            >
              <AppSwitchControl>
                <AppSwitchThumb />
              </AppSwitchControl>
            </AppSwitch>
          </div>
          <AppTextField layout="bare">
            <AppTextFieldInput
              value={net().proxyUrl}
              onInput={(e: Event) =>
                setNet(setTvNetSettings({ proxyUrl: (e.currentTarget as HTMLInputElement).value }))
              }
              placeholder="http://127.0.0.1:7890"
            />
          </AppTextField>
        </div>

        <div class="space-y-3">
          <h3 class="text-sm font-semibold">壁纸</h3>
          <p class="text-xs text-muted-foreground">
            对齐音乐主题「跟随主程序」；URL / 本地为覆盖来源。接口 JSON 的 wallpaper
            可从下方 Combobox 按源选取。
          </p>
          <AppTabs
            layout="stacked"
            variant="settings-equal"
            value={getTvWallUi().mode}
            options={['follow', 'url', 'local', 'builtin'] as const}
            labels={TV_WALL_MODE_LABELS}
            ariaLabel="壁纸来源"
            onChange={(mode) => {
              setTvWallMode(mode);
              if (mode === 'url') reloadWallLibOptions();
            }}
          />
          <p class="text-xs text-muted-foreground">
            当前：
            <span class="font-mono text-foreground">{getWallDesc()}</span>
            <Show when={getVodWallUrl() && getTvWallUi().mode === 'follow'}>
              <span class="ml-2">· 配置含 wallpaper（选用「应用 URL」可拉取）</span>
            </Show>
          </p>
          <Show when={getTvWallUi().error}>
            <p class="text-xs text-muted-foreground">{getTvWallUi().error}</p>
          </Show>

          <Show when={getTvWallUi().mode === 'follow'}>
            <p class="text-xs text-muted-foreground">
              不绘制自定义壁纸层，背景跟随主程序 / module.tv 主题（主题工作室接入后统一完善）。
            </p>
          </Show>

          <Show when={getTvWallUi().mode === 'url'}>
            <div class="space-y-2">
              <p class="text-xs text-muted-foreground">
                可直接输入地址，或从已保存源的 wallpaper 字段下拉选择（项内标明来源）
              </p>
              <AppCombobox
                class="w-full"
                aria-label="壁纸 URL"
                placeholder="https://…/wallpaper.jpg 或选择源内配置"
                value={wallUrlDraft()}
                onChange={setWallUrlDraft}
                options={wallComboboxOptions()}
              />
              <div class="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={getTvWallUi().loading || !wallUrlDraft().trim()}
                  onClick={() => {
                    const url = resolveWallPickInput(wallUrlDraft(), wallLibOptions());
                    void loadWallMedia(url, { force: true }).then(() => {
                      const hit = wallLibOptions().find((o) => o.wallpaperUrl === url);
                      setWallUrlDraft(hit?.label ?? url);
                    });
                  }}
                >
                  应用此 URL
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={getTvWallUi().loading}
                  onClick={() => void refreshWallMedia()}
                >
                  刷新
                </Button>
              </div>
            </div>
          </Show>

          <Show when={getTvWallUi().mode === 'local'}>
            <div class="space-y-2">
              <p class="text-xs text-muted-foreground">
                从本机选择图片 / GIF / 视频作为影视 Hub 壁纸
                <Show when={getTvWallUi().localName}>
                  <span class="ml-2 font-mono text-foreground">
                    · {getTvWallUi().localName}
                  </span>
                </Show>
              </p>
              <Button
                type="button"
                size="sm"
                disabled={getTvWallUi().loading}
                onClick={pickLocalWall}
              >
                选择本地文件
              </Button>
            </div>
          </Show>

          <Show when={getTvWallUi().mode === 'builtin'}>
            <div class="space-y-2">
              <div class="flex flex-wrap gap-2">
                <For each={[1, 2, 3, 4]}>
                  {(i) => (
                    <button
                      type="button"
                      class={cn(
                        'h-8 w-8 rounded-md border border-border/60',
                        getTvWallUi().wall === i && 'ring-2 ring-ring',
                      )}
                      style={{ 'background-color': TV_BUILTIN_WALL_COLORS[i] }}
                      aria-label={`内置壁纸 ${i}`}
                      onClick={() => setTvWallIndex(i)}
                    />
                  )}
                </For>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => cycleTvBuiltinWall()}
                >
                  切换下一张
                </Button>
              </div>
            </div>
          </Show>
        </div>

        <div class="space-y-3">
          <h3 class="text-sm font-semibold">直播行为</h3>
          <p class="text-xs text-muted-foreground">
            对齐 fongmi LiveSetting：默认频道源、跨组换台、失败自动切线路
          </p>
          <div class="space-y-1.5">
            <p class="text-xs text-muted-foreground">默认直播频道源</p>
            <AppSelect
              value={liveSourceSelectValue()}
              onChange={(name) => {
                const next =
                  !name || name === LIVE_SOURCE_ORDER_FIRST ? '' : name;
                if (next === getTvLiveUi().homeSourceName) return;
                setTvLiveHomeSourceName(next);
              }}
              options={liveNames()}
              itemComponent={(itemProps) => (
                <AppSelectItem item={itemProps.item}>
                  {labelLiveSource(String(itemProps.item.rawValue))}
                </AppSelectItem>
              )}
            >
              <AppSelectTrigger layout="form" class="h-9" aria-label="默认直播频道源">
                <AppSelectValue>
                  {(sel) => {
                    const raw = sel.selectedOption();
                    return raw != null
                      ? labelLiveSource(String(raw))
                      : '（配置顺序第一个）';
                  }}
                </AppSelectValue>
                <AppSelectIcon />
              </AppSelectTrigger>
              <AppSelectContent>
                <AppSelectListbox />
              </AppSelectContent>
            </AppSelect>
          </div>
          <div class="flex items-center justify-between gap-3">
            <Label class="text-sm font-normal">换台跨分组（across）</Label>
            <AppSwitch
              checked={getTvLiveUi().across}
              onChange={(checked) => setTvLiveAcross(checked)}
              aria-label="换台跨分组"
            >
              <AppSwitchControl>
                <AppSwitchThumb />
              </AppSwitchControl>
            </AppSwitch>
          </div>
          <div class="flex items-center justify-between gap-3">
            <Label class="text-sm font-normal">播放失败自动切线路（change）</Label>
            <AppSwitch
              checked={getTvLiveUi().change}
              onChange={(checked) => setTvLiveChange(checked)}
              aria-label="播放失败自动切线路"
            >
              <AppSwitchControl>
                <AppSwitchThumb />
              </AppSwitchControl>
            </AppSwitch>
          </div>
          <Show when={liveSourceCount() === 0}>
            <p class="text-xs text-muted-foreground">
              {home.liveNote || '请先导入配置并在「直播使用」中选择源'}
            </p>
          </Show>
        </div>

        <div class="space-y-3">
          <h3 class="text-sm font-semibold">播放 / 弹幕</h3>
          <p class="text-xs text-muted-foreground">
            对齐 FongMi 弹幕观感设置与片头/片尾跳过；发送弹幕仍关闭（无上云接口）。PiP
            由播放器内建开启。
          </p>
          <div class="flex items-center justify-between gap-3">
            <Label class="text-sm font-normal">加载弹幕</Label>
            <AppSwitch
              checked={playPrefs().danmakuEnabled}
              onChange={(checked) => setPlayPrefs(setTvPlayPrefs({ danmakuEnabled: checked }))}
              aria-label="加载弹幕"
            >
              <AppSwitchControl>
                <AppSwitchThumb />
              </AppSwitchControl>
            </AppSwitch>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <AppTextField>
              <Label class="text-xs text-muted-foreground">弹幕透明度 (0.1–1)</Label>
              <AppTextFieldInput
                type="number"
                min={0.1}
                max={1}
                step={0.05}
                value={String(playPrefs().danmakuOpacity)}
                onInput={(e: Event) => {
                  const v = Number((e.currentTarget as HTMLInputElement).value);
                  if (!Number.isFinite(v)) return;
                  setPlayPrefs(setTvPlayPrefs({ danmakuOpacity: v }));
                }}
              />
            </AppTextField>
            <AppTextField>
              <Label class="text-xs text-muted-foreground">弹幕字号</Label>
              <AppTextFieldInput
                type="number"
                min={12}
                max={48}
                step={1}
                value={String(playPrefs().danmakuFontSize)}
                onInput={(e: Event) => {
                  const v = Number((e.currentTarget as HTMLInputElement).value);
                  if (!Number.isFinite(v)) return;
                  setPlayPrefs(setTvPlayPrefs({ danmakuFontSize: v }));
                }}
              />
            </AppTextField>
            <AppTextField>
              <Label class="text-xs text-muted-foreground">弹幕速度</Label>
              <AppTextFieldInput
                type="number"
                min={1}
                max={20}
                step={1}
                value={String(playPrefs().danmakuSpeed)}
                onInput={(e: Event) => {
                  const v = Number((e.currentTarget as HTMLInputElement).value);
                  if (!Number.isFinite(v)) return;
                  setPlayPrefs(setTvPlayPrefs({ danmakuSpeed: v }));
                }}
              />
            </AppTextField>
            <AppTextField>
              <Label class="text-xs text-muted-foreground">片头跳过（秒，0=关）</Label>
              <AppTextFieldInput
                type="number"
                min={0}
                max={600}
                step={1}
                value={String(playPrefs().openingSkipSec)}
                onInput={(e: Event) => {
                  const v = Number((e.currentTarget as HTMLInputElement).value);
                  if (!Number.isFinite(v)) return;
                  setPlayPrefs(setTvPlayPrefs({ openingSkipSec: v }));
                }}
              />
            </AppTextField>
            <AppTextField>
              <Label class="text-xs text-muted-foreground">片尾跳过（剩余秒，0=关）</Label>
              <AppTextFieldInput
                type="number"
                min={0}
                max={600}
                step={1}
                value={String(playPrefs().endingSkipSec)}
                onInput={(e: Event) => {
                  const v = Number((e.currentTarget as HTMLInputElement).value);
                  if (!Number.isFinite(v)) return;
                  setPlayPrefs(setTvPlayPrefs({ endingSkipSec: v }));
                }}
              />
            </AppTextField>
          </div>
        </div>

        <div class="space-y-3">
          <h3 class="text-sm font-semibold">外置播放器</h3>
          <p class="text-xs text-muted-foreground">
            Artplayer 打不开硬片源时，可交 mpv / VLC / 系统默认打开当前直链。mpv
            会附带字幕 / Anime4K shaders（若已配置）与可选 IPC。
          </p>
          <AppSelect
            value={extPlayer()}
            onChange={(v) => {
              const kind = (v || 'system') as ExternalPlayerKind;
              setExtPlayer(kind);
              setPreferredExternalPlayer(kind);
              setPlaybackPrefs(setVideoPlaybackPrefs({ externalKind: kind }));
            }}
            options={['system', 'mpv', 'vlc']}
            itemComponent={(itemProps) => (
              <AppSelectItem item={itemProps.item}>
                {String(itemProps.item.rawValue)}
              </AppSelectItem>
            )}
          >
            <AppSelectTrigger layout="form" class="h-9" aria-label="外置播放器">
              <AppSelectValue>{(sel) => String(sel.selectedOption() ?? 'system')}</AppSelectValue>
              <AppSelectIcon />
            </AppSelectTrigger>
            <AppSelectContent>
              <AppSelectListbox />
            </AppSelectContent>
          </AppSelect>
          <label class="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={playbackPrefs().externalIpcEnabled}
              onChange={(e) =>
                setPlaybackPrefs(
                  setVideoPlaybackPrefs({
                    externalIpcEnabled: e.currentTarget.checked,
                  }),
                )
              }
            />
            外置 mpv 启用 IPC（进度尽力回读）
          </label>
        </div>

        <div class="space-y-3">
          <h3 class="text-sm font-semibold">播放内核 / Anime4K</h3>
          <p class="text-xs text-muted-foreground">
            路由见 docs/VIDEO_PLAYBACK_KERNEL.md。强制增强核需桌面 libmpv
            feature 或外置 mpv。
          </p>
          <AppSelect
            value={playbackPrefs().forceEngine}
            onChange={(v) => {
              const fe = (v || 'auto') as VideoPlaybackPrefs['forceEngine'];
              setPlaybackPrefs(setVideoPlaybackPrefs({ forceEngine: fe }));
            }}
            options={['auto', 'artplayer', 'libmpv', 'media3', 'external']}
            itemComponent={(itemProps) => (
              <AppSelectItem item={itemProps.item}>
                {String(itemProps.item.rawValue)}
              </AppSelectItem>
            )}
          >
            <AppSelectTrigger layout="form" class="h-9" aria-label="强制播放引擎">
              <AppSelectValue>
                {(sel) => String(sel.selectedOption() ?? 'auto')}
              </AppSelectValue>
              <AppSelectIcon />
            </AppSelectTrigger>
            <AppSelectContent>
              <AppSelectListbox />
            </AppSelectContent>
          </AppSelect>
          <div class="grid grid-cols-2 gap-2">
            <AppSelect
              value={playbackPrefs().anime4kMode}
              onChange={(v) => {
                const mode = (v || 'off') as Anime4KMode;
                setPlaybackPrefs(setVideoPlaybackPrefs({ anime4kMode: mode }));
              }}
              options={['off', 'A', 'B', 'C', 'AA', 'BB', 'CA']}
              itemComponent={(itemProps) => (
                <AppSelectItem item={itemProps.item}>
                  {String(itemProps.item.rawValue)}
                </AppSelectItem>
              )}
            >
              <AppSelectTrigger layout="form" class="h-9" aria-label="Anime4K 模式">
                <AppSelectValue>
                  {(sel) => `A4K ${String(sel.selectedOption() ?? 'off')}`}
                </AppSelectValue>
                <AppSelectIcon />
              </AppSelectTrigger>
              <AppSelectContent>
                <AppSelectListbox />
              </AppSelectContent>
            </AppSelect>
            <AppSelect
              value={playbackPrefs().anime4kQuality}
              onChange={(v) => {
                const q = (v || 'balanced') as Anime4KQuality;
                setPlaybackPrefs(setVideoPlaybackPrefs({ anime4kQuality: q }));
              }}
              options={['fast', 'balanced', 'high']}
              itemComponent={(itemProps) => (
                <AppSelectItem item={itemProps.item}>
                  {String(itemProps.item.rawValue)}
                </AppSelectItem>
              )}
            >
              <AppSelectTrigger layout="form" class="h-9" aria-label="Anime4K 质量">
                <AppSelectValue>
                  {(sel) => String(sel.selectedOption() ?? 'balanced')}
                </AppSelectValue>
                <AppSelectIcon />
              </AppSelectTrigger>
              <AppSelectContent>
                <AppSelectListbox />
              </AppSelectContent>
            </AppSelect>
          </div>
          <AppTextField>
            <Label class="text-xs text-muted-foreground">
              Anime4K shaders 目录（空=仅文件名，需 mpv 能解析）
            </Label>
            <AppTextFieldInput
              value={playbackPrefs().anime4kShadersDir}
              onInput={(e: Event) =>
                setPlaybackPrefs(
                  setVideoPlaybackPrefs({
                    anime4kShadersDir: (e.currentTarget as HTMLInputElement).value,
                  }),
                )
              }
              placeholder="D:\\shaders\\anime4k"
            />
          </AppTextField>
          <AppTextField>
            <Label class="text-xs text-muted-foreground">默认外挂字幕路径</Label>
            <AppTextFieldInput
              value={playbackPrefs().preferredSubtitlePath}
              onInput={(e: Event) =>
                setPlaybackPrefs(
                  setVideoPlaybackPrefs({
                    preferredSubtitlePath: (e.currentTarget as HTMLInputElement)
                      .value,
                  }),
                )
              }
            />
          </AppTextField>
          <label class="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={playbackPrefs().androidFallbackMedia3}
              onChange={(e) =>
                setPlaybackPrefs(
                  setVideoPlaybackPrefs({
                    androidFallbackMedia3: e.currentTarget.checked,
                  }),
                )
              }
            />
            Android：主路失败时尝试 Media3
          </label>
        </div>

        <div class="space-y-3">
          <h3 class="text-sm font-semibold">弹幕 / 字幕 API 密钥</h3>
          <p class="text-xs text-muted-foreground">
            弹弹play / B 站 Cookie / wyzie；未配置则相关入口不可用。
          </p>
          <AppTextField>
            <Label class="text-xs text-muted-foreground">弹弹 appId</Label>
            <AppTextFieldInput
              value={dandanCfg().appId}
              onInput={(e: Event) =>
                setDandanCfg(
                  setDanDanPlayConfig({
                    appId: (e.currentTarget as HTMLInputElement).value,
                  }),
                )
              }
            />
          </AppTextField>
          <AppTextField>
            <Label class="text-xs text-muted-foreground">弹弹 appSecret</Label>
            <AppTextFieldInput
              type="password"
              value={dandanCfg().appSecret}
              onInput={(e: Event) =>
                setDandanCfg(
                  setDanDanPlayConfig({
                    appSecret: (e.currentTarget as HTMLInputElement).value,
                  }),
                )
              }
            />
          </AppTextField>
          <AppTextField>
            <Label class="text-xs text-muted-foreground">B 站 Cookie（可选）</Label>
            <AppTextFieldInput
              value={biliCookie()}
              onInput={(e: Event) => {
                const v = (e.currentTarget as HTMLInputElement).value;
                setBiliCookie(v);
                setBiliCookieState(v);
              }}
            />
          </AppTextField>
          <AppTextField>
            <Label class="text-xs text-muted-foreground">wyzie API key</Label>
            <AppTextFieldInput
              type="password"
              value={wyzieCfg().apiKey}
              onInput={(e: Event) =>
                setWyzieCfg(
                  setWyzieConfig({
                    apiKey: (e.currentTarget as HTMLInputElement).value,
                  }),
                )
              }
            />
          </AppTextField>
        </div>

        <div class="space-y-3">
          <h3 class="text-sm font-semibold">多机同步（LOCAL do=sync）</h3>
          <p class="text-xs text-muted-foreground">
            本机 API：
            <span class="font-mono text-foreground">{localApi() || '…'}</span>
            。向对端（另一台 Reader / FongMi）推送历史或收藏。
          </p>
          <AppTextField>
            <Label class="text-xs text-muted-foreground">对端 base URL</Label>
            <AppTextFieldInput
              value={syncPeer()}
              onInput={(e: Event) =>
                setSyncPeer((e.currentTarget as HTMLInputElement).value)
              }
              placeholder="http://192.168.1.8:9978"
            />
          </AppTextField>
          <div class="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={syncBusy() || !syncPeer().trim()}
              onClick={() => {
                setSyncBusy(true);
                void pushSyncToDevice({
                  baseUrl: syncPeer().trim(),
                  type: 'history',
                  mode: '0',
                })
                  .then(() =>
                    showAppToast({ title: '已推送历史', description: syncPeer() }),
                  )
                  .catch((e) =>
                    showAppToast({
                      title: '同步失败',
                      description: e instanceof Error ? e.message : String(e),
                    }),
                  )
                  .finally(() => setSyncBusy(false));
              }}
            >
              推送历史
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={syncBusy() || !syncPeer().trim()}
              onClick={() => {
                setSyncBusy(true);
                void pushSyncToDevice({
                  baseUrl: syncPeer().trim(),
                  type: 'keep',
                  mode: '0',
                })
                  .then(() =>
                    showAppToast({ title: '已推送收藏', description: syncPeer() }),
                  )
                  .catch((e) =>
                    showAppToast({
                      title: '同步失败',
                      description: e instanceof Error ? e.message : String(e),
                    }),
                  )
                  .finally(() => setSyncBusy(false));
              }}
            >
              推送收藏
            </Button>
          </div>
        </div>

        <div class="space-y-1.5">
          <h3 class="text-sm font-semibold">默认解析器</h3>
          <AppSelect
            value={parseSelectValue()}
            onChange={(v) => {
              const name = !v || v === PARSE_ORDER_FIRST ? '' : v;
              if (name === parseName()) return;
              setParseName(name);
              setDefaultParseName(name);
            }}
            options={parseNames()}
            itemComponent={(itemProps) => (
              <AppSelectItem item={itemProps.item}>
                {labelParse(String(itemProps.item.rawValue))}
              </AppSelectItem>
            )}
          >
            <AppSelectTrigger layout="form" class="h-9" aria-label="默认解析器">
              <AppSelectValue>
                {(sel) => {
                  const raw = sel.selectedOption();
                  return raw != null ? labelParse(String(raw)) : '（按配置顺序）';
                }}
              </AppSelectValue>
              <AppSelectIcon />
            </AppSelectTrigger>
            <AppSelectContent>
              <AppSelectListbox />
            </AppSelectContent>
          </AppSelect>
        </div>

        <div class="space-y-2">
          <h3 class="text-sm font-semibold">站点偏好（searchable / changeable）</h3>
          <For each={(sitesTick(), getSites().slice(0, 40))}>
            {(s) => (
              <div class="flex flex-wrap items-center gap-4 text-sm">
                <span class="min-w-32 truncate font-medium">{s.name}</span>
                <div class="flex items-center gap-2">
                  <AppSwitch
                    checked={s.searchable !== 0}
                    onChange={(checked) => {
                      void updateSitePref(
                        s.key,
                        checked ? 1 : 0,
                        s.changeable ?? 1,
                      ).then(() => setSitesTick((n) => n + 1));
                    }}
                    aria-label={`${s.name} 可搜索`}
                  >
                    <AppSwitchControl>
                      <AppSwitchThumb />
                    </AppSwitchControl>
                  </AppSwitch>
                  <span class="text-xs text-muted-foreground">可搜索</span>
                </div>
                <div class="flex items-center gap-2">
                  <AppSwitch
                    checked={s.changeable !== 0}
                    onChange={(checked) => {
                      void updateSitePref(
                        s.key,
                        s.searchable ?? 1,
                        checked ? 1 : 0,
                      ).then(() => setSitesTick((n) => n + 1));
                    }}
                    aria-label={`${s.name} 可换源`}
                  >
                    <AppSwitchControl>
                      <AppSwitchThumb />
                    </AppSwitchControl>
                  </AppSwitch>
                  <span class="text-xs text-muted-foreground">可换源</span>
                </div>
              </div>
            )}
          </For>
        </div>

        <div class="space-y-1 text-xs text-muted-foreground">
          <p>
            本地 Proxy / LOCAL API：
            {localOk() == null ? '检测中…' : localOk() ? '可用' : '未启动'}
          </p>
          <p>
            网络规则：ads {getAds().length} · hosts {getHosts().length}
          </p>
        </div>
      </div>
    </TvHubPageShell>
  );
}
