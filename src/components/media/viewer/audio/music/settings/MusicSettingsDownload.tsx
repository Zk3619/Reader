import { createSignal, type Component } from 'solid-js';
import { AppTextFieldBareInput } from '@/components/shared/AppTextField';
import { getMusicSettings, setMusicSettings } from '@/lib/media/audio/music-settings';
import { QUALITY_LABELS } from '@/lib/media/audio/music-quality';
import type { MusicQuality } from '@/lib/media/audio/lyric-types';
import { MusicAppSelect } from '@/components/media/viewer/audio/music/MusicAppSelect';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { isTauri } from '@/lib/platform/detect';

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

  const applySettings = (patch: Parameters<typeof setMusicSettings>[0]) => {
    setMusicSettings(patch);
    setLocal(getMusicSettings());
  };

  const pickDirectory = async () => {
    if (!isTauri()) return;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === 'string') applySettings({ downloadTargetDirectory: selected });
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
            <h2 class="text-base font-semibold">下载设置</h2>
            <p class="mt-1 text-xs text-muted-foreground">
              下载会保存到指定目录，并保留持久离线缓存（manual）。任务管理请使用侧栏「下载」页。
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
            <h3 class="font-medium">下载路径</h3>
            <p class="mt-1 text-xs text-muted-foreground">
              {isTauri() ? '下载歌曲保存的路径。' : 'Web 端下载路径由浏览器决定，无法在此更改。'}
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-muted-foreground">当前下载路径：</span>
            <AppTextFieldBareInput
              class="min-w-52 flex-1 font-mono text-xs"
              value={settings().downloadTargetDirectory}
              placeholder={isTauri() ? '请选择下载目录' : '由浏览器决定'}
              disabled={!isTauri()}
              onInput={(event) => applySettings({ downloadTargetDirectory: event.currentTarget.value })}
            />
            <Button size="sm" variant="outline" disabled={!isTauri()} onClick={() => void pickDirectory()}>
              更改
            </Button>
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
              当前支持将标题/艺术家/专辑写入 MP3；可选嵌入封面与歌词（USLT）。FLAC 请使用旁路歌词文件。
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
        </section>

        <section class="space-y-3 border-t pt-5">
          <div>
            <h3 class="font-medium">歌词下载</h3>
            <p class="mt-1 text-xs text-muted-foreground">
              可将主歌词保存为独立 UTF-8 歌词文件；翻译、罗马音与 LX Music 扩展字段暂不写入旁路文件。
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
