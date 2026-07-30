/**
 * 下载模块设置
 */

import { createResource, createSignal } from 'solid-js';
import { PageToolbar } from '@/components/shell/PageToolbar';
import { Button } from '@/components/ui/button';
import { ArrowLeftIcon } from '@/components/shared/icons';
import { cn } from '@/lib/utils';
import {
  mainShellPageHost,
  mainShellTabEnterClass,
  pageToolbarBottomBorder,
} from '@/lib/ui/viewport-classes';
import { settingsStore } from '@/stores/settings';
import { setDownloadSection } from '@/stores/download-hub/section';
import {
  DEFAULT_DOWNLOAD_CONFIG,
  getDownloadConfig,
  setDownloadConfig,
  type DownloadModuleConfig,
} from '@/lib/download';
import { resolveModuleDownloadDirectory } from '@/lib/media/media-root';
import { showAppToast } from '@/components/shared/AppToasts';

export function DownloadSettingsPage() {
  const tabEnterClass = () =>
    mainShellTabEnterClass(settingsStore.state.app.reduceMotion);
  const [cfg, { refetch }] = createResource(() => getDownloadConfig());
  const [saving, setSaving] = createSignal(false);
  const [draft, setDraft] = createSignal<DownloadModuleConfig | null>(null);

  const current = () => draft() ?? cfg() ?? DEFAULT_DOWNLOAD_CONFIG;

  const patch = (partial: Partial<DownloadModuleConfig>) => {
    setDraft({ ...current(), ...partial });
  };

  const save = async () => {
    setSaving(true);
    try {
      await setDownloadConfig(current());
      setDraft(null);
      await refetch();
      showAppToast({ title: '已保存下载设置', variant: 'success' });
    } catch (e) {
      showAppToast({
        title: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const useDefaultDir = async () => {
    try {
      const dir = await resolveModuleDownloadDirectory('download');
      patch({ downloadDir: dir });
    } catch (e) {
      showAppToast({
        title: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    }
  };

  return (
    <div class={cn(mainShellPageHost, tabEnterClass(), 'flex min-h-0 flex-1 flex-col')}>
      <PageToolbar
        class={pageToolbarBottomBorder}
        title="下载设置"
        leading={
          <Button size="sm" variant="ghost" onClick={() => setDownloadSection('tasks')}>
            <ArrowLeftIcon class="size-4" />
            返回
          </Button>
        }
      >
        <Button size="sm" disabled={saving()} onClick={() => void save()}>
          保存
        </Button>
      </PageToolbar>

      <div class="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 text-sm">
        <section class="space-y-2">
          <h2 class="font-medium">通用</h2>
          <label class="block space-y-1">
            <span class="text-muted-foreground">下载目录</span>
            <div class="flex gap-2">
              <input
                class="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2"
                value={current().downloadDir}
                onInput={(e) => patch({ downloadDir: e.currentTarget.value })}
              />
              <Button variant="secondary" onClick={() => void useDefaultDir()}>
                默认
              </Button>
            </div>
          </label>
          <label class="block space-y-1">
            <span class="text-muted-foreground">最大同时任务</span>
            <input
              type="number"
              min={1}
              max={32}
              class="w-32 rounded-md border border-input bg-background px-3 py-2"
              value={current().maxRunning}
              onInput={(e) =>
                patch({ maxRunning: Math.max(1, Number(e.currentTarget.value) || 1) })
              }
            />
          </label>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              checked={current().skipVerifyCert}
              onChange={(e) => patch({ skipVerifyCert: e.currentTarget.checked })}
            />
            跳过证书校验
          </label>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              checked={current().autoTorrent}
              onChange={(e) => patch({ autoTorrent: e.currentTarget.checked })}
            />
            下载完 torrent 自动创建 BT 任务
          </label>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              checked={current().archiveEnabled}
              onChange={(e) => patch({ archiveEnabled: e.currentTarget.checked })}
            />
            完成后尝试解压归档
          </label>
        </section>

        <section class="space-y-2">
          <h2 class="font-medium">HTTP</h2>
          <label class="block space-y-1">
            <span class="text-muted-foreground">连接数</span>
            <input
              type="number"
              min={1}
              max={64}
              class="w-32 rounded-md border border-input bg-background px-3 py-2"
              value={current().protocolConfig.http.connections}
              onInput={(e) =>
                patch({
                  protocolConfig: {
                    ...current().protocolConfig,
                    http: {
                      ...current().protocolConfig.http,
                      connections: Math.max(1, Number(e.currentTarget.value) || 1),
                    },
                  },
                })
              }
            />
          </label>
          <label class="block space-y-1">
            <span class="text-muted-foreground">User-Agent</span>
            <input
              class="w-full rounded-md border border-input bg-background px-3 py-2"
              value={current().protocolConfig.http.userAgent}
              onInput={(e) =>
                patch({
                  protocolConfig: {
                    ...current().protocolConfig,
                    http: {
                      ...current().protocolConfig.http,
                      userAgent: e.currentTarget.value,
                    },
                  },
                })
              }
            />
          </label>
        </section>

        <section class="space-y-2">
          <h2 class="font-medium">BitTorrent</h2>
          <label class="block space-y-1">
            <span class="text-muted-foreground">监听端口（0=随机）</span>
            <input
              type="number"
              class="w-32 rounded-md border border-input bg-background px-3 py-2"
              value={current().protocolConfig.bt.listenPort}
              onInput={(e) =>
                patch({
                  protocolConfig: {
                    ...current().protocolConfig,
                    bt: {
                      ...current().protocolConfig.bt,
                      listenPort: Number(e.currentTarget.value) || 0,
                    },
                  },
                })
              }
            />
          </label>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              checked={current().protocolConfig.bt.seedKeep}
              onChange={(e) =>
                patch({
                  protocolConfig: {
                    ...current().protocolConfig,
                    bt: {
                      ...current().protocolConfig.bt,
                      seedKeep: e.currentTarget.checked,
                    },
                  },
                })
              }
            />
            完成后继续做种
          </label>
        </section>

        <section class="space-y-2">
          <h2 class="font-medium">ED2K</h2>
          <label class="block space-y-1">
            <span class="text-muted-foreground">TCP 端口</span>
            <input
              type="number"
              class="w-32 rounded-md border border-input bg-background px-3 py-2"
              value={current().protocolConfig.ed2k.tcpPort}
              onInput={(e) =>
                patch({
                  protocolConfig: {
                    ...current().protocolConfig,
                    ed2k: {
                      ...current().protocolConfig.ed2k,
                      tcpPort: Number(e.currentTarget.value) || 4662,
                    },
                  },
                })
              }
            />
          </label>
        </section>

        <section class="space-y-2">
          <h2 class="font-medium">Webhook / 脚本</h2>
          <label class="block space-y-1">
            <span class="text-muted-foreground">Webhook URL</span>
            <input
              class="w-full rounded-md border border-input bg-background px-3 py-2"
              value={current().webhookUrl}
              onInput={(e) => patch({ webhookUrl: e.currentTarget.value })}
            />
          </label>
        </section>

        <section class="space-y-2">
          <h2 class="font-medium">媒体提取（yt-dlp 兼容）</h2>
          <label class="block space-y-1">
            <span class="text-muted-foreground">合并容器</span>
            <select
              class="rounded-md border border-input bg-background px-3 py-2"
              value={current().ytdlp.mergeOutputFormat}
              onChange={(e) =>
                patch({
                  ytdlp: {
                    ...current().ytdlp,
                    mergeOutputFormat: e.currentTarget.value as DownloadModuleConfig['ytdlp']['mergeOutputFormat'],
                  },
                })
              }
            >
              <option value="mp4">mp4</option>
              <option value="mkv">mkv</option>
              <option value="webm">webm</option>
              <option value="default">default</option>
            </select>
          </label>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              checked={current().ytdlp.writeSubs}
              onChange={(e) =>
                patch({
                  ytdlp: { ...current().ytdlp, writeSubs: e.currentTarget.checked },
                })
              }
            />
            下载字幕
          </label>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              checked={current().ytdlp.embedMetadata}
              onChange={(e) =>
                patch({
                  ytdlp: { ...current().ytdlp, embedMetadata: e.currentTarget.checked },
                })
              }
            />
            嵌入元数据
          </label>
        </section>
      </div>
    </div>
  );
}
