/**
 * 下载模块设置
 */

import { createResource, createSignal } from 'solid-js';
import { DownloadHubPageShell } from '@/pages/media/download/DownloadHubPageShell';
import {
  AppSwitch,
  AppSwitchControl,
  AppSwitchThumb,
} from '@/components/shared/AppSwitch';
import {
  AppSelect,
  AppSelectContent,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import { AppTextFieldBareInput } from '@/components/shared/AppTextField';
import { Button } from '@/components/ui/button';
import {
  DEFAULT_DOWNLOAD_CONFIG,
  getDownloadConfig,
  setDownloadConfig,
  type DownloadModuleConfig,
} from '@/lib/download';
import { resolveModuleDownloadDirectory } from '@/lib/media/media-root';
import { showAppToast } from '@/components/shared/AppToasts';

type MergeFormat = DownloadModuleConfig['ytdlp']['mergeOutputFormat'];

const MERGE_FORMATS = ['mp4', 'mkv', 'webm', 'default'] as const satisfies readonly MergeFormat[];
const MERGE_FORMAT_LABELS: Record<MergeFormat, string> = {
  mp4: 'mp4',
  mkv: 'mkv',
  webm: 'webm',
  default: 'default',
};

function SettingRow(props: {
  title: string;
  description?: string;
  children: import('solid-js').JSX.Element;
}) {
  return (
    <div class="mt-3 flex items-center justify-between gap-3 rounded-lg border px-3 py-3 first:mt-4">
      <div class="min-w-0 flex-1">
        <div class="text-sm">{props.title}</div>
        {props.description ? (
          <div class="text-xs text-muted-foreground">{props.description}</div>
        ) : null}
      </div>
      {props.children}
    </div>
  );
}

function SettingSwitch(props: {
  title: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel?: string;
}) {
  return (
    <SettingRow title={props.title} description={props.description}>
      <AppSwitch
        checked={props.checked}
        onChange={props.onChange}
        aria-label={props.ariaLabel ?? props.title}
      >
        <AppSwitchControl>
          <AppSwitchThumb />
        </AppSwitchControl>
      </AppSwitch>
    </SettingRow>
  );
}

export function DownloadSettingsPage() {
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
    <DownloadHubPageShell
      section="settings"
      toolbar={
        <Button size="sm" disabled={saving()} onClick={() => void save()}>
          {saving() ? '保存中…' : '保存'}
        </Button>
      }
    >
      <div class="flex min-h-0 w-full flex-1 flex-col gap-4 pb-4">
        <section class="rounded-2xl border border-border/50 bg-card p-6">
          <h3 class="text-sm font-semibold">通用</h3>
          <p class="mt-1 text-xs text-muted-foreground">下载目录与队列行为</p>

          <div class="mt-4 space-y-2 rounded-lg border px-3 py-3">
            <div class="text-sm">代理模式</div>
            <div class="text-xs text-muted-foreground">影响 HTTP 下载客户端（system 跟随环境变量）</div>
            <div class="mt-2">
              <AppSelect
                value={current().proxyMode}
                onChange={(value) => {
                  if (!value) return;
                  patch({ proxyMode: value as DownloadModuleConfig['proxyMode'] });
                }}
                options={['none', 'system', 'custom']}
                itemComponent={(itemProps) => (
                  <AppSelectItem item={itemProps.item}>
                    {itemProps.item.rawValue === 'none'
                      ? '不使用代理'
                      : itemProps.item.rawValue === 'custom'
                        ? '自定义'
                        : '系统'}
                  </AppSelectItem>
                )}
              >
                <AppSelectTrigger layout="compact" class="w-40" aria-label="代理模式">
                  <AppSelectValue>
                    {(state) => {
                      const v = String(state.selectedOption() ?? 'system');
                      return v === 'none' ? '不使用代理' : v === 'custom' ? '自定义' : '系统';
                    }}
                  </AppSelectValue>
                  <AppSelectIcon />
                </AppSelectTrigger>
                <AppSelectContent>
                  <AppSelectListbox />
                </AppSelectContent>
              </AppSelect>
            </div>
          </div>

          <div class="mt-3 space-y-2 rounded-lg border px-3 py-3">
            <div class="text-sm">自定义代理 URL</div>
            <div class="text-xs text-muted-foreground">仅 proxyMode=custom 时生效，如 http://127.0.0.1:7890</div>
            <AppTextFieldBareInput
              fieldClass="mt-2 w-full"
              class="h-9"
              placeholder="http://127.0.0.1:7890"
              value={current().proxyUrl}
              onInput={(e) => patch({ proxyUrl: e.currentTarget.value })}
              aria-label="代理 URL"
            />
          </div>

          <div class="mt-4 space-y-2 rounded-lg border px-3 py-3">
            <div class="text-sm">下载目录</div>
            <div class="text-xs text-muted-foreground">任务文件的默认保存位置</div>
            <div class="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <AppTextFieldBareInput
                fieldClass="min-w-0 flex-1"
                class="h-9"
                value={current().downloadDir}
                onInput={(e) => patch({ downloadDir: e.currentTarget.value })}
                aria-label="下载目录"
              />
              <Button variant="secondary" size="sm" onClick={() => void useDefaultDir()}>
                使用默认
              </Button>
            </div>
          </div>

          <SettingRow title="最大同时任务" description="并行下载数量上限（1–32）">
            <AppTextFieldBareInput
              type="number"
              class="h-9 w-24 text-right"
              min={1}
              max={32}
              value={String(current().maxRunning)}
              onInput={(e) =>
                patch({ maxRunning: Math.max(1, Number(e.currentTarget.value) || 1) })
              }
              aria-label="最大同时任务"
            />
          </SettingRow>

          <SettingSwitch
            title="跳过证书校验"
            description="仅在自签名或异常证书环境需要时开启"
            checked={current().skipVerifyCert}
            onChange={(checked) => patch({ skipVerifyCert: checked })}
          />
          <SettingSwitch
            title="Torrent 自动创建 BT 任务"
            description="下载完 .torrent 后自动加入 BitTorrent 任务"
            checked={current().autoTorrent}
            onChange={(checked) => patch({ autoTorrent: checked })}
          />
          <SettingSwitch
            title="完成后尝试解压"
            description="对 zip / rar / 7z 等归档尝试自动解压"
            checked={current().archiveEnabled}
            onChange={(checked) => patch({ archiveEnabled: checked })}
          />
        </section>

        <section class="rounded-2xl border border-border/50 bg-card p-6">
          <h3 class="text-sm font-semibold">HTTP</h3>
          <p class="mt-1 text-xs text-muted-foreground">直链下载连接参数</p>

          <SettingRow title="连接数" description="单任务分片连接数（1–64）">
            <AppTextFieldBareInput
              type="number"
              class="h-9 w-24 text-right"
              min={1}
              max={64}
              value={String(current().protocolConfig.http.connections)}
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
              aria-label="HTTP 连接数"
            />
          </SettingRow>

          <div class="mt-3 space-y-2 rounded-lg border px-3 py-3">
            <div class="text-sm">User-Agent</div>
            <div class="text-xs text-muted-foreground">HTTP 请求标识；留空则使用引擎默认</div>
            <AppTextFieldBareInput
              fieldClass="mt-2 w-full"
              class="h-9"
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
              aria-label="User-Agent"
            />
          </div>
        </section>

        <section class="rounded-2xl border border-border/50 bg-card p-6">
          <h3 class="text-sm font-semibold">BitTorrent</h3>
          <p class="mt-1 text-xs text-muted-foreground">磁力与种子下载</p>

          <SettingRow title="监听端口" description="0 表示随机分配">
            <AppTextFieldBareInput
              type="number"
              class="h-9 w-24 text-right"
              value={String(current().protocolConfig.bt.listenPort)}
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
              aria-label="BT 监听端口"
            />
          </SettingRow>

          <SettingSwitch
            title="完成后继续做种"
            description="任务完成后保持上传"
            checked={current().protocolConfig.bt.seedKeep}
            onChange={(checked) =>
              patch({
                protocolConfig: {
                  ...current().protocolConfig,
                  bt: {
                    ...current().protocolConfig.bt,
                    seedKeep: checked,
                  },
                },
              })
            }
          />
        </section>

        <section class="rounded-2xl border border-border/50 bg-card p-6">
          <h3 class="text-sm font-semibold">ED2K</h3>
          <p class="mt-1 text-xs text-muted-foreground">电驴协议端口</p>

          <SettingRow title="TCP 端口" description="默认 4662；当前仅解析预留，传输内核未启用">
            <AppTextFieldBareInput
              type="number"
              class="h-9 w-24 text-right"
              value={String(current().protocolConfig.ed2k.tcpPort)}
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
              aria-label="ED2K TCP 端口"
            />
          </SettingRow>
          <div class="mt-3 space-y-2 rounded-lg border px-3 py-3">
            <div class="text-sm">服务器列表</div>
            <div class="text-xs text-muted-foreground">每行一个；解析时写入引擎 extra（传输仍会明确失败）</div>
            <AppTextFieldBareInput
              fieldClass="mt-2 w-full"
              class="h-9"
              placeholder="ed2k://|server|…"
              value={current().protocolConfig.ed2k.serverList.join(',')}
              onInput={(e) =>
                patch({
                  protocolConfig: {
                    ...current().protocolConfig,
                    ed2k: {
                      ...current().protocolConfig.ed2k,
                      serverList: e.currentTarget.value
                        .split(/[,;\n]/)
                        .map((s: string) => s.trim())
                        .filter(Boolean),
                    },
                  },
                })
              }
              aria-label="ED2K 服务器列表"
            />
          </div>
        </section>

        <section class="rounded-2xl border border-border/50 bg-card p-6">
          <h3 class="text-sm font-semibold">Webhook / 脚本</h3>
          <p class="mt-1 text-xs text-muted-foreground">任务状态变更时回调</p>

          <div class="mt-4 space-y-2 rounded-lg border px-3 py-3">
            <div class="text-sm">Webhook URL</div>
            <div class="text-xs text-muted-foreground">留空则不发送回调</div>
            <AppTextFieldBareInput
              fieldClass="mt-2 w-full"
              class="h-9"
              placeholder="https://…"
              value={current().webhookUrl}
              onInput={(e) => patch({ webhookUrl: e.currentTarget.value })}
              aria-label="Webhook URL"
            />
          </div>
        </section>

        <section class="rounded-2xl border border-border/50 bg-card p-6">
          <h3 class="text-sm font-semibold">媒体提取</h3>
          <p class="mt-1 text-xs text-muted-foreground">yt-dlp 兼容引擎选项</p>

          <div class="mt-4 space-y-2 rounded-lg border px-3 py-3">
            <div class="text-sm">合并容器</div>
            <div class="text-xs text-muted-foreground">音视频合流后的输出格式</div>
            <div class="mt-2">
              <AppSelect
                value={current().ytdlp.mergeOutputFormat}
                onChange={(value) => {
                  if (!value) return;
                  patch({
                    ytdlp: {
                      ...current().ytdlp,
                      mergeOutputFormat: value as MergeFormat,
                    },
                  });
                }}
                options={[...MERGE_FORMATS]}
                itemComponent={(itemProps) => (
                  <AppSelectItem item={itemProps.item}>
                    {MERGE_FORMAT_LABELS[itemProps.item.rawValue as MergeFormat]}
                  </AppSelectItem>
                )}
              >
                <AppSelectTrigger layout="compact" class="w-36" aria-label="合并容器">
                  <AppSelectValue>
                    {(state) =>
                      MERGE_FORMAT_LABELS[
                        String(state.selectedOption() ?? 'mp4') as MergeFormat
                      ]
                    }
                  </AppSelectValue>
                  <AppSelectIcon />
                </AppSelectTrigger>
                <AppSelectContent>
                  <AppSelectListbox />
                </AppSelectContent>
              </AppSelect>
            </div>
          </div>

          <SettingSwitch
            title="下载字幕"
            description="可用时一并拉取字幕轨"
            checked={current().ytdlp.writeSubs}
            onChange={(checked) =>
              patch({ ytdlp: { ...current().ytdlp, writeSubs: checked } })
            }
          />
          <SettingSwitch
            title="嵌入元数据"
            description="将标题等信息写入输出文件"
            checked={current().ytdlp.embedMetadata}
            onChange={(checked) =>
              patch({ ytdlp: { ...current().ytdlp, embedMetadata: checked } })
            }
          />
          <SettingSwitch
            title="嵌入缩略图"
            description="后处理嵌入封面（需 ffmpeg）"
            checked={current().ytdlp.embedThumbnail}
            onChange={(checked) =>
              patch({ ytdlp: { ...current().ytdlp, embedThumbnail: checked } })
            }
          />
        </section>
      </div>
    </DownloadHubPageShell>
  );
}
