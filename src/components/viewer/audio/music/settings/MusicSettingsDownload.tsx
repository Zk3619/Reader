import { createSignal, type Component } from 'solid-js';
import { AppTextFieldBareInput } from '@/components/shared/AppTextField';
import {
  NumberField,
  NumberFieldInput,
} from '@/components/ui/number-field';
import { getMusicSettings, setMusicSettings } from '@/lib/media/audio/music-settings';
import { QUALITY_LABELS } from '@/lib/media/audio/music-quality';
import type { MusicQuality } from '@/lib/media/audio/lyric-types';
import { AudioDownloadPanel } from '@/components/viewer/audio/music/AudioDownloadPanel';
import { MusicAppSelect } from '@/components/viewer/audio/music/MusicAppSelect';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

export const MusicSettingsDownload: Component = () => {
  const [settings, setLocal] = createSignal(getMusicSettings());

  const applySettings = (patch: Parameters<typeof setMusicSettings>[0]) => {
    setMusicSettings(patch);
    setLocal(getMusicSettings());
  };

  return (
    <div class="space-y-4">
      <div class="space-y-2 p-4 text-sm">
        <p class="text-xs text-muted-foreground">
          下载内容写入 Reader 音乐离线缓存；缓存位置与清理由系统存储设置统一管理。
        </p>
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
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-muted-foreground">文件命名：</span>
          <AppTextFieldBareInput
            class="min-w-0 flex-1 font-mono text-xs"
            placeholder="{artist}-{name}"
            value={settings().downloadFileNameTemplate ?? '{artist}-{name}'}
            onInput={(e) => applySettings({ downloadFileNameTemplate: e.currentTarget.value })}
          />
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-muted-foreground">并发数：</span>
          <NumberField
            rawValue={settings().downloadConcurrent}
            onRawValueChange={(v) => applySettings({ downloadConcurrent: v })}
            minValue={1}
            maxValue={5}
          >
            <NumberFieldInput class="w-16" aria-label="下载并发数" />
          </NumberField>
        </div>
        <div class="flex items-center gap-2">
          <Checkbox
            id="music-download-skip-existing-input"
            checked={settings().downloadSkipExisting}
            onChange={(checked) => applySettings({ downloadSkipExisting: checked })}
          />
          <Label for="music-download-skip-existing-input">跳过已经下载完成的歌曲</Label>
        </div>
      </div>
      <AudioDownloadPanel open inline />
    </div>
  );
};
