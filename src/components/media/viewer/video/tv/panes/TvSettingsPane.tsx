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
// 影视壁纸 UI / wall-config 调用已弃用：能力保留在 tv-wall-ui / wall-config，待主题工作室接入
import { TvBangumiSettingsSection } from '@/components/media/viewer/video/tv/settings/TvBangumiSettingsSection';
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
import {
  getDanmakuPrefs,
  setDanmakuPrefs,
  type DanmakuPrefs,
} from '@/lib/media/video/danmaku/danmaku-prefs';
import {
  getArtplayerPlaySettings,
  setArtplayerPlaySettings,
} from '@/lib/media/video/artplayer/play-settings-prefs';
import {
  getDanmuApiPrefs,
  isMergeAllowedSource,
  listDefaultSourceIds,
  parseEnabledSources,
  parseMergeSources,
  serializeEnabledSources,
  serializeMergeSources,
  setDanmuApiPrefs,
  type DanmuApiPrefs,
} from '@/lib/media/video/danmaku/danmu-api/prefs';
import {
  getTvPlayUiState,
  setTvMiniPlayerEnabled,
  setTvAutoSwitchFlagOnError,
  setTvPauseOnTrayHide,
  setTvRestoreWindowOnPipLeave,
} from '@/stores/tv-hub/tv-play-ui';
import {
  addExternalPlayerPreset,
  getPreferredExternalPlayer,
  listExternalPlayerOptions,
  removeExternalPlayerPreset,
  resolveExternalPlayerSelection,
  setPreferredExternalPlayer,
} from '@/lib/media/tv/play/external-player';
import {
  getVideoPlaybackPrefs,
  parseExternalCustomId,
  setVideoPlaybackPrefs,
  type LibmpvHwdecPreset,
  type LibmpvVideoOutput,
  type LocalPlaybackEnginePref,
  type VideoPlaybackPrefs,
} from '@/lib/media/video/playback/prefs';
import {
  AUDIO_EQ_PRESET_LABELS,
  AUDIO_EQ_PRESET_OPTIONS,
  type AudioEqPreset,
} from '@/lib/media/video/playback/audio-eq';
import type { Anime4KMode, Anime4KQuality } from '@/lib/media/video/playback/types';
import { probeLibMpvStatus } from '@/lib/media/video/playback/libmpv-engine';
import { probeAndroidLibmpvStatus } from '@/lib/media/video/playback/android-player';
import { probeAnime4KShadersPresent } from '@/lib/media/video/playback/shaders-dir';
import { probeRifeStatus } from '@/lib/media/video/playback/rife-probe';
import type { RifeProbeStatus } from '@/lib/media/video/playback/frame-interp';
import { isAndroid } from '@/lib/platform/detect';

import {
  ANIME4K_MODE_LABELS,
  ANIME4K_MODE_OPTIONS,
  ANIME4K_QUALITY_LABELS,
  ANIME4K_QUALITY_OPTIONS,
  evaluateAnime4KAvailability,
  FORCE_ENGINE_LABELS,
  FORCE_ENGINE_OPTIONS,
  HWDEC_PRESET_LABELS,
  HWDEC_PRESET_OPTIONS,
  PLAYBACK_TERM_NOTES,
  VIDEO_OUTPUT_LABELS,
  VIDEO_OUTPUT_OPTIONS,
} from '@/lib/media/video/playback/mpv-launch';
import {
  getDanDanPlayConfig,
  setDanDanPlayConfig,
} from '@/lib/media/video/danmaku/dandanplay';
import { getBiliCookie, setBiliCookie } from '@/lib/media/video/danmaku/bilibili-danmaku';
import { getWyzieConfig, setWyzieConfig } from '@/lib/media/video/subtitle/wyzie';
import { getLocalApiBase, pushSyncToDevice } from '@/lib/media/tv/local/sync';
import { getSniffRules } from '@/lib/media/tv/net/sniff-rules';
import { showAppToast } from '@/components/shared/AppToasts';
import { CookieHubDebugPanel } from '@/components/shared/CookieHubDebugPanel';

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

const LOCAL_ENGINE_OPTIONS: LocalPlaybackEnginePref[] = [
  'libmpv',
  'artplayer',
  'external',
  'media3',
];

const LOCAL_ENGINE_LABELS: Record<LocalPlaybackEnginePref, string> = {
  libmpv: 'Libmpv',
  artplayer: 'Artplayer',
  external: 'External',
  media3: 'Media3 (Android)',
};


const DANMU_SOURCE_LABELS: Record<string, string> = {
  tencent: '腾讯视频',
  youku: '优酷',
  iqiyi: '爱奇艺',
  imgo: '芒果TV',
  bilibili: '哔哩哔哩',
  migu: '咪咕',
  '360': '360看',
  sohu: '搜狐',
  leshi: '乐视',
  dandan: '弹弹play',
  animeko: 'Animeko',
  bahamut: '巴哈姆特',
  xigua: '西瓜',
  maiduidui: '埋堆堆',
  aiyifan: '爱壹帆',
  douban: '豆瓣',
  renren: '人人',
  hanjutv: '韩剧TV',
};

export function TvSettingsPane() {
  const home = getTvHomeState();
  const [localOk, setLocalOk] = createSignal<boolean | null>(null);
  const [net, setNet] = createSignal(getTvNetSettings());
  const [parseName, setParseName] = createSignal(getDefaultParseName());
  const [sitesTick, setSitesTick] = createSignal(0);
  const [videoRootPath, setVideoRootPath] = createSignal('');
  const [playPrefs, setPlayPrefs] = createSignal<DanmakuPrefs>(getDanmakuPrefs());
  const [danmuApiCfg, setDanmuApiCfg] = createSignal(getDanmuApiPrefs());
  const [playModeTick, setPlayModeTick] = createSignal(0);
  const [miniPlayerOn, setMiniPlayerOn] = createSignal(
    getTvPlayUiState().miniPlayerEnabled !== false,
  );
  const [pauseOnTrayHide, setPauseOnTrayHide] = createSignal(
    getTvPlayUiState().pauseOnTrayHide !== false,
  );
  const [restoreWindowOnPipLeave, setRestoreWindowOnPipLeave] = createSignal(
    getTvPlayUiState().restoreWindowOnPipLeave !== false,
  );
  const [autoSwitchFlagOn, setAutoSwitchFlagOn] = createSignal(
    getTvPlayUiState().autoSwitchFlagOnError !== false,
  );
  const patchDanmuApi = (patch: Partial<DanmuApiPrefs>) =>
    setDanmuApiCfg(setDanmuApiPrefs(patch));
  const danmuSourceEnabled = (id: string) =>
    parseEnabledSources(danmuApiCfg().sourceOrder).includes(id);
  const danmuSourceInMerge = (id: string) =>
    parseMergeSources(danmuApiCfg().mergeSourcePairs).includes(id);
  const toggleDanmuSource = (id: string, on: boolean) => {
    const enabled = new Set(parseEnabledSources(danmuApiCfg().sourceOrder));
    const merge = new Set(parseMergeSources(danmuApiCfg().mergeSourcePairs));
    if (on) enabled.add(id);
    else {
      enabled.delete(id);
      merge.delete(id);
    }
    patchDanmuApi({
      sourceOrder: serializeEnabledSources(enabled),
      mergeSourcePairs: serializeMergeSources(merge),
    });
  };
  const toggleDanmuMerge = (id: string, on: boolean) => {
    if (!isMergeAllowedSource(id)) return;
    const enabled = new Set(parseEnabledSources(danmuApiCfg().sourceOrder));
    const merge = new Set(parseMergeSources(danmuApiCfg().mergeSourcePairs));
    if (on) {
      enabled.add(id);
      merge.add(id);
    } else {
      merge.delete(id);
    }
    patchDanmuApi({
      sourceOrder: serializeEnabledSources(enabled),
      mergeSourcePairs: serializeMergeSources(merge),
    });
  };
  const playModeAutoNext = () => {
    void playModeTick();
    return getArtplayerPlaySettings().playMode === 'autoNext';
  };
  const [extPlayer, setExtPlayer] = createSignal(getPreferredExternalPlayer());
  const [playbackPrefs, setPlaybackPrefs] = createSignal(getVideoPlaybackPrefs());
  const [dandanCfg, setDandanCfg] = createSignal(getDanDanPlayConfig());
  const [biliCookie, setBiliCookieState] = createSignal(getBiliCookie());
  const [wyzieCfg, setWyzieCfg] = createSignal(getWyzieConfig());
  const [syncPeer, setSyncPeer] = createSignal('http://127.0.0.1:9978');
  const [localApi, setLocalApi] = createSignal('');
  const [syncBusy, setSyncBusy] = createSignal(false);
  const [libmpvStatusText, setLibmpvStatusText] = createSignal('探测中…');
  const [androidLibmpvStatusText, setAndroidLibmpvStatusText] =
    createSignal('探测中…');
  const [anime4kStatusText, setAnime4kStatusText] = createSignal('');
  const [libmpvAvailable, setLibmpvAvailable] = createSignal(false);
  const [shadersReady, setShadersReady] = createSignal(false);
  const [rifeStatus, setRifeStatus] = createSignal<RifeProbeStatus | null>(null);
  const followGlobalRoot = () => settingsStore.state.app.videoUseGlobalMediaRoot !== false;

  const anime4kUsable = createMemo(() =>
    evaluateAnime4KAvailability({
      prefs: playbackPrefs(),
      shadersReady: shadersReady(),
      libmpvAvailable: libmpvAvailable(),
    }),
  );

  /** 必须订阅 playbackPrefs，否则增删预设后 AppSelect options 不刷新 */
  const extPlayerOptions = createMemo(() =>
    listExternalPlayerOptions(playbackPrefs()),
  );
  const extPlayerOptionValues = createMemo(() =>
    extPlayerOptions().map((o) => o.value),
  );
  const extPlayerLabel = (value: string) =>
    extPlayerOptions().find((o) => o.value === value)?.label ?? value;

  const syncExtPlayerFromPrefs = (prefs = getVideoPlaybackPrefs()) => {
    setPlaybackPrefs(prefs);
    const kind = resolveExternalPlayerSelection(prefs.externalKind, prefs);
    setExtPlayer(kind);
    if (kind !== prefs.externalKind) {
      setPreferredExternalPlayer(kind);
    }
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

  onMount(() => {
    void refreshJarKind();
    void refreshPyKind(false);
    void ensureTvProxyBridge();
    void pingLocalApi().then(setLocalOk);
    void refreshSitePrefs().then(() => setSitesTick((n) => n + 1));
    void resolveModuleMediaRoot('video').then(setVideoRootPath);
    void getLocalApiBase().then(setLocalApi);
    void (async () => {
      const st = await probeLibMpvStatus();
      setLibmpvAvailable(st.available);
      setLibmpvStatusText(
        st.available
          ? `Libmpv · Available · ${st.detail}`
          : st.featureEnabled
            ? `Libmpv · Compiled but unavailable · ${st.detail}`
            : `Libmpv · Not in this build · use pnpm tauri:dev:libmpv`,
      );
      const shaders = await probeAnime4KShadersPresent();
      setShadersReady(shaders.ready);
      setAnime4kStatusText(
        shaders.ready
          ? `Anime4K Shaders · Ready · ${shaders.dir}`
          : `Anime4K Shaders · Missing · ${shaders.detail}`,
      );
      const andSt = await probeAndroidLibmpvStatus();
      setAndroidLibmpvStatusText(
        andSt.available
          ? `Android libmpv · Available · ${andSt.detail}`
          : `Android libmpv · Unavailable · ${andSt.detail}`,
      );
      try {
        setRifeStatus(await probeRifeStatus());
      } catch {
        setRifeStatus({
          available: false,
          backend: null,
          detail: 'RIFE 探测失败',
          scriptPath: '',
          models: [],
          hasTrt: false,
          hasDml: false,
          hasNcnn: false,
        });
      }
    })();
  });

  createEffect(() => {
    const prefs = playbackPrefs();
    void prefs.libmpvVideoOutput;
    void prefs.anime4kForceGpuVo;
    void prefs.anime4kShadersDir;
    void prefs.externalKind;
    void probeAnime4KShadersPresent().then((shaders) => {
      setShadersReady(shaders.ready);
      setAnime4kStatusText(
        shaders.ready
          ? `Anime4K Shaders · Ready · ${shaders.dir}`
          : `Anime4K Shaders · Missing · ${shaders.detail}`,
      );
    });
  });

  // Force Engine 使 Anime4K 无效时，立刻关掉 Mode（不依赖异步 Shader 探测）
  createEffect(() => {
    const prefs = playbackPrefs();
    if (
      prefs.anime4kMode !== 'off' &&
      (prefs.forceEngine === 'artplayer' ||
        prefs.forceEngine === 'media3' ||
        (prefs.forceEngine === 'external' && prefs.externalKind !== 'mpv'))
    ) {
      setPlaybackPrefs(
        setVideoPlaybackPrefs({ anime4kMode: 'off', anime4kDeblur: false }),
      );
    }
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
          <h3 class="text-sm font-semibold">CONFIG logo / notice</h3>
          <p class="text-xs text-muted-foreground">
            来自当前 Vod 配置顶层字段；首页会展示 logo 与公告。壁纸能力已弃用，改由主题工作室统一接管。
          </p>
          <div class="mb-2 space-y-1 rounded-md border border-border/50 p-2">
            <Show when={getTvHomeState().logoUrl}>
              <img
                src={getTvHomeState().logoUrl}
                alt=""
                class="h-12 w-12 rounded object-contain"
              />
            </Show>
            <p class="wrap-break-word text-xs text-muted-foreground">
              {getTvHomeState().notice || '（当前无 notice）'}
            </p>
          </div>
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
            全局共用：点播与番剧同一套观感与续播偏好。选源见下方「内置弹幕源」。发送弹幕见番剧设置「允许本地/远程发送」。画中画（PiP）由播放器内建开启，下方可配置托盘与返回标签页行为。
          </p>
          <div class="flex items-center justify-between gap-3">
            <Label class="text-sm font-normal">加载弹幕</Label>
            <AppSwitch
              checked={playPrefs().danmakuEnabled}
              onChange={(checked) => setPlayPrefs(setDanmakuPrefs({ danmakuEnabled: checked }))}
              aria-label="加载弹幕"
            >
              <AppSwitchControl>
                <AppSwitchThumb />
              </AppSwitchControl>
            </AppSwitch>
          </div>
          <div class="flex items-center justify-between gap-3">
            <div>
              <Label class="text-sm font-normal">续播进度</Label>
              <p class="text-[11px] text-muted-foreground">记住上次播放位置（Artplayer autoPlayback）</p>
            </div>
            <AppSwitch
              checked={playPrefs().playResume}
              onChange={(checked) => setPlayPrefs(setDanmakuPrefs({ playResume: checked }))}
              aria-label="续播进度"
            >
              <AppSwitchControl>
                <AppSwitchThumb />
              </AppSwitchControl>
            </AppSwitch>
          </div>
          <div class="flex items-center justify-between gap-3">
            <div>
              <Label class="text-sm font-normal">播完自动下一集</Label>
              <p class="text-[11px] text-muted-foreground">写入播放器 playMode</p>
            </div>
            <AppSwitch
              checked={playModeAutoNext()}
              onChange={(checked) => {
                setArtplayerPlaySettings({ playMode: checked ? 'autoNext' : 'pause' });
                setPlayModeTick((n) => n + 1);
              }}
              aria-label="播完自动下一集"
            >
              <AppSwitchControl>
                <AppSwitchThumb />
              </AppSwitchControl>
            </AppSwitch>
          </div>
          <div class="flex items-center justify-between gap-3">
            <div>
              <Label class="text-sm font-normal">视频小窗续播</Label>
              <p class="text-[11px] text-muted-foreground">
                离开播放页或切到其它模块时，右下角小窗继续播放
              </p>
            </div>
            <AppSwitch
              checked={miniPlayerOn()}
              onChange={(checked) => {
                setTvMiniPlayerEnabled(checked);
                setMiniPlayerOn(checked);
              }}
              aria-label="视频小窗续播"
            >
              <AppSwitchControl>
                <AppSwitchThumb />
              </AppSwitchControl>
            </AppSwitch>
          </div>
          <div class="flex items-center justify-between gap-3">
            <div>
              <Label class="text-sm font-normal">托盘隐藏时暂停视频</Label>
              <p class="text-[11px] text-muted-foreground">
                仅隐藏到托盘时生效；任务栏最小化不停播。画中画中即使藏托盘也继续播；从托盘恢复时若曾自动暂停则续播
              </p>
            </div>
            <AppSwitch
              checked={pauseOnTrayHide()}
              onChange={(checked) => {
                setTvPauseOnTrayHide(checked);
                setPauseOnTrayHide(checked);
              }}
              aria-label="托盘隐藏时暂停视频"
            >
              <AppSwitchControl>
                <AppSwitchThumb />
              </AppSwitchControl>
            </AppSwitch>
          </div>
          <div class="flex items-center justify-between gap-3">
            <div>
              <Label class="text-sm font-normal">画中画返回时唤起窗口</Label>
              <p class="text-[11px] text-muted-foreground">
                点画中画「返回标签页」时，若主窗已最小化或藏在托盘，则恢复并聚焦
              </p>
            </div>
            <AppSwitch
              checked={restoreWindowOnPipLeave()}
              onChange={(checked) => {
                setTvRestoreWindowOnPipLeave(checked);
                setRestoreWindowOnPipLeave(checked);
              }}
              aria-label="画中画返回时唤起窗口"
            >
              <AppSwitchControl>
                <AppSwitchThumb />
              </AppSwitchControl>
            </AppSwitch>
          </div>
          <div class="flex items-center justify-between gap-3">
            <div>
              <Label class="text-sm font-normal">播放失败自动切线路</Label>
              <p class="text-[11px] text-muted-foreground">
                点播多线路时，解析或播放失败优先尝试下一线路，再跨站换源
              </p>
            </div>
            <AppSwitch
              checked={autoSwitchFlagOn()}
              onChange={(checked) => {
                setTvAutoSwitchFlagOnError(checked);
                setAutoSwitchFlagOn(checked);
              }}
              aria-label="播放失败自动切线路"
            >
              <AppSwitchControl>
                <AppSwitchThumb />
              </AppSwitchControl>
            </AppSwitch>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <AppTextField>
              <Label class="text-xs text-muted-foreground">弹幕透明度 (0.1–1，1=不透明)</Label>
              <AppTextFieldInput
                type="number"
                min={0.1}
                max={1}
                step={0.05}
                value={String(playPrefs().danmakuOpacity)}
                onInput={(e: Event) => {
                  const v = Number((e.currentTarget as HTMLInputElement).value);
                  if (!Number.isFinite(v)) return;
                  setPlayPrefs(setDanmakuPrefs({ danmakuOpacity: v }));
                }}
              />
            </AppTextField>
            <AppTextField>
              <Label class="text-xs text-muted-foreground">弹幕字号</Label>
              <AppTextFieldInput
                type="number"
                min={12}
                max={120}
                step={1}
                value={String(playPrefs().danmakuFontSize)}
                onInput={(e: Event) => {
                  const v = Number((e.currentTarget as HTMLInputElement).value);
                  if (!Number.isFinite(v)) return;
                  setPlayPrefs(setDanmakuPrefs({ danmakuFontSize: v }));
                }}
              />
            </AppTextField>
            <div class="grid gap-2">
              <Label class="text-xs text-muted-foreground">弹幕速度</Label>
              <AppSelect
                value={String(playPrefs().danmakuSpeed)}
                options={['10', '7.5', '5', '2.5', '1']}
                onChange={(raw) => {
                  const v = Number(raw);
                  if (!Number.isFinite(v)) return;
                  setPlayPrefs(setDanmakuPrefs({ danmakuSpeed: v }));
                }}
                itemComponent={(itemProps) => (
                  <AppSelectItem item={itemProps.item}>
                    {itemProps.item.rawValue === '10'
                      ? '极慢'
                      : itemProps.item.rawValue === '7.5'
                        ? '较慢'
                        : itemProps.item.rawValue === '5'
                          ? '适中'
                          : itemProps.item.rawValue === '2.5'
                            ? '较快'
                            : '极快'}
                  </AppSelectItem>
                )}
              >
                <AppSelectTrigger layout="form" class="h-9" aria-label="弹幕速度">
                  <AppSelectValue>
                    {(state) => {
                      const v = String(state.selectedOption() ?? '');
                      if (v === '10') return '极慢';
                      if (v === '7.5') return '较慢';
                      if (v === '5') return '适中';
                      if (v === '2.5') return '较快';
                      if (v === '1') return '极快';
                      return '适中';
                    }}
                  </AppSelectValue>
                  <AppSelectIcon />
                </AppSelectTrigger>
                <AppSelectContent>
                  <AppSelectListbox />
                </AppSelectContent>
              </AppSelect>
            </div>
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
                  setPlayPrefs(setDanmakuPrefs({ openingSkipSec: v }));
                }}
              />
            </AppTextField>
            <p class="text-[11px] text-muted-foreground">
              片头：Artplayer 主路自动跳；Libmpv / 外置 MPV 开播时作为 start 秒写入。
            </p>
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
                  setPlayPrefs(setDanmakuPrefs({ endingSkipSec: v }));
                }}
              />
            </AppTextField>
            <p class="text-[11px] text-muted-foreground">
              片尾：仅 Artplayer 主路根据剩余时长自动跳过；独立增强窗不做片尾检测。
            </p>
          </div>


          <h4 class="pt-2 text-xs font-semibold text-muted-foreground">弹幕观感</h4>
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="grid gap-2">
              <Label class="text-xs text-muted-foreground">显示区域</Label>
              <AppSelect
                value={String(playPrefs().danmakuArea)}
                options={['0.1', '0.25', '0.5', '0.75', '1']}
                onChange={(raw) => {
                  const v = Number(raw);
                  if (!Number.isFinite(v)) return;
                  setPlayPrefs(setDanmakuPrefs({ danmakuArea: v }));
                }}
                itemComponent={(itemProps) => (
                  <AppSelectItem item={itemProps.item}>
                    {itemProps.item.rawValue === '0.1'
                      ? '10%'
                      : itemProps.item.rawValue === '0.25'
                        ? '25%'
                        : itemProps.item.rawValue === '0.5'
                          ? '50%'
                          : itemProps.item.rawValue === '0.75'
                            ? '75%'
                            : '100%'}
                  </AppSelectItem>
                )}
              >
                <AppSelectTrigger layout="form" class="h-9" aria-label="弹幕显示区域">
                  <AppSelectValue>
                    {(state) => {
                      const v = String(state.selectedOption() ?? '');
                      if (v === '0.1') return '10%';
                      if (v === '0.25') return '25%';
                      if (v === '0.5') return '50%';
                      if (v === '0.75') return '75%';
                      if (v === '1') return '100%';
                      return '100%';
                    }}
                  </AppSelectValue>
                  <AppSelectIcon />
                </AppSelectTrigger>
                <AppSelectContent>
                  <AppSelectListbox />
                </AppSelectContent>
              </AppSelect>
            </div>
            <AppTextField>
              <Label class="text-xs text-muted-foreground">时间轴偏移（秒）</Label>
              <AppTextFieldInput
                type="number"
                min={-180}
                max={180}
                step={1}
                value={String(playPrefs().danmakuTimeOffset)}
                onInput={(e: Event) => {
                  const v = Number((e.currentTarget as HTMLInputElement).value);
                  if (!Number.isFinite(v)) return;
                  setPlayPrefs(setDanmakuPrefs({ danmakuTimeOffset: v }));
                }}
              />
            </AppTextField>
          </div>
          <div class="flex items-center justify-between gap-3">
            <Label class="text-sm font-normal">顶部弹幕</Label>
            <AppSwitch
              checked={playPrefs().danmakuTop}
              onChange={(checked) => setPlayPrefs(setDanmakuPrefs({ danmakuTop: checked }))}
              aria-label="顶部弹幕"
            >
              <AppSwitchControl>
                <AppSwitchThumb />
              </AppSwitchControl>
            </AppSwitch>
          </div>
          <div class="flex items-center justify-between gap-3">
            <Label class="text-sm font-normal">底部弹幕</Label>
            <AppSwitch
              checked={playPrefs().danmakuBottom}
              onChange={(checked) => setPlayPrefs(setDanmakuPrefs({ danmakuBottom: checked }))}
              aria-label="底部弹幕"
            >
              <AppSwitchControl>
                <AppSwitchThumb />
              </AppSwitchControl>
            </AppSwitch>
          </div>
          <div class="flex items-center justify-between gap-3">
            <Label class="text-sm font-normal">滚动弹幕</Label>
            <AppSwitch
              checked={playPrefs().danmakuScroll}
              onChange={(checked) => setPlayPrefs(setDanmakuPrefs({ danmakuScroll: checked }))}
              aria-label="滚动弹幕"
            >
              <AppSwitchControl>
                <AppSwitchThumb />
              </AppSwitchControl>
            </AppSwitch>
          </div>
          <div class="grid gap-2">
            <Label class="text-xs text-muted-foreground">弹幕密度</Label>
            <AppSelect
              value={playPrefs().danmakuDensity}
              options={['less', 'normal', 'more']}
              onChange={(v) => {
                if (v !== 'less' && v !== 'normal' && v !== 'more') return;
                setPlayPrefs(setDanmakuPrefs({ danmakuDensity: v }));
              }}
              itemComponent={(itemProps) => (
                <AppSelectItem item={itemProps.item}>
                  {itemProps.item.rawValue === 'less'
                    ? '较少'
                    : itemProps.item.rawValue === 'more'
                      ? '较多'
                      : '正常'}
                </AppSelectItem>
              )}
            >
              <AppSelectTrigger layout="form" class="h-9" aria-label="弹幕密度">
                <AppSelectValue>
                  {(state) => {
                    const v = state.selectedOption() as string | undefined;
                    if (v === 'less') return '较少';
                    if (v === 'more') return '较多';
                    return '正常';
                  }}
                </AppSelectValue>
                <AppSelectIcon />
              </AppSelectTrigger>
              <AppSelectContent>
                <AppSelectListbox />
              </AppSelectContent>
            </AppSelect>
            <p class="text-[11px] text-muted-foreground">
              「较少」行距更大、更难同行复用；「正常」适中；「较多」行距更紧、更易跟轨并略加快。与下方「防重叠」独立：防重叠关闭时满轨可叠轨。
            </p>
          </div>
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <Label class="text-sm font-normal">防重叠</Label>
              <p class="text-[11px] text-muted-foreground">
                开启时满轨弹幕等待空位；关闭后允许叠轨并轻微偏移。播放器面板亦可切换。
              </p>
            </div>
            <AppSwitch
              checked={playPrefs().danmakuAntiOverlap !== false}
              onChange={(checked) =>
                setPlayPrefs(setDanmakuPrefs({ danmakuAntiOverlap: checked }))
              }
              aria-label="防重叠"
            >
              <AppSwitchControl>
                <AppSwitchThumb />
              </AppSwitchControl>
            </AppSwitch>
          </div>
          <div class="flex items-center justify-between gap-3">
            <Label class="text-sm font-normal">弹幕去重</Label>
            <AppSwitch
              checked={playPrefs().danmakuDeduplication}
              onChange={(checked) =>
                setPlayPrefs(setDanmakuPrefs({ danmakuDeduplication: checked }))
              }
              aria-label="弹幕去重"
            >
              <AppSwitchControl>
                <AppSwitchThumb />
              </AppSwitchControl>
            </AppSwitch>
          </div>
          <div class="flex items-center justify-between gap-3">
            <Label class="text-sm font-normal">描边</Label>
            <AppSwitch
              checked={playPrefs().danmakuBorder}
              onChange={(checked) => setPlayPrefs(setDanmakuPrefs({ danmakuBorder: checked }))}
              aria-label="描边"
            >
              <AppSwitchControl>
                <AppSwitchThumb />
              </AppSwitchControl>
            </AppSwitch>
          </div>
          <div class="flex items-center justify-between gap-3">
            <Label class="text-sm font-normal">彩色弹幕</Label>
            <AppSwitch
              checked={playPrefs().danmakuColor}
              onChange={(checked) => setPlayPrefs(setDanmakuPrefs({ danmakuColor: checked }))}
              aria-label="彩色弹幕"
            >
              <AppSwitchControl>
                <AppSwitchThumb />
              </AppSwitchControl>
            </AppSwitch>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <Label class="text-sm font-normal">跟随播放倍速</Label>
            <AppSwitch
              checked={playPrefs().danmakuFollowSpeed}
              onChange={(checked) =>
                setPlayPrefs(setDanmakuPrefs({ danmakuFollowSpeed: checked }))
              }
              aria-label="跟随播放倍速"
            >
              <AppSwitchControl>
                <AppSwitchThumb />
              </AppSwitchControl>
            </AppSwitch>
          </div>
          <div class="flex items-center justify-between gap-3">
            <Label class="text-sm font-normal">弹幕随屏幕缩放</Label>
            <AppSwitch
              checked={playPrefs().danmakuScaleWithScreen}
              onChange={(checked) =>
                setPlayPrefs(setDanmakuPrefs({ danmakuScaleWithScreen: checked }))
              }
              aria-label="弹幕随屏幕缩放"
            >
              <AppSwitchControl>
                <AppSwitchThumb />
              </AppSwitchControl>
            </AppSwitch>
          </div>
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <Label class="text-sm font-normal">防挡字幕</Label>
              <p class="text-[11px] text-muted-foreground">视频底部 15% 为空白保留区，不推送弹幕</p>
            </div>
            <AppSwitch
              checked={playPrefs().danmakuAvoidSubtitle}
              onChange={(checked) =>
                setPlayPrefs(setDanmakuPrefs({ danmakuAvoidSubtitle: checked }))
              }
              aria-label="防挡字幕"
            >
              <AppSwitchControl>
                <AppSwitchThumb />
              </AppSwitchControl>
            </AppSwitch>
          </div>
          <AppTextField>
            <Label class="text-xs text-muted-foreground">屏蔽关键词（逗号分隔）</Label>
            <AppTextFieldInput
              value={playPrefs().danmakuBlockKeywords.join(',')}
              onInput={(e: Event) => {
                const raw = (e.currentTarget as HTMLInputElement).value;
                const words = raw
                  .split(/[,，]/)
                  .map((x) => x.trim())
                  .filter(Boolean);
                setPlayPrefs(setDanmakuPrefs({ danmakuBlockKeywords: words }));
              }}
            />
          </AppTextField>

          <h4 class="pt-2 text-xs font-semibold text-muted-foreground">增强窗弹幕 ASS</h4>
          <p class="text-[11px] text-muted-foreground">
            Libmpv 增强窗将弹幕转为 ASS（滚动 \\move / 顶底 \\pos）后 sub-add；与主路
            Artplayer 弹幕插件相互独立。
          </p>
          <div class="flex items-center justify-between gap-3">
            <Label class="text-sm font-normal">匹配后自动挂载</Label>
            <AppSwitch
              checked={playPrefs().libmpvDanmakuAutoAttach}
              onChange={(checked) =>
                setPlayPrefs(setDanmakuPrefs({ libmpvDanmakuAutoAttach: checked }))
              }
              aria-label="匹配后自动挂载"
            >
              <AppSwitchControl>
                <AppSwitchThumb />
              </AppSwitchControl>
            </AppSwitch>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <AppTextField>
              <Label class="text-xs text-muted-foreground">ASS 字号</Label>
              <AppTextFieldInput
                type="number"
                min={16}
                max={96}
                step={1}
                value={String(playPrefs().libmpvDanmakuFontSize)}
                onInput={(e: Event) => {
                  const v = Number((e.currentTarget as HTMLInputElement).value);
                  if (!Number.isFinite(v)) return;
                  setPlayPrefs(setDanmakuPrefs({ libmpvDanmakuFontSize: v }));
                }}
              />
            </AppTextField>
            <AppTextField>
              <Label class="text-xs text-muted-foreground">ASS 不透明度 (0–100)</Label>
              <AppTextFieldInput
                type="number"
                min={0}
                max={100}
                step={1}
                value={String(playPrefs().libmpvDanmakuOpacity)}
                onInput={(e: Event) => {
                  const v = Number((e.currentTarget as HTMLInputElement).value);
                  if (!Number.isFinite(v)) return;
                  setPlayPrefs(setDanmakuPrefs({ libmpvDanmakuOpacity: v }));
                }}
              />
            </AppTextField>
            <AppTextField>
              <Label class="text-xs text-muted-foreground">单条时长（秒）</Label>
              <AppTextFieldInput
                type="number"
                min={2}
                max={30}
                step={1}
                value={String(playPrefs().libmpvDanmakuDuration)}
                onInput={(e: Event) => {
                  const v = Number((e.currentTarget as HTMLInputElement).value);
                  if (!Number.isFinite(v)) return;
                  setPlayPrefs(setDanmakuPrefs({ libmpvDanmakuDuration: v }));
                }}
              />
            </AppTextField>
            <AppTextField>
              <Label class="text-xs text-muted-foreground">相同文案合并（秒，0=关）</Label>
              <AppTextFieldInput
                type="number"
                min={0}
                max={30}
                step={0.5}
                value={String(playPrefs().libmpvDanmakuMergeSec)}
                onInput={(e: Event) => {
                  const v = Number((e.currentTarget as HTMLInputElement).value);
                  if (!Number.isFinite(v)) return;
                  setPlayPrefs(setDanmakuPrefs({ libmpvDanmakuMergeSec: v }));
                }}
              />
            </AppTextField>
            <AppTextField>
              <Label class="text-xs text-muted-foreground">最多条数</Label>
              <AppTextFieldInput
                type="number"
                min={100}
                max={20000}
                step={100}
                value={String(playPrefs().libmpvDanmakuMax)}
                onInput={(e: Event) => {
                  const v = Number((e.currentTarget as HTMLInputElement).value);
                  if (!Number.isFinite(v)) return;
                  setPlayPrefs(setDanmakuPrefs({ libmpvDanmakuMax: v }));
                }}
              />
            </AppTextField>
            <AppTextField>
              <Label class="text-xs text-muted-foreground">Android 弹幕模式</Label>
              <AppTextFieldInput
                value={playPrefs().androidDanmakuMode}
                onInput={(e: Event) => {
                  const v = (e.currentTarget as HTMLInputElement).value.trim();
                  if (v === 'overlay' || v === 'ass' || v === 'off') {
                    setPlayPrefs(setDanmakuPrefs({ androidDanmakuMode: v }));
                  }
                }}
                placeholder="overlay | ass | off"
              />
            </AppTextField>
            <AppTextField>
              <Label class="text-xs text-muted-foreground">Android OP/ED 模式</Label>
              <AppTextFieldInput
                value={playPrefs().androidSkipMode}
                onInput={(e: Event) => {
                  const v = (e.currentTarget as HTMLInputElement).value.trim();
                  if (v === 'fixed' || v === 'chapter') {
                    setPlayPrefs(setDanmakuPrefs({ androidSkipMode: v }));
                  }
                }}
                placeholder="fixed | chapter"
              />
            </AppTextField>
          </div>
        </div>

        <div class="space-y-3">
          <h3 class="text-sm font-semibold">外置播放器</h3>
          <p class="text-xs text-muted-foreground">
            交系统默认 / PATH 上的 mpv·VLC / 或自选 exe（如 PotPlayer）。mpv
            会附带字幕 / Anime4K shaders（若已配置）与可选 IPC。mpv/VLC
            通过 PATH 查找，不读注册表。
          </p>
          <AppSelect
            value={extPlayer()}
            onChange={(v) => {
              const kind = resolveExternalPlayerSelection(
                v || 'system',
                playbackPrefs(),
              );
              if (kind === extPlayer()) return;
              setExtPlayer(kind);
              setPreferredExternalPlayer(kind);
              setPlaybackPrefs(getVideoPlaybackPrefs());
            }}
            options={extPlayerOptionValues()}
            itemComponent={(itemProps) => {
              const value = String(itemProps.item.rawValue);
              return (
                <AppSelectItem item={itemProps.item}>
                  {extPlayerLabel(value)}
                </AppSelectItem>
              );
            }}
          >
            <AppSelectTrigger layout="form" class="h-9" aria-label="外置播放器">
              <AppSelectValue>
                {(sel) =>
                  extPlayerLabel(String(sel.selectedOption() ?? 'system'))
                }
              </AppSelectValue>
              <AppSelectIcon />
            </AppSelectTrigger>
            <AppSelectContent>
              <AppSelectListbox />
            </AppSelectContent>
          </AppSelect>
          <div class="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="h-8"
              onClick={() => {
                void (async () => {
                  const { open } = await import('@tauri-apps/plugin-dialog');
                  const selected = await open({
                    multiple: false,
                    title: '选择播放器可执行文件',
                    filters: [
                      {
                        name: 'Executable',
                        extensions: ['exe', 'com', 'bat', 'cmd'],
                      },
                    ],
                  });
                  if (typeof selected !== 'string' || !selected.trim()) return;
                  const leaf =
                    selected.split(/[/\\]/).pop()?.replace(
                      /\.(exe|com|bat|cmd)$/i,
                      '',
                    ) || '自定义播放器';
                  const name =
                    window.prompt('预设显示名称', leaf)?.trim() || leaf;
                  addExternalPlayerPreset({
                    name,
                    exePath: selected.trim(),
                  });
                  // 先刷新 options（依赖 playbackPrefs），再同步选中项
                  syncExtPlayerFromPrefs();
                })();
              }}
            >
              添加自定义播放器…
            </Button>
            <Show when={parseExternalCustomId(extPlayer())}>
              {(id) => (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  class="h-8 text-destructive"
                  onClick={() => {
                    removeExternalPlayerPreset(id());
                    syncExtPlayerFromPrefs();
                  }}
                >
                  删除当前预设
                </Button>
              )}
            </Show>
          </div>
          <Show when={parseExternalCustomId(extPlayer())}>
            {(id) => {
              const preset = () =>
                playbackPrefs().externalPresets.find((p) => p.id === id());
              return (
                <p class="truncate font-mono text-[11px] text-muted-foreground">
                  {preset()?.exePath ?? ''}
                </p>
              );
            }}
          </Show>
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
          <h3 class="text-sm font-semibold">Playback Kernel / Anime4K</h3>
          <p class="text-xs text-muted-foreground">
            {PLAYBACK_TERM_NOTES.anime4k} 搜索 / 直播 / 点播默认 Artplayer；仅「强制引擎」为
            Libmpv / External / Media3 时覆盖。仅改外置种类不会改写搜索 / 直播。
          </p>
          <p class="text-[11px] text-muted-foreground break-all">{libmpvStatusText()}</p>
          <p class="text-[11px] text-muted-foreground break-all">{anime4kStatusText()}</p>

          <div class="space-y-1.5">
            <p class="text-xs text-muted-foreground">Force Engine</p>
            <AppSelect
              value={playbackPrefs().forceEngine}
              onChange={(v) => {
                const fe = (v || 'auto') as VideoPlaybackPrefs['forceEngine'];
                setPlaybackPrefs(setVideoPlaybackPrefs({ forceEngine: fe }));
              }}
              options={[...FORCE_ENGINE_OPTIONS]}
              itemComponent={(itemProps) => (
                <AppSelectItem item={itemProps.item}>
                  {FORCE_ENGINE_LABELS[
                    itemProps.item.rawValue as (typeof FORCE_ENGINE_OPTIONS)[number]
                  ] ?? String(itemProps.item.rawValue)}
                </AppSelectItem>
              )}
            >
              <AppSelectTrigger layout="form" class="h-9" aria-label="Force Engine">
                <AppSelectValue>
                  {(sel) => {
                    const v = String(
                      sel.selectedOption() ?? 'auto',
                    ) as (typeof FORCE_ENGINE_OPTIONS)[number];
                    return FORCE_ENGINE_LABELS[v] ?? v;
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
            <p class="text-xs text-muted-foreground">Local Playback</p>
            <AppSelect
              value={playbackPrefs().localEngine}
              onChange={(v) => {
                const le = (v || 'libmpv') as LocalPlaybackEnginePref;
                setPlaybackPrefs(setVideoPlaybackPrefs({ localEngine: le }));
              }}
              options={LOCAL_ENGINE_OPTIONS}
              itemComponent={(itemProps) => (
                <AppSelectItem item={itemProps.item}>
                  {LOCAL_ENGINE_LABELS[
                    itemProps.item.rawValue as LocalPlaybackEnginePref
                  ] ?? String(itemProps.item.rawValue)}
                </AppSelectItem>
              )}
            >
              <AppSelectTrigger
                layout="form"
                class="h-9"
                aria-label="Local Playback"
                disabled={playbackPrefs().forceEngine !== 'auto'}
              >
                <AppSelectValue>
                  {(sel) => {
                    const v = String(
                      sel.selectedOption() ?? playbackPrefs().localEngine,
                    ) as LocalPlaybackEnginePref;
                    return LOCAL_ENGINE_LABELS[v] ?? v;
                  }}
                </AppSelectValue>
                <AppSelectIcon />
              </AppSelectTrigger>
              <AppSelectContent>
                <AppSelectListbox />
              </AppSelectContent>
            </AppSelect>
            <p class="text-[11px] text-muted-foreground">
              {playbackPrefs().forceEngine !== 'auto'
                ? 'Force Engine 已启用，Local Playback 暂不生效。'
                : '选 External 时使用上方外置播放器种类（System / MPV / VLC / Custom）。'}
            </p>
          </div>

          <div class="space-y-1.5">
            <p class="text-xs text-muted-foreground">音量 / 听视频（softvol）</p>
            <AppTextField>
              <Label class="text-xs text-muted-foreground">音量 0–100</Label>
              <AppTextFieldInput
                type="number"
                min={0}
                max={100}
                value={String(playbackPrefs().volume)}
                onInput={(e: Event) => {
                  const n = Number((e.currentTarget as HTMLInputElement).value);
                  if (!Number.isFinite(n)) return;
                  setPlaybackPrefs(
                    setVideoPlaybackPrefs({
                      volume: Math.max(0, Math.min(100, Math.round(n))),
                    }),
                  );
                }}
              />
            </AppTextField>
            <label class="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={playbackPrefs().muted}
                onChange={(e) =>
                  setPlaybackPrefs(
                    setVideoPlaybackPrefs({ muted: e.currentTarget.checked }),
                  )
                }
              />
              静音
            </label>
            <label class="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={playbackPrefs().listenOnly}
                onChange={(e) =>
                  setPlaybackPrefs(
                    setVideoPlaybackPrefs({ listenOnly: e.currentTarget.checked }),
                  )
                }
              />
              听视频（vid=no；Libmpv / 外置 MPV）
            </label>
            <p class="text-[11px] text-muted-foreground">
              与增强窗 softvol 同源偏好；新开播时生效。
            </p>
            <p class="text-xs text-muted-foreground">Equalizer（简易预置）</p>
            <AppSelect
              value={playbackPrefs().audioEqPreset}
              onChange={(v) => {
                const p = (v || 'off') as AudioEqPreset;
                setPlaybackPrefs(setVideoPlaybackPrefs({ audioEqPreset: p }));
              }}
              options={[...AUDIO_EQ_PRESET_OPTIONS]}
              itemComponent={(itemProps) => (
                <AppSelectItem item={itemProps.item}>
                  {AUDIO_EQ_PRESET_LABELS[
                    itemProps.item.rawValue as AudioEqPreset
                  ] ?? String(itemProps.item.rawValue)}
                </AppSelectItem>
              )}
            >
              <AppSelectTrigger layout="form" class="h-9" aria-label="Equalizer">
                <AppSelectValue>
                  {(sel) =>
                    AUDIO_EQ_PRESET_LABELS[
                      String(sel.selectedOption() ?? 'off') as AudioEqPreset
                    ] ?? 'Off'
                  }
                </AppSelectValue>
                <AppSelectIcon />
              </AppSelectTrigger>
              <AppSelectContent>
                <AppSelectListbox />
              </AppSelectContent>
            </AppSelect>
            <p class="text-[11px] text-muted-foreground">
              Libmpv 增强窗可热切；外置 MPV 仅新开播生效。
            </p>
          </div>

          <div class="space-y-1.5">
            <p class="text-xs text-muted-foreground">Video Output (VO)</p>
            <AppSelect
              value={playbackPrefs().libmpvVideoOutput}
              onChange={(v) => {
                const vo = (v || 'gpu') as LibmpvVideoOutput;
                setPlaybackPrefs(setVideoPlaybackPrefs({ libmpvVideoOutput: vo }));
              }}
              options={[...VIDEO_OUTPUT_OPTIONS]}
              itemComponent={(itemProps) => (
                <AppSelectItem item={itemProps.item}>
                  {VIDEO_OUTPUT_LABELS[
                    itemProps.item.rawValue as LibmpvVideoOutput
                  ] ?? String(itemProps.item.rawValue)}
                </AppSelectItem>
              )}
            >
              <AppSelectTrigger layout="form" class="h-9" aria-label="Video Output">
                <AppSelectValue>
                  {(sel) => {
                    const v = String(
                      sel.selectedOption() ?? 'gpu',
                    ) as LibmpvVideoOutput;
                    return VIDEO_OUTPUT_LABELS[v] ?? v;
                  }}
                </AppSelectValue>
                <AppSelectIcon />
              </AppSelectTrigger>
              <AppSelectContent>
                <AppSelectListbox />
              </AppSelectContent>
            </AppSelect>
            <p class="text-[11px] text-muted-foreground">{PLAYBACK_TERM_NOTES.gpu}</p>
            <p class="text-[11px] text-muted-foreground">{PLAYBACK_TERM_NOTES.gpuNext}</p>
          </div>

          <div class="space-y-1.5">
            <p class="text-xs text-muted-foreground">Hardware Decoding (Hwdec)</p>
            <AppSelect
              value={
                HWDEC_PRESET_OPTIONS.includes(
                  playbackPrefs().libmpvHwdec as LibmpvHwdecPreset,
                )
                  ? playbackPrefs().libmpvHwdec
                  : 'auto'
              }
              onChange={(v) => {
                const hw = (v || 'auto') as string;
                setPlaybackPrefs(setVideoPlaybackPrefs({ libmpvHwdec: hw }));
              }}
              options={[...HWDEC_PRESET_OPTIONS]}
              itemComponent={(itemProps) => (
                <AppSelectItem item={itemProps.item}>
                  {HWDEC_PRESET_LABELS[
                    itemProps.item.rawValue as LibmpvHwdecPreset
                  ] ?? String(itemProps.item.rawValue)}
                </AppSelectItem>
              )}
            >
              <AppSelectTrigger layout="form" class="h-9" aria-label="Hardware Decoding">
                <AppSelectValue>
                  {(sel) => {
                    const v = String(sel.selectedOption() ?? 'auto') as LibmpvHwdecPreset;
                    return HWDEC_PRESET_LABELS[v] ?? v;
                  }}
                </AppSelectValue>
                <AppSelectIcon />
              </AppSelectTrigger>
              <AppSelectContent>
                <AppSelectListbox />
              </AppSelectContent>
            </AppSelect>
            <p class="text-[11px] text-muted-foreground">{PLAYBACK_TERM_NOTES.d3d11va}</p>
            <p class="text-[11px] text-muted-foreground">{PLAYBACK_TERM_NOTES.d3d11vaCopy}</p>
            <p class="text-[11px] text-muted-foreground">{PLAYBACK_TERM_NOTES.autoCopy}</p>
          </div>

          <div
            class={cn(
              'space-y-2 rounded-md border p-3',
              'border-border/60',
            )}
          >
            <p class="text-xs font-medium">实时补帧（RIFE）</p>
            <p class="text-[11px] text-muted-foreground">
              仅 libmpv / 外置 mpv；与 Anime4K 互斥。需{' '}
              <code class="text-[10px]">resources/rife</code> 运行时（见 docs/VIDEO_RIFE.md）。
            </p>
            <div class="flex items-center justify-between gap-3">
              <Label class="text-sm font-normal">启用 RIFE</Label>
              <AppSwitch
                checked={playbackPrefs().frameInterpEnabled}
                onChange={(checked) => {
                  const next = setVideoPlaybackPrefs({ frameInterpEnabled: checked });
                  setPlaybackPrefs(next);
                  if (checked) {
                    showAppToast({
                      title: '已开启 RIFE',
                      description: '与 Anime4K 互斥；需 resources/rife 模型/VS',
                    });
                  }
                }}
                aria-label="启用 RIFE"
              >
                <AppSwitchControl>
                  <AppSwitchThumb />
                </AppSwitchControl>
              </AppSwitch>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <AppTextField>
                <Label class="text-xs text-muted-foreground">后端 auto|trt|dml|ncnn</Label>
                <AppTextFieldInput
                  value={playbackPrefs().frameInterpBackend}
                  onInput={(e: Event) => {
                    const v = (e.currentTarget as HTMLInputElement).value.trim();
                    if (v === 'auto' || v === 'trt' || v === 'dml' || v === 'ncnn') {
                      setPlaybackPrefs(setVideoPlaybackPrefs({ frameInterpBackend: v }));
                    }
                  }}
                />
              </AppTextField>
              <AppTextField>
                <Label class="text-xs text-muted-foreground">倍率 2|3|4</Label>
                <AppTextFieldInput
                  type="number"
                  min={2}
                  max={4}
                  value={String(playbackPrefs().frameInterpFactor)}
                  onInput={(e: Event) => {
                    const n = Number((e.currentTarget as HTMLInputElement).value);
                    if (n === 2 || n === 3 || n === 4) {
                      setPlaybackPrefs(setVideoPlaybackPrefs({ frameInterpFactor: n }));
                    }
                  }}
                />
              </AppTextField>
              <AppTextField>
                <Label class="text-xs text-muted-foreground">模型 id</Label>
                <AppTextFieldInput
                  value={playbackPrefs().frameInterpModel}
                  onInput={(e: Event) => {
                    const v = (e.currentTarget as HTMLInputElement).value.trim();
                    if (v) {
                      setPlaybackPrefs(setVideoPlaybackPrefs({ frameInterpModel: v }));
                    }
                  }}
                />
              </AppTextField>
              <AppTextField>
                <Label class="text-xs text-muted-foreground">最大源 FPS（高于则直通）</Label>
                <AppTextFieldInput
                  type="number"
                  min={1}
                  max={120}
                  value={String(playbackPrefs().frameInterpMaxInputFps)}
                  onInput={(e: Event) => {
                    const n = Number((e.currentTarget as HTMLInputElement).value);
                    if (Number.isFinite(n)) {
                      setPlaybackPrefs(
                        setVideoPlaybackPrefs({ frameInterpMaxInputFps: n }),
                      );
                    }
                  }}
                />
              </AppTextField>
            </div>
            <div class="flex items-center justify-between gap-3">
              <Label class="text-sm font-normal">场景切检测</Label>
              <AppSwitch
                checked={playbackPrefs().frameInterpSceneDetect}
                onChange={(checked) =>
                  setPlaybackPrefs(
                    setVideoPlaybackPrefs({ frameInterpSceneDetect: checked }),
                  )
                }
              >
                <AppSwitchControl>
                  <AppSwitchThumb />
                </AppSwitchControl>
              </AppSwitch>
            </div>
            <div class="flex items-center justify-between gap-3">
              <Label class="text-sm font-normal">AI 不可用时非 AI 平滑</Label>
              <AppSwitch
                checked={playbackPrefs().frameInterpLightweightFallback}
                onChange={(checked) =>
                  setPlaybackPrefs(
                    setVideoPlaybackPrefs({ frameInterpLightweightFallback: checked }),
                  )
                }
              >
                <AppSwitchControl>
                  <AppSwitchThumb />
                </AppSwitchControl>
              </AppSwitch>
            </div>
            <Show when={rifeStatus()}>
              {(st) => (
                <p class="text-[11px] text-muted-foreground">
                  探测：{st().available ? '可用' : '不可用'} ·{' '}
                  {st().detail}
                </p>
              )}
            </Show>
          </div>

          <div
            class={cn(
              'space-y-2 rounded-md border p-3',
              anime4kUsable().usable
                ? 'border-border/60'
                : 'border-destructive/40 bg-destructive/5 opacity-90',
            )}
          >
            <p class="text-xs font-medium">Anime4K Upscaling</p>
            <Show
              when={anime4kUsable().usable}
              fallback={
                <ul class="list-disc space-y-1 pl-4 text-[11px] text-destructive">
                  <For each={anime4kUsable().reasons}>{(r) => <li>{r}</li>}</For>
                  <li>超分相关选项已禁用，请先满足上方条件。</li>
                </ul>
              }
            >
              <p class="text-[11px] text-muted-foreground">
                可用条件：Shaders 就绪；Force Engine 不能是 Artplayer / Media3；External
                时须选 MPV；Auto 时需 Libmpv 可用或外置为 MPV。若 VO 为 GPU-Next，须开启「开超分时强制
                GPU」。
              </p>
            </Show>

            <div class="grid grid-cols-2 gap-2">
              <AppSelect
                value={playbackPrefs().anime4kMode}
                onChange={(v) => {
                  const mode = (v || 'off') as Anime4KMode;
                  setPlaybackPrefs(setVideoPlaybackPrefs({ anime4kMode: mode }));
                }}
                options={[...ANIME4K_MODE_OPTIONS]}
                itemComponent={(itemProps) => (
                  <AppSelectItem item={itemProps.item}>
                    {ANIME4K_MODE_LABELS[
                      itemProps.item.rawValue as Anime4KMode
                    ] ?? String(itemProps.item.rawValue)}
                  </AppSelectItem>
                )}
              >
                <AppSelectTrigger
                  layout="form"
                  class="h-9"
                  aria-label="Anime4K Mode"
                  disabled={!anime4kUsable().usable}
                >
                  <AppSelectValue>
                    {(sel) => {
                      const v = String(sel.selectedOption() ?? 'off') as Anime4KMode;
                      return ANIME4K_MODE_LABELS[v] ?? v;
                    }}
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
                options={[...ANIME4K_QUALITY_OPTIONS]}
                itemComponent={(itemProps) => (
                  <AppSelectItem item={itemProps.item}>
                    {ANIME4K_QUALITY_LABELS[
                      itemProps.item.rawValue as Anime4KQuality
                    ] ?? String(itemProps.item.rawValue)}
                  </AppSelectItem>
                )}
              >
                <AppSelectTrigger
                  layout="form"
                  class="h-9"
                  aria-label="Anime4K Quality"
                  disabled={!anime4kUsable().usable}
                >
                  <AppSelectValue>
                    {(sel) => {
                      const v = String(
                        sel.selectedOption() ?? 'balanced',
                      ) as Anime4KQuality;
                      return ANIME4K_QUALITY_LABELS[v] ?? v;
                    }}
                  </AppSelectValue>
                  <AppSelectIcon />
                </AppSelectTrigger>
                <AppSelectContent>
                  <AppSelectListbox />
                </AppSelectContent>
              </AppSelect>
            </div>

            <label
              class={cn(
                'flex items-start gap-2 text-xs',
                !anime4kUsable().usable && 'pointer-events-none opacity-50',
              )}
            >
              <input
                type="checkbox"
                class="mt-0.5"
                checked={playbackPrefs().anime4kDeblur}
                disabled={!anime4kUsable().usable}
                onChange={(e) =>
                  setPlaybackPrefs(
                    setVideoPlaybackPrefs({
                      anime4kDeblur: (e.currentTarget as HTMLInputElement).checked,
                    }),
                  )
                }
              />
              <span>
                <span class="font-medium">Anime4K Deblur</span>
                <span class="mt-0.5 block text-[11px] text-muted-foreground">
                  {PLAYBACK_TERM_NOTES.deblur}
                </span>
              </span>
            </label>

            <label
              class={cn(
                'flex items-start gap-2 text-xs',
                !anime4kUsable().usable && 'pointer-events-none opacity-50',
              )}
            >
              <input
                type="checkbox"
                class="mt-0.5"
                checked={playbackPrefs().anime4kForceGpuVo}
                disabled={!anime4kUsable().usable}
                onChange={(e) =>
                  setPlaybackPrefs(
                    setVideoPlaybackPrefs({
                      anime4kForceGpuVo: (e.currentTarget as HTMLInputElement)
                        .checked,
                    }),
                  )
                }
              />
              <span>
                <span class="font-medium">Force GPU when Anime4K On</span>
                <span class="mt-0.5 block text-[11px] text-muted-foreground">
                  {PLAYBACK_TERM_NOTES.forceGpuVo}
                </span>
              </span>
            </label>

            <label
              class={cn(
                'flex items-start gap-2 text-xs',
                !anime4kUsable().usable && 'pointer-events-none opacity-50',
              )}
            >
              <input
                type="checkbox"
                class="mt-0.5"
                checked={playbackPrefs().anime4kHwdecAdapt}
                disabled={!anime4kUsable().usable}
                onChange={(e) =>
                  setPlaybackPrefs(
                    setVideoPlaybackPrefs({
                      anime4kHwdecAdapt: (e.currentTarget as HTMLInputElement)
                        .checked,
                    }),
                  )
                }
              />
              <span>
                <span class="font-medium">Auto-Copy Hwdec when Anime4K On</span>
                <span class="mt-0.5 block text-[11px] text-muted-foreground">
                  {PLAYBACK_TERM_NOTES.hwdecAdapt}
                </span>
              </span>
            </label>

            <AppTextField>
              <Label class="text-xs text-muted-foreground">
                Anime4K Shaders Dir（空 = 捆绑 resources/shaders）
              </Label>
              <AppTextFieldInput
                value={playbackPrefs().anime4kShadersDir}
                onInput={(e: Event) =>
                  setPlaybackPrefs(
                    setVideoPlaybackPrefs({
                      anime4kShadersDir: (e.currentTarget as HTMLInputElement)
                        .value,
                    }),
                  )
                }
                placeholder="Empty = bundled Shaders"
              />
            </AppTextField>
          </div>

          <AppTextField>
            <Label class="text-xs text-muted-foreground">Default External Subtitle Path</Label>
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

          <div class="space-y-2 rounded-md border border-border/50 p-2">
            <p class="text-xs font-medium">ASS / Subtitle Style（Libmpv · MPV）</p>
            <AppTextField>
              <Label class="text-xs text-muted-foreground">Sub Font（空=默认）</Label>
              <AppTextFieldInput
                value={playbackPrefs().subFont}
                onInput={(e: Event) =>
                  setPlaybackPrefs(
                    setVideoPlaybackPrefs({
                      subFont: (e.currentTarget as HTMLInputElement).value,
                    }),
                  )
                }
                placeholder="e.g. Microsoft YaHei"
              />
            </AppTextField>
            <AppTextField>
              <Label class="text-xs text-muted-foreground">
                Sub Font Size（0=不覆盖）
              </Label>
              <AppTextFieldInput
                type="number"
                value={String(playbackPrefs().subFontSize || '')}
                onInput={(e: Event) => {
                  const n = Number((e.currentTarget as HTMLInputElement).value);
                  setPlaybackPrefs(
                    setVideoPlaybackPrefs({
                      subFontSize: Number.isFinite(n) ? n : 0,
                    }),
                  );
                }}
              />
            </AppTextField>
            <AppTextField>
              <Label class="text-xs text-muted-foreground">Sub Scale（默认 1）</Label>
              <AppTextFieldInput
                type="number"
                step="0.05"
                value={String(playbackPrefs().subScale)}
                onInput={(e: Event) => {
                  const n = Number((e.currentTarget as HTMLInputElement).value);
                  setPlaybackPrefs(
                    setVideoPlaybackPrefs({
                      subScale: Number.isFinite(n) && n > 0 ? n : 1,
                    }),
                  );
                }}
              />
            </AppTextField>
          </div>

          <div class="space-y-2 rounded-md border border-border/50 p-2">
            <p class="text-xs font-medium">HDR Tone-Mapping（最小集）</p>
            <p class="text-[11px] text-muted-foreground">
              开播写入 libmpv / 外置 MPV；不做 hdr-toys 四模式全管道。
            </p>
            <AppSelect
              value={playbackPrefs().hdrToneMapping}
              onChange={(v) =>
                setPlaybackPrefs(
                  setVideoPlaybackPrefs({ hdrToneMapping: v || 'auto' }),
                )
              }
              options={[
                'auto',
                'bt.2390',
                'mobius',
                'reinhard',
                'hable',
                'gamma',
                'linear',
                'no',
              ]}
              itemComponent={(itemProps) => (
                <AppSelectItem item={itemProps.item}>
                  {String(itemProps.item.rawValue)}
                </AppSelectItem>
              )}
            >
              <AppSelectTrigger layout="form" class="h-8" aria-label="Tone Mapping">
                <AppSelectValue>
                  {(sel) => String(sel.selectedOption() ?? 'auto')}
                </AppSelectValue>
                <AppSelectIcon />
              </AppSelectTrigger>
              <AppSelectContent>
                <AppSelectListbox />
              </AppSelectContent>
            </AppSelect>
            <label class="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={playbackPrefs().hdrTargetColorspaceHint}
                onChange={(e) =>
                  setPlaybackPrefs(
                    setVideoPlaybackPrefs({
                      hdrTargetColorspaceHint: e.currentTarget.checked,
                    }),
                  )
                }
              />
              Target Colorspace Hint（HDR 显示器提示）
            </label>
          </div>

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
          <div class="space-y-1 rounded border border-border/40 p-2">
            <p class="text-xs font-medium text-muted-foreground">Android libmpv（E2.C）</p>
            <p class="break-all text-[11px] text-muted-foreground">
              {androidLibmpvStatusText()}
            </p>
            <Show when={isAndroid()}>
              <p class="text-[11px] text-muted-foreground">
                缺 AAR 时请放置 `android/video-player/libs/mpvlib.aar`（见 libs/README）；可用
                `scripts/android-mpvlib-check.ps1`。
              </p>
            </Show>
            <Show when={!isAndroid()}>
              <p class="text-[11px] text-muted-foreground">
                桌面构建仅显示探测结果占位；真机需 Android 包内含 mpvlib.aar。
              </p>
            </Show>
          </div>
        </div>


        <div class="space-y-3">
          <h3 class="text-sm font-semibold">内置弹幕源（danmu_api）</h3>
          <p class="text-xs text-muted-foreground">
            唯一选源权威：爱优腾芒哔等按剧名匹配。关闭总开关后仅在已配置弹弹密钥且有 BGM
            ID 时走弹弹后备。「启用」决定是否检索该源；「聚合」表示多源弹幕合并为一份（至少开两个才生效）。豆瓣/360
            等仅作检索辅助，不可聚合。
          </p>
          <div class="flex items-center justify-between gap-3">
            <Label class="text-sm font-normal">启用统一弹幕源</Label>
            <AppSwitch
              checked={danmuApiCfg().enabled}
              onChange={(checked) => patchDanmuApi({ enabled: checked })}
              aria-label="启用统一弹幕源"
            >
              <AppSwitchControl>
                <AppSwitchThumb />
              </AppSwitchControl>
            </AppSwitch>
          </div>
          <div class="overflow-hidden rounded-md border border-border/50">
            <div class="grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem] items-center gap-2 border-b border-border/50 bg-muted/30 px-2 py-1.5 text-[11px] text-muted-foreground">
              <span>源</span>
              <span class="text-center">启用</span>
              <span class="text-center">聚合</span>
            </div>
            <div class="divide-y divide-border/40">
              <For each={listDefaultSourceIds()}>
                {(id) => {
                  const mergeOk = isMergeAllowedSource(id);
                  const label = DANMU_SOURCE_LABELS[id] || id;
                  return (
                    <div class="grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem] items-center gap-2 px-2 py-1.5">
                      <Label class="truncate text-xs font-normal">{label}</Label>
                      <div class="flex justify-center">
                        <AppSwitch
                          checked={danmuSourceEnabled(id)}
                          onChange={(checked) => toggleDanmuSource(id, checked)}
                          aria-label={`启用 ${label}`}
                        >
                          <AppSwitchControl>
                            <AppSwitchThumb />
                          </AppSwitchControl>
                        </AppSwitch>
                      </div>
                      <div class="flex justify-center">
                        <Show
                          when={mergeOk}
                          fallback={
                            <span
                              class="text-[10px] text-muted-foreground/60"
                              title="该源不可参与弹幕聚合"
                            >
                              —
                            </span>
                          }
                        >
                          <AppSwitch
                            checked={danmuSourceInMerge(id)}
                            onChange={(checked) => toggleDanmuMerge(id, checked)}
                            aria-label={`${label} 参与聚合`}
                          >
                            <AppSwitchControl>
                              <AppSwitchThumb />
                            </AppSwitchControl>
                          </AppSwitch>
                        </Show>
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>
          </div>
        </div>

        <div class="space-y-3">
          <h3 class="text-sm font-semibold">弹幕 / 字幕 API 密钥</h3>
          <p class="text-xs text-muted-foreground">
            弹弹密钥用于统一源未命中时的 BGM 后备匹配与发送；B 站 Cookie / wyzie；未配置则相关入口不可用。
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
          <div class="rounded-lg border p-3">
            <CookieHubDebugPanel />
          </div>
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
              void import('@/stores/tv-hub/detail').then((m) => {
                // 同步播放页解析高亮（空名=按配置顺序，清掉选中）
                m.selectParse(name);
              });
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

        <TvBangumiSettingsSection />

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
