/**
 * 音源更新列表弹窗（多音源合并提示）
 * 使用 ViewerAppDialog：z-index 须高于媒体页壳层（z-110），否则会「打开但看不见」。
 */

import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  type Component,
} from 'solid-js';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogDescription,
  ViewerAppDialogFooter,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
} from '@/components/viewer/viewer-app-overlay';
import { AppDialogScrollBody } from '@/components/shared/AppDialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  clearUserApiUpdateAlert,
  subscribeUserApiUpdateAlert,
  type UserApiUpdateAlert,
} from '@/lib/media/audio/online/lx-user-api-shim';
import { applyUserApiUpdateDialogChoices } from '@/lib/media/audio/online/user-api-update-prefs';
import { importUserApiScript } from '@/lib/media/audio/online/user-api-engine';
import { openUrlInBrowser } from '@/lib/platform/open-url';
import { request } from '@/lib/http';
import { showAppToast } from '@/components/shared/AppToasts';
import { dialogScrollFrameFlex } from '@/lib/ui/viewport-classes';
import { clearFocusBeforeModal } from '@/utils/accessibility';

type RowState = {
  snooze7Days: boolean;
  ignoreThis: boolean;
  upgrading: boolean;
};

export const UserApiUpdateAlertHost: Component = () => {
  const [alerts, setAlerts] = createSignal<UserApiUpdateAlert[]>([]);
  const [globalMute7Days, setGlobalMute7Days] = createSignal(false);
  const [rows, setRows] = createSignal<Record<string, RowState>>({});

  const open = createMemo(() => alerts().length > 0);

  const rowKey = (a: UserApiUpdateAlert) => a.scriptId || a.scriptName || a.updateUrl;

  const ensureRow = (key: string): RowState =>
    rows()[key] ?? { snooze7Days: false, ignoreThis: false, upgrading: false };

  const patchRow = (key: string, patch: Partial<RowState>) => {
    setRows((prev) => ({
      ...prev,
      [key]: { ...ensureRow(key), ...patch },
    }));
  };

  const pushBatch = (batch: UserApiUpdateAlert[]) => {
    if (!batch.length) return;
    console.info(
      '[user-api] update dialog batch',
      batch.map((a) => a.scriptName).join(', '),
    );
    clearFocusBeforeModal();
    setAlerts((prev) => {
      const map = new Map(prev.map((a) => [rowKey(a), a]));
      for (const a of batch) map.set(rowKey(a), a);
      return [...map.values()];
    });
    setRows((prev) => {
      const next = { ...prev };
      for (const a of batch) {
        const k = rowKey(a);
        if (!next[k]) next[k] = { snooze7Days: false, ignoreThis: false, upgrading: false };
      }
      return next;
    });
  };

  const closeDialog = () => {
    clearUserApiUpdateAlert();
    setAlerts([]);
    setRows({});
    setGlobalMute7Days(false);
  };

  const confirm = () => {
    applyUserApiUpdateDialogChoices({
      globalMute7Days: globalMute7Days(),
      items: alerts().map((a) => {
        const k = rowKey(a);
        const r = ensureRow(k);
        return {
          scriptId: a.scriptId || a.scriptName,
          updateUrl: a.updateUrl,
          snooze7Days: r.snooze7Days,
          ignoreThis: r.ignoreThis,
        };
      }),
    });
    closeDialog();
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      showAppToast({ title: '已复制更新地址', variant: 'success' });
    } catch {
      showAppToast({ title: '复制失败', variant: 'destructive' });
    }
  };

  const upgradeFromUrl = async (alert: UserApiUpdateAlert) => {
    const url = alert.updateUrl.trim();
    if (!url) return;
    const key = rowKey(alert);
    patchRow(key, { upgrading: true });
    try {
      const res = await request(url, {
        method: 'GET',
        allowNon2xx: true,
        useBackendHttp: true,
        ignorePageNavigationAbort: true,
      });
      if (res.status >= 400) throw new Error(`下载失败 HTTP ${res.status}`);
      const text = await res.text();
      if (!text.trim()) throw new Error('脚本内容为空');
      const nameGuess = url.split('/').pop()?.split('?')[0] || 'update.js';
      const result = await importUserApiScript({
        script: text,
        fileName: nameGuess,
        fallbackName: alert.scriptName,
      });
      // 失败时 importUserApiScript 已弹窗并移出列表
      if (!result.ok) return;
      showAppToast({ title: `已升级「${result.name}」`, variant: 'success' });
    } catch (err) {
      showAppToast({
        title: '从更新地址升级失败',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      patchRow(key, { upgrading: false });
    }
  };

  createEffect(() => {
    if (open()) clearFocusBeforeModal();
  });

  onMount(() => {
    const unsub = subscribeUserApiUpdateAlert(pushBatch);
    onCleanup(unsub);
  });

  return (
    <ViewerAppDialog
      open={open()}
      onOpenChange={(next) => {
        if (!next) closeDialog();
      }}
    >
      <ViewerAppDialogContent class="w-[calc(100dvw-2rem)] max-w-lg" layout="app">
        <ViewerAppDialogHeader>
          <ViewerAppDialogTitle>音源更新</ViewerAppDialogTitle>
          <ViewerAppDialogDescription>
            以下已启用音源检测到新版本，可逐项处理或稍后统一确认。
          </ViewerAppDialogDescription>
        </ViewerAppDialogHeader>
        <AppDialogScrollBody frameClass={dialogScrollFrameFlex} class="max-h-[min(50dvh,22rem)] px-6">
          <ul class="space-y-3 py-1">
            <For each={alerts()}>
              {(alert) => {
                const key = () => rowKey(alert);
                const row = () => ensureRow(key());
                return (
                  <li class="rounded-md border px-3 py-2.5 text-sm">
                    <p class="font-medium">{alert.scriptName}</p>
                    <Show when={alert.log}>
                      <p class="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{alert.log}</p>
                    </Show>
                    <div class="mt-2 space-y-1.5">
                      <label class="flex items-center gap-2 text-xs text-muted-foreground">
                        <Checkbox
                          checked={row().snooze7Days}
                          onChange={(checked) => patchRow(key(), { snooze7Days: checked })}
                        />
                        7 天内不再提示
                      </label>
                      <label class="flex items-center gap-2 text-xs text-muted-foreground">
                        <Checkbox
                          checked={row().ignoreThis}
                          onChange={(checked) => patchRow(key(), { ignoreThis: checked })}
                        />
                        忽略本次更新
                      </label>
                    </div>
                    <Show when={alert.updateUrl}>
                      <div class="mt-2 flex flex-wrap gap-1.5">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void openUrlInBrowser(alert.updateUrl)}
                        >
                          前往更新地址
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void copyUrl(alert.updateUrl)}
                        >
                          复制更新地址
                        </Button>
                        <Button
                          size="sm"
                          variant="default"
                          disabled={row().upgrading}
                          onClick={() => void upgradeFromUrl(alert)}
                        >
                          {row().upgrading ? '升级中…' : '从地址升级'}
                        </Button>
                      </div>
                    </Show>
                  </li>
                );
              }}
            </For>
          </ul>
        </AppDialogScrollBody>
        <div class="px-6 pb-2">
          <div class="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              id="user-api-update-global-mute-input"
              checked={globalMute7Days()}
              onChange={(checked) => setGlobalMute7Days(checked)}
            />
            <Label for="user-api-update-global-mute-input">7 天内不再检查更新</Label>
          </div>
        </div>
        <ViewerAppDialogFooter class="gap-2 sm:justify-end">
          <Button variant="ghost" onClick={() => closeDialog()}>
            关闭
          </Button>
          <Button onClick={() => confirm()}>确认</Button>
        </ViewerAppDialogFooter>
      </ViewerAppDialogContent>
    </ViewerAppDialog>
  );
};
