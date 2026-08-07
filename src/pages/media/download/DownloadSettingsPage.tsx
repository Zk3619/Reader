/**
 * 下载模块设置
 */

import { Show, createResource, createSignal, onMount } from 'solid-js';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RememberedChoicesSetting } from '@/components/settings/RememberedChoicesSetting';
import {
  DEFAULT_DOWNLOAD_CONFIG,
  getDownloadConfig,
  setDownloadConfig,
  type DownloadModuleConfig,
} from '@/lib/download';
import {
  getModuleSubdir,
  resolveModuleDownloadDirectory,
  resolveModuleMediaRoot,
} from '@/lib/media/media-root';
import { migrateModuleCaches } from '@/lib/media/media-root-migration';
import { showAppToast } from '@/components/shared/AppToasts';
import { settingsStore } from '@/stores/settings';
import { isTauri } from '@/lib/platform/detect';

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
  const [moduleRootPath, setModuleRootPath] = createSignal('');
  const [downloadDirHint, setDownloadDirHint] = createSignal('');

  const current = () => draft() ?? cfg() ?? DEFAULT_DOWNLOAD_CONFIG;
  const followGlobal = () => settingsStore.state.app.downloadUseGlobalMediaRoot !== false;
  const hasDirOverride = () => Boolean(current().downloadDir?.trim());

  const patch = (partial: Partial<DownloadModuleConfig>) => {
    setDraft({ ...current(), ...partial });
  };

  /** MediaRoot 切换时立即清掉绝对路径覆盖并落盘，避免仍走旧 downloadDir */
  const clearDownloadDirOverride = async () => {
    patch({ downloadDir: '' });
    await setDownloadConfig({ downloadDir: '' });
    setDraft((d) => (d ? { ...d, downloadDir: '' } : d));
    await refetch();
  };

  const refreshPaths = async () => {
    try {
      setModuleRootPath(await resolveModuleMediaRoot('download'));
      const stored = (draft() ?? cfg() ?? DEFAULT_DOWNLOAD_CONFIG).downloadDir?.trim();
      setDownloadDirHint(stored || (await resolveModuleDownloadDirectory('download')));
    } catch {
      setModuleRootPath('');
      setDownloadDirHint('');
    }
  };

  onMount(() => {
    void refreshPaths();
  });

  const migrateIfNeeded = async (previousRoot: string, nextRoot: string) => {
    if (!previousRoot || !nextRoot || previousRoot.toLowerCase() === nextRoot.toLowerCase()) {
      return;
    }
    if (!confirm('下载模块目录已变化，是否立即迁移旧数据到新目录？')) return;
    const result = await migrateModuleCaches('download', previousRoot, nextRoot);
    showAppToast({
      title: result.movedDirs.length > 0 ? '下载目录迁移完成' : '无可迁移数据',
      description:
        result.movedDirs.length > 0
          ? `已迁移：${result.movedDirs.join('、')}`
          : '旧目录中未发现可迁移子目录',
    });
  };

  const pickModuleRoot = async () => {
    if (!isTauri()) return;
    const previousRoot = await resolveModuleMediaRoot('download');
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      directory: true,
      multiple: false,
      defaultPath:
        settingsStore.state.app.downloadMediaRootDirectory?.trim() || moduleRootPath(),
    });
    if (typeof selected !== 'string') return;
    await settingsStore.updateAppSettings({
      downloadUseGlobalMediaRoot: false,
      downloadMediaRootDirectory: selected.trim(),
    });
    await clearDownloadDirOverride();
    const nextRoot = await resolveModuleMediaRoot('download');
    setModuleRootPath(nextRoot);
    setDownloadDirHint(await resolveModuleDownloadDirectory('download'));
    await migrateIfNeeded(previousRoot, nextRoot);
  };

  const pickDownloadDirOverride = async () => {
    if (!isTauri()) return;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      directory: true,
      multiple: false,
      defaultPath: current().downloadDir?.trim() || downloadDirHint() || undefined,
    });
    if (typeof selected !== 'string') return;
    patch({ downloadDir: selected.trim() });
    setDownloadDirHint(selected.trim());
  };

  const save = async () => {
    setSaving(true);
    try {
      await setDownloadConfig(current());
      setDraft(null);
      await refetch();
      await refreshPaths();
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
          <h3 class="text-sm font-semibold">模块媒体目录</h3>
          <p class="mt-1 text-xs text-muted-foreground">
            下载默认使用 MediaRoot/{getModuleSubdir('download')}，并按类型分入 General / Compressed /
            Documents / Music / Video / Programs；可跟随全局或单独覆盖。
          </p>

          <div class="mt-4 flex items-center gap-2">
            <Checkbox
              id="download-root-follow-global-input"
              checked={followGlobal()}
              onChange={(checked) => {
                void (async () => {
                  const previousRoot = await resolveModuleMediaRoot('download');
                  await settingsStore.updateAppSettings({
                    downloadUseGlobalMediaRoot: checked,
                  });
                  await clearDownloadDirOverride();
                  const nextRoot = await resolveModuleMediaRoot('download');
                  setModuleRootPath(nextRoot);
                  setDownloadDirHint(await resolveModuleDownloadDirectory('download'));
                  await migrateIfNeeded(previousRoot, nextRoot);
                })();
              }}
            />
            <Label for="download-root-follow-global-input">跟随全局 MediaRoot</Label>
          </div>
          <p class="mt-3 break-all font-mono text-xs text-muted-foreground">
            {moduleRootPath() || '—'}
          </p>
          <p class="mt-1 text-xs text-muted-foreground">
            下载根目录：
            {downloadDirHint() || getModuleSubdir('download')}
            {hasDirOverride() ? '（已单独覆盖）' : ''}
            ；文件按类型写入其下分类子目录。
          </p>

          <Show when={!followGlobal()}>
            <div class="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!isTauri()}
                onClick={() => void pickModuleRoot()}
              >
                选择自定义目录
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  void (async () => {
                    const previousRoot = await resolveModuleMediaRoot('download');
                    await settingsStore.updateAppSettings({
                      downloadMediaRootDirectory: undefined,
                    });
                    await clearDownloadDirOverride();
                    const nextRoot = await resolveModuleMediaRoot('download');
                    setModuleRootPath(nextRoot);
                    setDownloadDirHint(await resolveModuleDownloadDirectory('download'));
                    await migrateIfNeeded(previousRoot, nextRoot);
                  })();
                }}
              >
                清除自定义目录
              </Button>
            </div>
          </Show>

          <div class="mt-4 space-y-2 border-t border-border/40 pt-4">
            <p class="text-xs text-muted-foreground">
              也可将任务保存目录设为任意路径（覆盖上方 MediaRoot 解析结果）；需点顶栏「保存」生效，清除后恢复跟随。
            </p>
            <div class="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!isTauri()}
                onClick={() => void pickDownloadDirOverride()}
              >
                选择独立下载目录
              </Button>
              <Show when={hasDirOverride()}>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    void (async () => {
                      await clearDownloadDirOverride();
                      await refreshPaths();
                    })();
                  }}
                >
                  清除目录覆盖
                </Button>
              </Show>
            </div>
          </div>
        </section>

        <section class="rounded-2xl border border-border/50 bg-card p-6">
          <h3 class="text-sm font-semibold">通用</h3>
          <p class="mt-1 text-xs text-muted-foreground">代理与队列行为</p>

          <div class="mt-4 space-y-2 rounded-lg border px-3 py-3">
            <div class="text-sm">代理模式</div>
            <div class="text-xs text-muted-foreground">
              默认跟随主程序「网络默认值」出站代理；也可本模块覆盖
            </div>
            <div class="mt-2">
              <AppSelect
                value={current().proxyMode}
                onChange={(value) => {
                  if (!value) return;
                  patch({ proxyMode: value as DownloadModuleConfig['proxyMode'] });
                }}
                options={['follow', 'none', 'env', 'windows', 'custom']}
                itemComponent={(itemProps) => (
                  <AppSelectItem item={itemProps.item}>
                    {itemProps.item.rawValue === 'follow'
                      ? '跟随主程序'
                      : itemProps.item.rawValue === 'none'
                        ? '不使用代理'
                        : itemProps.item.rawValue === 'custom'
                          ? '自定义'
                          : itemProps.item.rawValue === 'windows'
                            ? 'Windows 系统代理'
                            : '跟随环境变量'}
                  </AppSelectItem>
                )}
              >
                <AppSelectTrigger layout="compact" class="w-48" aria-label="代理模式">
                  <AppSelectValue>
                    {(state) => {
                      const v = String(state.selectedOption() ?? 'follow');
                      return v === 'follow'
                        ? '跟随主程序'
                        : v === 'none'
                          ? '不使用代理'
                          : v === 'custom'
                            ? '自定义'
                            : v === 'windows'
                              ? 'Windows 系统代理'
                              : '跟随环境变量';
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
            <div class="text-xs text-muted-foreground">仅本模块 proxyMode=custom 时生效，如 http://127.0.0.1:7890</div>
            <AppTextFieldBareInput
              fieldClass="mt-2 w-full"
              class="h-9"
              placeholder="http://127.0.0.1:7890"
              value={current().proxyUrl}
              onInput={(e) => patch({ proxyUrl: e.currentTarget.value })}
              aria-label="代理 URL"
            />
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

        <BiliDownloadSettingsSection />

        <RememberedChoicesSetting scope="download" />
      </div>
    </DownloadHubPageShell>
  );
}

function BiliDownloadSettingsSection() {
  const [biliCfg, { refetch }] = createResource(() =>
    import('@/lib/download/bili/config').then((m) => m.getBiliDownloadConfig()),
  );
  const [draft, setDraft] = createSignal<
    import('@/lib/download/bili/config').BiliDownloadConfig | null
  >(null);
  const current = () =>
    draft() ??
    biliCfg() ?? {
      version: 1 as const,
      default: { res: 80, abr: 30280, enc: 7, fmt: 'dash' as const },
      blockPcdn: true,
      convertDanmaku: true,
      addMetadata: true,
      autoDownload: true,
      format: {
        series: '{container} - {showtitle}',
        item: '({index}) {mediaType} - {title}',
        file: '{taskType} - {title}',
      },
      organize: { autoRename: true, topFolder: true, subFolder: true },
    };

  const patch = async (
    p: Partial<import('@/lib/download/bili/config').BiliDownloadConfig>,
  ) => {
    const { setBiliDownloadConfig } = await import('@/lib/download/bili/config');
    const next = await setBiliDownloadConfig({
      ...current(),
      ...p,
      default: { ...current().default, ...p.default },
      format: { ...current().format, ...p.format },
      organize: { ...current().organize, ...p.organize },
    });
    setDraft(next);
    void refetch();
  };

  return (
    <section class="rounded-2xl border border-border/50 bg-card p-6">
      <h3 class="text-sm font-semibold">哔哩</h3>
      <p class="mt-1 text-xs text-muted-foreground">
        独立哔哩页默认画质、PCDN、命名与弹幕 ASS
      </p>

      <SettingRow title="默认清晰度 qn" description="例如 80=1080P，127=8K">
        <AppTextFieldBareInput
          class="h-9 w-24"
          type="number"
          value={String(current().default.res)}
          onInput={(e) =>
            void patch({
              default: {
                ...current().default,
                res: Number(e.currentTarget.value) || 80,
              },
            })
          }
        />
      </SettingRow>
      <SettingRow title="默认音质" description="例如 30280=320K">
        <AppTextFieldBareInput
          class="h-9 w-28"
          type="number"
          value={String(current().default.abr)}
          onInput={(e) =>
            void patch({
              default: {
                ...current().default,
                abr: Number(e.currentTarget.value) || 30280,
              },
            })
          }
        />
      </SettingRow>
      <SettingSwitch
        title="过滤 PCDN"
        description="优先 upos/mirror 直链"
        checked={current().blockPcdn}
        onChange={(checked) => void patch({ blockPcdn: checked })}
      />
      <SettingSwitch
        title="弹幕转 ASS"
        description="同时保存 XML 与 ASS"
        checked={current().convertDanmaku}
        onChange={(checked) => void patch({ convertDanmaku: checked })}
      />
      <SettingSwitch
        title="入队后自动开始"
        description="创建任务后立即调度下载"
        checked={current().autoDownload}
        onChange={(checked) => void patch({ autoDownload: checked })}
      />
      <SettingSwitch
        title="顶层文件夹"
        checked={current().organize.topFolder}
        onChange={(checked) =>
          void patch({
            organize: { ...current().organize, topFolder: checked },
          })
        }
      />
      <SettingSwitch
        title="条目子文件夹"
        checked={current().organize.subFolder}
        onChange={(checked) =>
          void patch({
            organize: { ...current().organize, subFolder: checked },
          })
        }
      />
      <div class="mt-3 space-y-2 rounded-lg border px-3 py-3">
        <div class="text-sm">系列文件夹模板</div>
        <AppTextFieldBareInput
          fieldClass="mt-2 w-full"
          class="h-9"
          value={current().format.series}
          onInput={(e) =>
            void patch({
              format: { ...current().format, series: e.currentTarget.value },
            })
          }
        />
      </div>
      <div class="mt-3 space-y-2 rounded-lg border px-3 py-3">
        <div class="text-sm">条目文件夹模板</div>
        <AppTextFieldBareInput
          fieldClass="mt-2 w-full"
          class="h-9"
          value={current().format.item}
          onInput={(e) =>
            void patch({
              format: { ...current().format, item: e.currentTarget.value },
            })
          }
        />
      </div>
      <div class="mt-3 space-y-2 rounded-lg border px-3 py-3">
        <div class="text-sm">文件名模板</div>
        <AppTextFieldBareInput
          fieldClass="mt-2 w-full"
          class="h-9"
          value={current().format.file}
          onInput={(e) =>
            void patch({
              format: { ...current().format, file: e.currentTarget.value },
            })
          }
        />
      </div>
    </section>
  );
}
