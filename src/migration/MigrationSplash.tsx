/**
 * 数据目录搬迁进度页（独立窗口 migration_splash）
 */

import { createSignal, onCleanup, onMount, Show } from 'solid-js';
import { listen } from '@tauri-apps/api/event';
import { Button } from '@/components/ui/button';
import {
  revertPendingDataDirMigration,
  retryPendingRelocationMigration,
  type MigrationProgress,
} from '@/lib/platform/data-migration';

function formatBytes(n: number): string {
  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;
  if (n >= GB) return `${(n / GB).toFixed(1)} GB`;
  if (n >= MB) return `${(n / MB).toFixed(1)} MB`;
  if (n >= KB) return `${(n / KB).toFixed(1)} KB`;
  return `${n} B`;
}

export default function MigrationSplash() {
  const [phase, setPhase] = createSignal('准备迁移…');
  const [copied, setCopied] = createSignal(0);
  const [total, setTotal] = createSignal(0);
  const [currentFile, setCurrentFile] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [done, setDone] = createSignal(false);
  const [busy, setBusy] = createSignal(false);

  const percent = () => {
    const t = total();
    if (t <= 0) return 0;
    return Math.min(100, Math.round((copied() / t) * 100));
  };

  onMount(() => {
    const unsubs: Array<() => void> = [];

    void (async () => {
      unsubs.push(
        await listen<MigrationProgress>('data-migration-progress', (e) => {
          setPhase(e.payload.phase);
          setCopied(e.payload.copiedBytes);
          setTotal(e.payload.totalBytes);
          setCurrentFile(e.payload.currentFile ?? null);
        }),
      );
      unsubs.push(
        await listen('data-migration-complete', () => {
          setDone(true);
          setPhase('迁移完成');
        }),
      );
      unsubs.push(
        await listen<string>('data-migration-error', (e) => {
          setError(typeof e.payload === 'string' ? e.payload : String(e.payload));
        }),
      );
    })();

    onCleanup(() => {
      for (const u of unsubs) u();
    });
  });

  const onRetry = async () => {
    setBusy(true);
    setError(null);
    try {
      await retryPendingRelocationMigration();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const onRevert = async () => {
    if (!confirm('将放弃新目录并恢复为原数据目录，是否继续？')) return;
    setBusy(true);
    try {
      await revertPendingDataDirMigration();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  return (
    <div class="flex min-h-screen flex-col items-center justify-center bg-background px-8 text-foreground">
      <div class="w-full max-w-md space-y-6">
        <div class="text-center">
          <h1 class="text-lg font-semibold">正在迁移程序数据</h1>
          <p class="mt-2 text-sm text-muted-foreground">
            请勿关闭窗口或强制结束进程。迁移完成后将自动打开主界面。
          </p>
        </div>

        <Show when={!error()}>
          <div class="space-y-2">
            <div class="flex justify-between text-xs text-muted-foreground">
              <span>{phase()}</span>
              <span>
                {formatBytes(copied())}
                {total() > 0 ? ` / ${formatBytes(total())}` : ''}
              </span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-muted">
              <div
                class="h-full bg-primary transition-all duration-200"
                style={{ width: `${percent()}%` }}
              />
            </div>
            <Show when={currentFile()}>
              <p class="truncate text-xs text-muted-foreground">{currentFile()}</p>
            </Show>
          </div>
          <Show when={done()}>
            <p class="text-center text-sm text-muted-foreground">正在打开主窗口…</p>
          </Show>
        </Show>

        <Show when={error()}>
          <div class="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
            <p class="font-medium text-destructive">迁移失败</p>
            <p class="mt-1 break-all text-muted-foreground">{error()}</p>
          </div>
          <div class="flex flex-wrap justify-center gap-2">
            <Button variant="outline" size="sm" disabled={busy()} onClick={() => void onRetry()}>
              重试
            </Button>
            <Button variant="secondary" size="sm" disabled={busy()} onClick={() => void onRevert()}>
              恢复原目录并启动
            </Button>
          </div>
        </Show>
      </div>
    </div>
  );
}
