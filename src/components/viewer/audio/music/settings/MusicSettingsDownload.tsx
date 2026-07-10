import { createSignal, For, type Component } from 'solid-js';
import { getMusicSettings, setMusicSettings } from '@/lib/media/audio/music-settings';
import { QUALITY_LABELS } from '@/lib/media/audio/music-quality';
import type { MusicQuality } from '@/lib/media/audio/lyric-types';
import { AudioDownloadPanel } from '@/components/viewer/audio/music/AudioDownloadPanel';

export const MusicSettingsDownload: Component = () => {
  const [settings, setLocal] = createSignal(getMusicSettings());

  return (
    <div class="space-y-4">
      <div class="space-y-2 p-4 text-sm">
        <div>
          <span class="text-muted-foreground">下载路径：</span>
          <input
            class="ml-2 flex-1 rounded border px-2 py-1"
            placeholder="留空使用默认"
            value={settings().downloadPath}
            onInput={(e) => {
              setMusicSettings({ downloadPath: e.currentTarget.value });
              setLocal(getMusicSettings());
            }}
          />
        </div>
        <div>
          <span class="text-muted-foreground">下载音质：</span>
          <select
            class="ml-2 rounded border px-2 py-1"
            value={settings().downloadQuality ?? settings().playQuality}
            onChange={(e) => {
              setMusicSettings({ downloadQuality: e.currentTarget.value as MusicQuality });
              setLocal(getMusicSettings());
            }}
          >
            <For each={Object.entries(QUALITY_LABELS)}>
              {([k, label]) => <option value={k}>{label}</option>}
            </For>
          </select>
        </div>
        <div>
          <span class="text-muted-foreground">文件命名：</span>
          <input
            class="ml-2 flex-1 rounded border px-2 py-1 font-mono text-xs"
            placeholder="{artist}-{name}"
            value={settings().downloadFileNameTemplate ?? '{artist}-{name}'}
            onInput={(e) => {
              setMusicSettings({ downloadFileNameTemplate: e.currentTarget.value });
              setLocal(getMusicSettings());
            }}
          />
        </div>
        <div>
          <span class="text-muted-foreground">并发数：</span>
          <input
            type="number"
            min={1}
            max={5}
            class="ml-2 w-16 rounded border px-2 py-1"
            value={settings().downloadConcurrent}
            onChange={(e) => {
              setMusicSettings({ downloadConcurrent: Number(e.currentTarget.value) });
              setLocal(getMusicSettings());
            }}
          />
        </div>
      </div>
      <AudioDownloadPanel open inline />
    </div>
  );
};
