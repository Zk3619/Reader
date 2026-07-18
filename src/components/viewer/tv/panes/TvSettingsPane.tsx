import { createSignal, Show, createEffect, For } from 'solid-js';
import { PageToolbar } from '@/components/shell/PageToolbar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  mainShellPageScroll,
  pageToolbarBottomBorder,
} from '@/lib/ui/viewport-classes';
import {
  getTvHomeState,
  importTvConfigText,
  importTvConfigUrl,
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
import { getTvNetSettings, setTvNetSettings } from '@/lib/media/tv/net/rules';
import { ensureTvProxyBridge } from '@/lib/media/tv/proxy/bridge';
import { clearJsSpiderCache } from '@/lib/media/tv/spider/js-engine';

export function TvSettingsPane() {
  const home = getTvHomeState();
  const [url, setUrl] = createSignal('');
  const [paste, setPaste] = createSignal('');
  const [localOk, setLocalOk] = createSignal<boolean | null>(null);
  const [net, setNet] = createSignal(getTvNetSettings());
  const [parseName, setParseName] = createSignal(getDefaultParseName());
  const [sitesTick, setSitesTick] = createSignal(0);

  createEffect(() => {
    void refreshJarKind();
    void refreshPyKind(false);
    void ensureTvProxyBridge();
    void pingLocalApi().then(setLocalOk);
    void refreshSitePrefs().then(() => setSitesTick((n) => n + 1));
  });

  return (
    <section class="flex min-h-0 flex-1 flex-col">
      <PageToolbar
        class={pageToolbarBottomBorder}
        title="影视设置"
        description="站点配置、网络与 Spider 引擎"
      />
      <div class={cn(mainShellPageScroll, 'flex min-h-0 flex-1 flex-col gap-6 p-4')}>
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
            native = 本机 CPython（推荐，可 pip install lxml requests）；pyodide =
            Wasm 降级（无 lxml，需联网）；unavailable = 都不可用
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

        <div class="space-y-2">
          <h3 class="text-sm font-semibold">网络（DoH / 代理）</h3>
          <label class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={net().dohEnabled}
              onChange={(e) =>
                setNet(setTvNetSettings({ dohEnabled: e.currentTarget.checked }))
              }
            />
            启用 DoH
          </label>
          <input
            class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={net().dohUrl}
            onInput={(e) => setNet(setTvNetSettings({ dohUrl: e.currentTarget.value }))}
            placeholder="https://dns.alidns.com/dns-query"
          />
          <label class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={net().proxyEnabled}
              onChange={(e) =>
                setNet(setTvNetSettings({ proxyEnabled: e.currentTarget.checked }))
              }
            />
            启用 HTTP 代理前缀
          </label>
          <input
            class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={net().proxyUrl}
            onInput={(e) => setNet(setTvNetSettings({ proxyUrl: e.currentTarget.value }))}
            placeholder="http://127.0.0.1:7890"
          />
        </div>

        <div class="space-y-2">
          <h3 class="text-sm font-semibold">默认解析器</h3>
          <select
            class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={parseName()}
            onChange={(e) => {
              const v = e.currentTarget.value;
              setParseName(v);
              setDefaultParseName(v);
            }}
          >
            <option value="">（按配置顺序）</option>
            <For each={getParses()}>
              {(p) => <option value={p.name}>{p.name}</option>}
            </For>
          </select>
        </div>

        <div class="space-y-2">
          <h3 class="text-sm font-semibold">站点偏好（searchable / changeable）</h3>
          <For each={(sitesTick(), getSites().slice(0, 40))}>
            {(s) => (
              <div class="flex flex-wrap items-center gap-3 text-sm">
                <span class="min-w-32 truncate font-medium">{s.name}</span>
                <label class="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={s.searchable !== 0}
                    onChange={(e) => {
                      void updateSitePref(
                        s.key,
                        e.currentTarget.checked ? 1 : 0,
                        s.changeable ?? 1,
                      ).then(() => setSitesTick((n) => n + 1));
                    }}
                  />
                  可搜索
                </label>
                <label class="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={s.changeable !== 0}
                    onChange={(e) => {
                      void updateSitePref(
                        s.key,
                        s.searchable ?? 1,
                        e.currentTarget.checked ? 1 : 0,
                      ).then(() => setSitesTick((n) => n + 1));
                    }}
                  />
                  可换源
                </label>
              </div>
            )}
          </For>
        </div>

        <div class="space-y-2">
          <h3 class="text-sm font-semibold">导入配置 URL</h3>
          <div class="flex gap-2">
            <input
              value={url()}
              onInput={(e) => setUrl(e.currentTarget.value)}
              placeholder="https://.../config.json"
              class="flex h-9 flex-1 rounded-md border border-input bg-transparent px-3 text-sm"
            />
            <Button
              type="button"
              disabled={home.loading || !url().trim()}
              onClick={() => void importTvConfigUrl(url().trim())}
            >
              导入
            </Button>
          </div>
        </div>

        <div class="space-y-2">
          <h3 class="text-sm font-semibold">粘贴配置 JSON</h3>
          <textarea
            class="min-h-40 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
            value={paste()}
            onInput={(e) => setPaste(e.currentTarget.value)}
            placeholder='{"sites":[...],"parses":[...]}'
          />
          <Button
            type="button"
            disabled={home.loading || !paste().trim()}
            onClick={() => void importTvConfigText(paste().trim())}
          >
            从粘贴导入
          </Button>
        </div>

        <Show when={home.error}>
          <p class="text-sm text-destructive">{home.error}</p>
        </Show>
        <Show when={home.configUrl}>
          <p class="text-xs text-muted-foreground">当前配置：{home.configUrl}</p>
        </Show>

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
    </section>
  );
}
