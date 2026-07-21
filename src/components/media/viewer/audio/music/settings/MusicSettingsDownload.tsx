import { createSignal, onMount, Show, type Component } from 'solid-js';
import { getMusicSettings, setMusicSettings } from '@/lib/media/audio/music-settings';
import { QUALITY_LABELS } from '@/lib/media/audio/music-quality';
import type { MusicQuality } from '@/lib/media/audio/lyric-types';
import { MusicAppSelect } from '@/components/media/viewer/audio/music/MusicAppSelect';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { isTauri } from '@/lib/platform/detect';
import { resolveDefaultDownloadDirectory } from '@/lib/media/audio/audio-download';
import { settingsStore } from '@/stores/settings';
import { getModuleSubdir, resolveModuleMediaRoot } from '@/lib/media/media-root';
import { migrateModuleCaches } from '@/lib/media/media-root-migration';
import { showAppToast } from '@/components/shared/AppToasts';
import { LocalLibraryStorageSetting } from '@/components/settings/LocalLibraryStorageSetting';
import { RememberedChoicesSetting } from '@/components/settings/RememberedChoicesSetting';

const DOWNLOAD_CONCURRENCY = ['1', '2', '3', '4', '5', '6'] as const;
const DOWNLOAD_FILE_NAMES = ['{name}-{artist}', '{artist}-{name}', '{name}'] as const;

function selectedFileName(value: string): (typeof DOWNLOAD_FILE_NAMES)[number] {
  if (value === '{name}') return '{name}';
  const artistIndex = value.indexOf('{artist}');
  const nameIndex = value.indexOf('{name}');
  return artistIndex >= 0 && (nameIndex < 0 || artistIndex < nameIndex)
    ? '{artist}-{name}'
    : '{name}-{artist}';
}

export const MusicSettingsDownload: Component = () => {
  const [settings, setLocal] = createSignal(getMusicSettings());
  const [downloadDirHint, setDownloadDirHint] = createSignal('');
  const [musicRootPath, setMusicRootPath] = createSignal('');
  const followGlobal = () => settingsStore.state.app.musicUseGlobalMediaRoot !== false;

  const applySettings = (patch: Parameters<typeof setMusicSettings>[0]) => {
    setMusicSettings(patch);
    setLocal(getMusicSettings());
  };

  onMount(() => {
    void (async () => {
      setDownloadDirHint(await resolveDefaultDownloadDirectory());
      setMusicRootPath(await resolveModuleMediaRoot('music'));
    })();
  });

  const migrateIfNeeded = async (previousRoot: string, nextRoot: string) => {
    if (!previousRoot || !nextRoot || previousRoot.toLowerCase() === nextRoot.toLowerCase()) return;
    if (!confirm('音乐模块目录已变化，是否立即迁移旧缓存到新目录？')) return;
    const result = await migrateModuleCaches('music', previousRoot, nextRoot);
    showAppToast({
      title: result.movedDirs.length > 0 ? '音乐缓存迁移完成' : '无可迁移缓存',
      description:
        result.movedDirs.length > 0
          ? `已迁移：${result.movedDirs.join('、')}`
          : '旧目录中未发现可迁移缓存目录',
    });
  };

  const pickMusicRoot = async () => {
    if (!isTauri()) return;
    const previousRoot = await resolveModuleMediaRoot('music');
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      directory: true,
      multiple: false,
      defaultPath: settingsStore.state.app.musicMediaRootDirectory?.trim() || musicRootPath(),
    });
    if (typeof selected === 'string') {
      await settingsStore.updateAppSettings({
        musicUseGlobalMediaRoot: false,
        musicMediaRootDirectory: selected.trim(),
      });
      const nextRoot = await resolveModuleMediaRoot('music');
      setMusicRootPath(nextRoot);
      setDownloadDirHint(await resolveDefaultDownloadDirectory());
      await migrateIfNeeded(previousRoot, nextRoot);
    }
  };

  const changeConcurrent = (value: string) => {
    const next = Number(value);
    if (
      next > 3 &&
      !window.confirm('过大的同时下载数量可能会导致你的 IP 被自定义源封禁，是否确认修改？')
    ) {
      return;
    }
    applySettings({ downloadConcurrent: next });
  };

  return (
    <div class="text-sm">
      <div class="space-y-7 p-4">
        <section class="space-y-4">
          <div>
            <h2 class="text-base font-semibold">模块媒体目录</h2>
            <p class="mt-1 text-xs text-muted-foreground">
              音乐缓存与下载默认使用 {getModuleSubdir('music')}/Download；可跟随全局或单独覆盖。
            </p>
          </div>
          <div class="flex items-center gap-2">
            <Checkbox
              id="music-root-follow-global-input"
              checked={followGlobal()}
              onChange={async (checked) => {
                const previousRoot = await resolveModuleMediaRoot('music');
                await settingsStore.updateAppSettings({ musicUseGlobalMediaRoot: checked });
                const nextRoot = await resolveModuleMediaRoot('music');
                setMusicRootPath(nextRoot);
                setDownloadDirHint(await resolveDefaultDownloadDirectory());
                await migrateIfNeeded(previousRoot, nextRoot);
              }}
            />
            <Label for="music-root-follow-global-input">跟随全局 MediaRoot</Label>
          </div>
          <p class="break-all font-mono text-xs text-muted-foreground">{musicRootPath() || '—'}</p>
          <p class="text-xs text-muted-foreground">
            下载目录：{downloadDirHint() || `${getModuleSubdir('music')}/Download`}
          </p>
          {!followGlobal() ? (
            <div class="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={!isTauri()} onClick={() => void pickMusicRoot()}>
                选择自定义目录
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  void (async () => {
                    const previousRoot = await resolveModuleMediaRoot('music');
                    await settingsStore.updateAppSettings({ musicMediaRootDirectory: undefined });
                    const nextRoot = await resolveModuleMediaRoot('music');
                    setMusicRootPath(nextRoot);
                    setDownloadDirHint(await resolveDefaultDownloadDirectory());
                    await migrateIfNeeded(previousRoot, nextRoot);
                  })();
                }}
              >
                清除自定义目录
              </Button>
            </div>
          ) : null}
        </section>

        <section class="space-y-4 border-t pt-5">
          <LocalLibraryStorageSetting moduleKey="music" />
        </section>

        <section class="space-y-4 border-t pt-5">
          <RememberedChoicesSetting scope="music" />
        </section>

        <section class="space-y-4 border-t pt-5">
          <div>
            <h2 class="text-base font-semibold">下载设置</h2>
            <p class="mt-1 text-xs text-muted-foreground">
              下载会保存到模块 Download 子目录，并保留持久离线缓存（manual）。任务管理请使用侧栏「下载」页。
            </p>
          </div>
          <div class="space-y-3">
            <div class="flex items-center gap-2">
              <Checkbox
                id="music-download-enabled-input"
                checked={settings().downloadEnabled}
                onChange={(checked) => applySettings({ downloadEnabled: checked })}
              />
              <Label for="music-download-enabled-input">启用下载功能</Label>
            </div>
            <div class="flex items-center gap-2">
              <Checkbox
                id="music-download-skip-existing-input"
                checked={settings().downloadSkipExisting}
                onChange={(checked) => applySettings({ downloadSkipExisting: checked })}
              />
              <Label for="music-download-skip-existing-input">
                下载目录存在同名文件时跳过下载此任务
              </Label>
            </div>
            <div class="flex items-center gap-2">
              <Checkbox
                id="music-download-group-list-input"
                checked={settings().downloadGroupByPlaylist}
                onChange={(checked) => applySettings({ downloadGroupByPlaylist: checked })}
              />
              <Label for="music-download-group-list-input">
                将文件保存到以对应列表命名的子目录中
              </Label>
            </div>
          </div>
        </section>

        <section class="space-y-3 border-t pt-5">
          <div>
            <h3 class="font-medium">同时下载任务数</h3>
            <p class="mt-1 text-xs text-muted-foreground">
              设置过大可能导致 IP 被封禁，这取决于自定义源；选择 4–6 时会再次确认。
            </p>
          </div>
          <MusicAppSelect
            value={String(settings().downloadConcurrent) as (typeof DOWNLOAD_CONCURRENCY)[number]}
            onChange={changeConcurrent}
            options={DOWNLOAD_CONCURRENCY}
            triggerClass="w-20"
            aria-label="同时下载任务数"
          />
        </section>

        <section class="space-y-3 border-t pt-5">
          <div>
            <h3 class="font-medium">自动换源下载</h3>
            <p class="mt-1 text-xs text-muted-foreground">
              原始来源下载失败时尝试其他来源；换源后的歌曲版本不保证与原版一致。
            </p>
          </div>
          <div class="flex items-center gap-2">
            <Checkbox
              id="music-download-auto-source-input"
              checked={settings().downloadSourceStrategy === 'fallback'}
              onChange={(checked) =>
                applySettings({ downloadSourceStrategy: checked ? 'fallback' : 'primary' })
              }
            />
            <Label for="music-download-auto-source-input">启用</Label>
          </div>
        </section>

        <section class="space-y-3 border-t pt-5">
          <div>
            <h3 class="font-medium">缓存回退导出</h3>
            <p class="mt-1 text-xs text-muted-foreground">
              取链失败时尝试将播放缓存按原格式写出到 Download 目录；音质可能低于所选档位。
            </p>
          </div>
          <div class="flex items-center gap-2">
            <Checkbox
              id="music-download-cache-fallback-input"
              checked={settings().downloadUseCacheFallback}
              onChange={(checked) => applySettings({ downloadUseCacheFallback: checked })}
            />
            <Label for="music-download-cache-fallback-input">取链失败时使用播放缓存</Label>
          </div>
        </section>

        <section class="space-y-3 border-t pt-5">
          <h3 class="font-medium">文件命名方式</h3>
          <MusicAppSelect
            value={selectedFileName(settings().downloadFileNameTemplate ?? '{artist}-{name}')}
            onChange={(value) => applySettings({ downloadFileNameTemplate: value })}
            options={DOWNLOAD_FILE_NAMES}
            optionLabel={(value) => {
              if (value === '{name}-{artist}') return '歌曲名 - 艺术家';
              if (value === '{artist}-{name}') return '艺术家 - 歌曲名';
              return '歌曲名';
            }}
            triggerClass="w-44"
            aria-label="下载文件命名方式"
          />
        </section>

        <section class="space-y-3 border-t pt-5">
          <div>
            <h3 class="font-medium">嵌入到音频文件中的内容</h3>
            <p class="mt-1 text-xs text-muted-foreground">
              当前支持将标题/艺术家/专辑写入 MP3 与 FLAC；可选嵌入封面与歌词（MP3 为 USLT；FLAC
              支持 Vorbis 标签嵌入，旁路 .lrc 仍可用）。
            </p>
          </div>
          <div class="flex items-center gap-2">
            <Checkbox
              id="music-download-embed-cover-input"
              checked={settings().downloadEmbedCover}
              onChange={(checked) => applySettings({ downloadEmbedCover: checked })}
            />
            <Label for="music-download-embed-cover-input">嵌入封面（MP3）</Label>
          </div>
          <div class="flex items-center gap-2">
            <Checkbox
              id="music-download-embed-lyric-input"
              checked={settings().downloadEmbedLyric}
              onChange={(checked) => applySettings({ downloadEmbedLyric: checked })}
            />
            <Label for="music-download-embed-lyric-input">嵌入歌词（MP3）</Label>
          </div>
          <Show when={settings().downloadEmbedLyric}>
            <div class="ml-6 space-y-2">
              <div class="flex items-center gap-2">
                <Checkbox
                  id="music-download-embed-lx-input"
                  checked={settings().downloadEmbedLxLyric}
                  onChange={(checked) => applySettings({ downloadEmbedLxLyric: checked })}
                />
                <Label for="music-download-embed-lx-input">包含逐字/扩展歌词（awlrc）</Label>
              </div>
              <div class="flex items-center gap-2">
                <Checkbox
                  id="music-download-embed-t-input"
                  checked={settings().downloadEmbedTLyric}
                  onChange={(checked) => applySettings({ downloadEmbedTLyric: checked })}
                />
                <Label for="music-download-embed-t-input">包含翻译</Label>
              </div>
              <div class="flex items-center gap-2">
                <Checkbox
                  id="music-download-embed-r-input"
                  checked={settings().downloadEmbedRLyric}
                  onChange={(checked) => applySettings({ downloadEmbedRLyric: checked })}
                />
                <Label for="music-download-embed-r-input">包含罗马音</Label>
              </div>
            </div>
          </Show>
        </section>

        <section class="space-y-3 border-t pt-5">
          <div>
            <h3 class="font-medium">歌词下载</h3>
            <p class="mt-1 text-xs text-muted-foreground">
              与音频同名保存为 `.lrc`（对齐 LX：多轨合并进单文件；UTF-8 带 BOM，GBK 仅客户端）。
            </p>
          </div>
          <div class="flex items-center gap-2">
            <Checkbox
              id="music-download-lyric-file-input"
              checked={settings().downloadSaveLyricFile}
              onChange={(checked) => applySettings({ downloadSaveLyricFile: checked })}
            />
            <Label for="music-download-lyric-file-input">同时下载歌词文件</Label>
          </div>
          <Show when={settings().downloadSaveLyricFile}>
            <div class="ml-6 space-y-3">
              <div class="flex items-center gap-2">
                <Checkbox
                  id="music-download-save-lx-input"
                  checked={settings().downloadSaveLxLyric}
                  onChange={(checked) => applySettings({ downloadSaveLxLyric: checked })}
                />
                <Label for="music-download-save-lx-input">包含逐字/扩展歌词（awlrc）</Label>
              </div>
              <div class="flex items-center gap-2">
                <Checkbox
                  id="music-download-save-t-input"
                  checked={settings().downloadSaveTLyric}
                  onChange={(checked) => applySettings({ downloadSaveTLyric: checked })}
                />
                <Label for="music-download-save-t-input">包含翻译</Label>
              </div>
              <div class="flex items-center gap-2">
                <Checkbox
                  id="music-download-save-r-input"
                  checked={settings().downloadSaveRLyric}
                  onChange={(checked) => applySettings({ downloadSaveRLyric: checked })}
                />
                <Label for="music-download-save-r-input">包含罗马音</Label>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-muted-foreground">编码：</span>
                <MusicAppSelect
                  value={settings().downloadLrcFormat}
                  onChange={(value) =>
                    applySettings({ downloadLrcFormat: value as 'utf8' | 'gbk' })
                  }
                  options={['utf8', 'gbk'] as const}
                  optionLabel={(value) => (value === 'gbk' ? 'GBK（仅客户端）' : 'UTF-8')}
                  triggerClass="w-40"
                  aria-label="歌词文件编码"
                />
              </div>
            </div>
          </Show>
        </section>

        <section class="space-y-3 border-t pt-5">
          <div>
            <h3 class="font-medium">下载音质</h3>
            <p class="mt-1 text-xs text-muted-foreground">批量下载默认音质；单曲可在入队时覆盖。</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-muted-foreground">下载音质：</span>
            <MusicAppSelect
              value={settings().downloadQuality ?? settings().playQuality}
              onChange={(v) => applySettings({ downloadQuality: v as MusicQuality })}
              options={Object.keys(QUALITY_LABELS)}
              optionLabel={(v) => QUALITY_LABELS[v as MusicQuality]}
              triggerClass="w-32"
              aria-label="下载音质"
            />
          </div>
        </section>
      </div>
    </div>
  );
};
