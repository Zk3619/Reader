import { createSignal, Show, onMount } from 'solid-js';
import { Button, Input } from '@/components/Layout';
import { getApiBase, setApiBase } from '@/lib/api-config';
import { testApiConnection } from '@/lib/api';
import { showToast } from '@/lib/toast';

type ConnStatus = 'unknown' | 'ok' | 'fail' | 'checking';

export function ApiConnectionPanel(props: { compact?: boolean }) {
  const [baseUrl, setBaseUrl] = createSignal(getApiBase() || window.location.origin);
  const [testing, setTesting] = createSignal(false);
  const [open, setOpen] = createSignal(false);
  const [status, setStatus] = createSignal<ConnStatus>('unknown');

  async function checkConnection(silent = false) {
    setStatus('checking');
    try {
      await testApiConnection(baseUrl().trim() || window.location.origin);
      setStatus('ok');
      if (!silent) showToast('后端连接正常', 'success');
      return true;
    } catch (e) {
      setStatus('fail');
      if (!silent) showToast(e instanceof Error ? e.message : '连接失败', 'error');
      return false;
    }
  }

  async function handleSave() {
    setTesting(true);
    try {
      const url = baseUrl().trim();
      const ok = await checkConnection(true);
      if (!ok) return;
      setApiBase(url === window.location.origin ? '' : url);
      showToast('后端连接成功', 'success');
      setOpen(false);
      window.location.reload();
    } finally {
      setTesting(false);
    }
  }

  onMount(() => {
    void checkConnection(true);
  });

  const statusLabel = () => {
    switch (status()) {
      case 'ok':
        return '已连接';
      case 'fail':
        return '未连接';
      case 'checking':
        return '检测中';
      default:
        return '未知';
    }
  };

  const statusDotClass = () => {
    switch (status()) {
      case 'ok':
        return 'web-dot-success';
      case 'fail':
        return 'web-dot-danger';
      case 'checking':
        return 'web-dot-warning animate-pulse';
      default:
        return 'bg-muted-foreground';
    }
  };

  function useCurrentOrigin() {
    setApiBase('');
    setBaseUrl(window.location.origin);
    showToast('已切换为当前站点', 'success');
    window.location.reload();
  }

  if (props.compact) {
    return (
      <div class="text-xs">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 text-primary hover:underline"
          onClick={() => setOpen((v) => !v)}
        >
          <span class={`inline-block h-2 w-2 rounded-full ${statusDotClass()}`} />
          {getApiBase() ? '远程后端' : '本地后端'} · {statusLabel()}
        </button>
        <Show when={open()}>
          <div class="mt-2 space-y-2 rounded-lg border border-border bg-card p-2">
            <Input value={baseUrl()} onInput={setBaseUrl} placeholder="http://127.0.0.1:1122" />
            <div class="flex flex-wrap gap-1">
              <Button class="px-2! py-1! text-xs" disabled={testing()} onClick={() => void handleSave()}>
                {testing() ? '校验中…' : '保存'}
              </Button>
              <Button variant="ghost" class="px-2! py-1! text-xs" onClick={() => void checkConnection()}>
                测试
              </Button>
              <Button variant="ghost" class="px-2! py-1! text-xs" onClick={useCurrentOrigin}>
                当前站点
              </Button>
            </div>
          </div>
        </Show>
      </div>
    );
  }

  return (
    <div class="space-y-2">
      <div class="flex items-center gap-2">
        <p class="text-sm font-medium">后端地址</p>
        <span class={`inline-block h-2 w-2 rounded-full ${statusDotClass()}`} />
        <span class="text-xs text-muted-foreground">{statusLabel()}</span>
      </div>
      <Input value={baseUrl()} onInput={setBaseUrl} placeholder="http://127.0.0.1:1122" />
      <div class="flex gap-2">
        <Button disabled={testing()} onClick={() => void handleSave()}>
          {testing() ? '校验中…' : '保存并连接'}
        </Button>
        <Button variant="ghost" onClick={() => void checkConnection()}>测试连接</Button>
        <Button variant="ghost" onClick={useCurrentOrigin}>使用当前站点</Button>
      </div>
      <p class="text-xs text-muted-foreground">
        当前：{getApiBase() || window.location.origin}
      </p>
    </div>
  );
}
