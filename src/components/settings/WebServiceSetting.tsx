import { createMemo, createSignal, For, onMount, Show } from 'solid-js';
import { Label } from '@/components/ui/label';
import { Switch, SwitchControl, SwitchLabel, SwitchThumb } from '@/components/ui/switch';
import { SettingsNumberField } from '@/components/settings/SettingsNumberField';
import { isTauri } from '@/lib/platform/detect';
import {
  DEFAULT_WEB_SERVICE_PORT,
  getWebServicePort,
  isWebServiceEnabled,
  setWebServiceEnabled,
  setWebServicePort,
} from '@/lib/web-api/config';
import {
  buildWebServiceAccessUrls,
  formatWebServiceBaseUrl,
  formatWebServiceExampleUrls,
} from '@/lib/web-api/service-info';
import {
  clearLocalNetworkAddressesCache,
  fetchLocalNetworkAddresses,
} from '@/lib/web-api/local-addresses';
import { startReaderWebService, stopReaderWebService } from '@/lib/web-api/bridge';

export function WebServiceSettingBlock() {
  const [enabled, setEnabled] = createSignal(false);
  const [port, setPort] = createSignal(DEFAULT_WEB_SERVICE_PORT);
  const [busy, setBusy] = createSignal(false);
  const [addresses, setAddresses] = createSignal<string[]>(['127.0.0.1']);

  const refreshAddresses = async (p: number) => {
    clearLocalNetworkAddressesCache();
    setAddresses(await fetchLocalNetworkAddresses(p));
  };

  onMount(async () => {
    setEnabled(await isWebServiceEnabled());
    const p = await getWebServicePort();
    setPort(p);
    if (await isWebServiceEnabled()) {
      await refreshAddresses(p);
    }
  });

  const accessUrls = createMemo(() => buildWebServiceAccessUrls(port(), addresses()));
  const loopbackExamples = createMemo(() => formatWebServiceExampleUrls(port(), '127.0.0.1'));

  const applyServiceState = async (nextEnabled: boolean, nextPort: number) => {
    setBusy(true);
    try {
      if (nextEnabled) {
        await startReaderWebService(nextPort);
        await refreshAddresses(nextPort);
      } else {
        await stopReaderWebService();
      }
    } catch (e) {
      console.error('[web-api] 切换 Web 服务失败', e);
    } finally {
      setBusy(false);
    }
  };

  const toggleEnabled = async (checked: boolean) => {
    setEnabled(checked);
    await setWebServiceEnabled(checked);
    await applyServiceState(checked, port());
  };

  const commitPort = async (nextPort: number) => {
    if (!Number.isFinite(nextPort) || nextPort <= 0 || nextPort >= 65536) {
      setPort(await getWebServicePort());
      return;
    }
    setPort(nextPort);
    await setWebServicePort(nextPort);
    if (enabled()) {
      await applyServiceState(true, nextPort);
    }
  };

  return (
    <div class="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-3">
      <div>
        <p class="text-sm font-medium text-foreground">Web 服务</p>
        <p class="text-xs text-muted-foreground">
          对外提供 Legado 兼容 REST 接口与浏览器 Web UI（书架、阅读、书源、备份），供局域网设备或外部工具访问。
        </p>
      </div>
      <div class="flex items-center justify-between gap-3">
        <Label class="text-sm">启用 Web 服务</Label>
        <Switch checked={enabled()} disabled={busy()} onChange={(v) => void toggleEnabled(v)}>
          <SwitchControl>
            <SwitchThumb />
          </SwitchControl>
          <SwitchLabel class="sr-only">启用 Web 服务</SwitchLabel>
        </Switch>
      </div>
      <div class="space-y-1.5">
        <Label class="text-sm">端口</Label>
        <SettingsNumberField
          value={port()}
          min={1024}
          max={65535}
          groupClass="w-full max-w-xs"
          inputClass="h-10 pr-7"
          onValueChange={(v) => void commitPort(v)}
        />
        <Show when={enabled()}>
          <div class="space-y-2 rounded-md border border-border/50 bg-background/60 px-2.5 py-2 text-xs text-muted-foreground">
            <p class="font-medium text-foreground">本机访问地址</p>
            <ul class="list-inside list-disc space-y-0.5 font-mono text-[11px] text-foreground/90">
              <For each={accessUrls()}>
                {(url) => (
                  <li class="truncate">
                    <a class="text-primary hover:underline" href={url} target="_blank" rel="noreferrer">
                      {url}
                    </a>
                  </li>
                )}
              </For>
            </ul>
            <p class="pt-0.5">
              局域网设备请使用非 <code class="font-mono">127.0.0.1</code> 的地址（需防火墙放行端口{' '}
              {port()}）。
            </p>
            <p class="font-medium text-foreground">常用链接</p>
            <ul class="list-inside list-disc space-y-0.5 font-mono text-[11px] text-foreground/90">
              <For each={loopbackExamples()}>{(url) => <li class="truncate">{url}</li>}</For>
            </ul>
            <p class="text-[11px]">
              API 说明：<code class="font-mono">{formatWebServiceBaseUrl(port())}/api</code>
            </p>
          </div>
        </Show>
        {!isTauri() ? (
          <p class="text-xs text-muted-foreground">
            纯 Web 开发模式下 HTTP 由 Vite 插件监听（环境变量 READER_WEB_API_PORT，默认 1122），须保持 Reader
            页面打开；此处端口主要作用于 Tauri 桌面端。
          </p>
        ) : null}
      </div>
    </div>
  );
}
