import { createSignal, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { AppTextFieldBareTextArea } from '@/components/shared/AppTextField';
import {
  exportAudioLibrarySnapshot,
  serializeSnapshot,
} from '@/lib/media/audio/sync/remote-snapshot';
import {
  createMusicBackup,
  importMusicBackup,
  parseMusicBackup,
} from '@/lib/media/audio/music-backup';
import {
  exportMusicSettings,
  importMusicSettings,
} from '@/lib/media/audio/music-settings';
import { MusicAppSelect } from '@/components/viewer/audio/music/MusicAppSelect';
import { toUserFacingMusicError } from '@/lib/media/audio/music-user-error';

export interface MusicSettingsBackupProps {
  embedded?: boolean;
}

export const MusicSettingsBackup: Component<MusicSettingsBackupProps> = (props) => {
  const [importText, setImportText] = createSignal('');
  const [mode, setMode] = createSignal<'merge' | 'overwrite'>('merge');
  const [feedback, setFeedback] = createSignal('');

  const downloadJson = (value: string, filename: string) => {
    const url = URL.createObjectURL(new Blob([value], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportAll = async () => {
    const backup = await createMusicBackup();
    downloadJson(
      JSON.stringify(backup, null, 2),
      `reader-music-backup-${Date.now()}.json`,
    );
  };

  const exportSnapshotOnly = async () => {
    const snapshot = await exportAudioLibrarySnapshot();
    downloadJson(serializeSnapshot(snapshot), `reader-music-library-${Date.now()}.json`);
  };

  const doImport = async () => {
    try {
      const parsed = JSON.parse(importText()) as { kind?: string };
      if (parsed.kind !== 'reader-music-backup') {
        if (mode() === 'overwrite') {
          importMusicSettings(importText());
          setFeedback('设置导入成功。');
        } else {
          setFeedback('仅完整备份支持合并导入；导入设置时请选择覆盖模式。');
        }
        return;
      }
      const result = await importMusicBackup(parseMusicBackup(importText()), mode());
      setFeedback(
        `导入成功：${result.tracks} 首歌曲、${result.playlists} 个列表、${result.storageKeys} 项旁路设置（${result.mode === 'merge' ? '合并' : '覆盖'}）`,
      );
    } catch (error) {
      setFeedback(`导入失败：${toUserFacingMusicError(error)}`);
    }
  };

  return (
    <div class={props.embedded ? 'space-y-5 text-sm' : 'space-y-5 p-4 text-sm'}>
      {!props.embedded && (
        <div>
          <h2 class="font-medium">备份与恢复</h2>
          <p class="mt-1 text-xs text-muted-foreground">导出的 Reader 音乐备份包含格式版本，可在导入前校验。</p>
        </div>
      )}
      <section class="space-y-3 rounded-lg border p-4">
        <h3 class="font-medium">部分数据</h3>
        <p class="text-xs text-muted-foreground">按需导出音乐设置或曲库列表与歌曲信息。</p>
        <div class="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => downloadJson(exportMusicSettings(), `reader-music-settings-${Date.now()}.json`)}
          >
            导出音乐设置
          </Button>
          <Button size="sm" variant="outline" onClick={() => void exportSnapshotOnly()}>
            导出曲库快照
          </Button>
        </div>
      </section>
      <section class="space-y-3 rounded-lg border p-4">
        <h3 class="font-medium">所有数据</h3>
        <p class="text-xs text-muted-foreground">
          完整备份包含音乐设置、曲库、歌单及音乐模块的附加配置。
        </p>
        <Button size="sm" onClick={() => void exportAll()}>导出完整音乐备份</Button>
        <AppTextFieldBareTextArea
          class="h-32 font-mono text-xs"
          placeholder="粘贴 Reader 完整音乐备份或音乐设置 JSON"
          value={importText()}
          onInput={(e) => setImportText(e.currentTarget.value)}
        />
        <div class="flex flex-wrap items-center gap-2">
          <MusicAppSelect
            value={mode()}
            onChange={(value) => setMode(value as 'merge' | 'overwrite')}
            options={['merge', 'overwrite'] as const}
            optionLabel={(value) => value === 'merge' ? '与现有音乐数据合并' : '覆盖现有音乐数据'}
            triggerClass="w-48"
            aria-label="音乐备份导入方式"
          />
          <Button size="sm" variant="outline" disabled={!importText().trim()} onClick={() => void doImport()}>
            校验并导入
          </Button>
        </div>
        {feedback() && <p class="text-xs text-muted-foreground">{feedback()}</p>}
      </section>
      <section class="space-y-3 rounded-lg border border-dashed p-4">
        <h3 class="font-medium">其他格式</h3>
        <p class="text-xs text-muted-foreground">
          Reader 暂不支持 LX Music 的 .lxmc 文件，也不支持将歌单直接导出为 TXT 或 CSV。
          如需迁移，请先在 LX Music 中转换，再使用 Reader JSON 快照。
        </p>
        <div class="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled>导出 TXT（不支持）</Button>
          <Button size="sm" variant="outline" disabled>导出 CSV（不支持）</Button>
        </div>
      </section>
    </div>
  );
};
