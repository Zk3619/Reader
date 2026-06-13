import { createMemo, createSignal, For, onMount, Show } from 'solid-js';
import { Label } from '@/components/ui/label';
import { Switch, SwitchControl, SwitchLabel, SwitchThumb } from '@/components/ui/switch';
import { TextField, TextFieldInput } from '@/components/ui/text-field';
import { Button } from '@/components/ui/button';
import { SettingsNumberField } from '@/components/settings/SettingsNumberField';
import { isTauri, isAndroid, isMobile } from '@/lib/platform/detect';
import {
  DEFAULT_WEB_SERVICE_PORT,
  generateWebServiceToken,
  getWebServicePort,
  getWebServiceToken,
  isWebServiceAuthEnabled,
  isWebServiceEnabled,
  setWebServiceAuthEnabled,
  setWebServiceEnabled,
  setWebServicePort,
  setWebServiceToken,
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
  const [authEnabled, setAuthEnabled] = createSignal(false);
  const [token, setToken] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [addresses, setAddresses] = createSignal<string[]>(['127.0.0.1']);

  const refreshAddresses = async (p: number) => {
    clearLocalNetworkAddressesCache();
    setAddresses(await fetchLocalNetworkAddresses(p));
  };

  onMount(async () => {
    setEnabled(await isWebServiceEnabled());
    setAuthEnabled(await isWebServiceAuthEnabled());
    setToken(await getWebServiceToken());
    const p = await getWebServicePort();
    setPort(p);
    if (await isWebServiceEnabled()) {
      await refreshAddresses(p);
    }
  });

  const accessUrls = createMemo(() => buildWebServiceAccessUrls(port(), addresses()));
  const loopbackExamples = createMemo(() => formatWebServiceExampleUrls(port(), '127.0.0.1'));
  const wsUrl = createMemo(() => {
    const base = formatWebServiceBaseUrl(port() + 1, '127.0.0.1');
    return `${base.replace(String(port() + 1), String(port() + 1))}/bookSourceDebug`;
  });

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

  const restartIfEnabled = async () => {
    if (enabled()) await applyServiceState(true, port());
  };

  const toggleEnabled = async (checked: boolean) => {
    setEnabled(checked);
    await setWebServiceEnabled(checked);
    await applyServiceState(checked, port());
  };

  const toggleAuth = async (checked: boolean) => {
    setAuthEnabled(checked);
    await setWebServiceAuthEnabled(checked);
    if (checked && !token().trim()) {
      const next = generateWebServiceToken();
      setToken(next);
      await setWebServiceToken(next);
    }
    await restartIfEnabled();
  };

  const commitPort = async (nextPort: number) => {
    if (!Number.isFinite(nextPort) || nextPort <= 0 || nextPort >= 65535) {
      setPort(await getWebServicePort());
      return;
    }
    setPort(nextPort);
    await setWebServicePort(nextPort);
    if (enabled()) {
      await applyServiceState(true, nextPort);
    }
  };

  const commitToken = async (value: string) => {
    setToken(value);
    await setWebServiceToken(value);
    await restartIfEnabled();
  };

  return (
    <div class="rounded-2xl border border-border/50 bg-card p-6">
      <div class="mb-4">
        <h3 class="mb-2 font-semibold text-foreground">Web 服务</h3>
        <p class="text-sm text-muted-foreground">
          Legado 兼容 REST + Web UI（书架、传书、写源、WebSocket 调试）。HTTP 端口 {port()}，WebSocket 调试端口{' '}
          {port() + 1}。
          <Show when={isAndroid() || isMobile()}>
            {' '}
            手机端开启后，同 WiFi 下的电脑/平板浏览器可访问下方局域网地址（对齐 Legado 手机当服务器）。
          </Show>
        </p>
      </div>
      <div class="space-y-3">
      <div class="flex items-center justify-between gap-3">
        <Label class="text-sm">启用 Web 服务</Label>
        <Switch checked={enabled()} disabled={busy()} onChange={(v) => void toggleEnabled(v)}>
          <SwitchControl>
            <SwitchThumb />
          </SwitchControl>
          <SwitchLabel class="sr-only">启用 Web 服务</SwitchLabel>
        </Switch>
      </div>
      <div class="flex items-center justify-between gap-3">
        <Label class="text-sm">启用认证（Token）</Label>
        <Switch checked={authEnabled()} disabled={busy()} onChange={(v) => void toggleAuth(v)}>
          <SwitchControl>
            <SwitchThumb />
          </SwitchControl>
          <SwitchLabel class="sr-only">启用 Web 认证</SwitchLabel>
        </Switch>
      </div>
      <Show when={authEnabled()}>
        <div class="space-y-1.5">
          <Label class="text-sm">访问 Token</Label>
          <div class="flex gap-2">
            <TextField class="flex-1">
              <TextFieldInput
                value={token()}
                placeholder="Bearer Token"
                onInput={(e) => void commitToken(e.currentTarget.value)}
              />
            </TextField>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void commitToken(generateWebServiceToken())}
            >
              生成
            </Button>
          </div>
          <p class="text-xs text-muted-foreground">
            在 Web UI「认证」页或请求头 Authorization: Bearer {'<token>'} 中填写。
          </p>
        </div>
      </Show>
      <div class="space-y-1.5">
        <Label class="text-sm">端口</Label>
        <SettingsNumberField
          value={port()}
          min={1024}
          max={65534}
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
            <p class="font-medium text-foreground">WebSocket 书源调试</p>
            <p class="font-mono text-[11px] text-foreground/90">{wsUrl()}</p>
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
            纯 Web 开发模式下 HTTP 由 Vite 插件监听，须保持 Reader 页面打开。
          </p>
        ) : isAndroid() ? (
          <p class="text-xs text-muted-foreground">
            Android：请保持应用在前台，并确保与访问设备在同一局域网；部分网络可能限制入站连接。
          </p>
        ) : null}
      </div>
      </div>
    </div>
  );
}
