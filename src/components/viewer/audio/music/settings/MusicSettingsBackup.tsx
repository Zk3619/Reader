import { createSignal, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  exportMusicSettings,
  importMusicSettings,
} from '@/lib/media/audio/music-settings';
import {
  exportAudioLibrarySnapshot,
  importAudioLibrarySnapshot,
  serializeSnapshot,
} from '@/lib/media/audio/sync/remote-snapshot';
import type { AudioLibrarySnapshot } from '@/lib/media/audio/sync/remote-snapshot';

export const MusicSettingsBackup: Component = () => {
  const [importText, setImportText] = createSignal('');

  const exportAll = async () => {
    const snapshot = await exportAudioLibrarySnapshot();
    const blob = new Blob(
      [
        JSON.stringify(
          {
            settings: JSON.parse(exportMusicSettings()),
            snapshot,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reader-music-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportSnapshotOnly = async () => {
    const snapshot = await exportAudioLibrarySnapshot();
    const blob = new Blob([serializeSnapshot(snapshot)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reader-music-library-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const doImport = async () => {
    try {
      const data = JSON.parse(importText()) as {
        settings?: Record<string, unknown>;
        snapshot?: AudioLibrarySnapshot;
      };
      if (data.settings) importMusicSettings(JSON.stringify(data.settings));
      if (data.snapshot) {
        await importAudioLibrarySnapshot(data.snapshot, { merge: true });
      }
    } catch {
      /* ignore */
    }
  };

  return (
    <div class="space-y-4 p-4 text-sm">
      <div class="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void exportAll()}>
          导出设置与完整曲库
        </Button>
        <Button size="sm" variant="outline" onClick={() => void exportSnapshotOnly()}>
          仅导出曲库快照
        </Button>
      </div>
      <textarea
        class="h-32 w-full rounded border p-2 font-mono text-xs"
        placeholder="粘贴备份 JSON（含 settings / snapshot）"
        value={importText()}
        onInput={(e) => setImportText(e.currentTarget.value)}
      />
      <Button size="sm" variant="outline" onClick={() => void doImport()}>
        导入
      </Button>
    </div>
  );
};
