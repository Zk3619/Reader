/**
 * 同步设置
 */

import { createResource, createSignal, Show, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { AppTextFieldBareInput } from '@/components/shared/AppTextField';
import { MusicAppSelect } from '@/components/viewer/audio/music/MusicAppSelect';
import {
  connectLxSyncClient,
  disconnectLxSyncClient,
  loadLxSyncConfig,
  lxSyncListAction,
  probeSyncServer,
  updateLxSyncConfig,
  type LxSyncMode,
} from '@/lib/media/audio/sync/lx-sync-client';
import {
  handleLxDislikeAction,
  handleLxListAction,
  pullPlaylistsFromLx,
  pushLocalPlaylistsToLx,
} from '@/lib/media/audio/sync/lx-sync-actions';
import {
  exportAudioLibrarySnapshot,
  importAudioLibrarySnapshot,
  parseSnapshot,
  serializeSnapshot,
  syncAudioLibraryViaWebDav,
  syncAudioLibraryViaGithub,
  getGithubSnapshotUrl,
  setGithubSnapshotUrl,
} from '@/lib/media/audio/sync/remote-snapshot';
import { showAppToast } from '@/components/shared/AppToasts';
import { AudioPanelShell } from '@/components/viewer/audio/music/AudioPanelShell';

export interface AudioSyncSettingsProps {
  open: boolean;
  onClose?: () => void;
  inline?: boolean;
}

const SYNC_MODES: { value: LxSyncMode; label: string }[] = [
  { value: 'merge_local_remote', label: '合并（本地优先）' },
  { value: 'merge_remote_local', label: '合并（远端优先）' },
  { value: 'overwrite_local_remote', label: '覆盖远端' },
  { value: 'overwrite_remote_local', label: '覆盖本地' },
  { value: 'overwrite_local_remote_full', label: '完全覆盖远端' },
  { value: 'overwrite_remote_local_full', label: '完全覆盖本地' },
];

export const AudioSyncSettings: Component<AudioSyncSettingsProps> = (props) => {
  const active = () => props.inline || props.open;
  const [config, { refetch }] = createResource(() => (active() ? loadLxSyncConfig() : null));
  const [serverUrl, setServerUrl] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [syncMode, setSyncMode] = createSignal<LxSyncMode>('merge_local_remote');
  const [githubUrl, setGithubUrl] = createSignal(getGithubSnapshotUrl());
  const [busy, setBusy] = createSignal(false);

  const saveAndConnect = async () => {
    const url = serverUrl().trim() || config()?.serverUrl || '';
    if (!url) return;
    const probe = await probeSyncServer(url);
    if (!probe.ok) {
      showAppToast({ title: '连接失败', description: '无法访问 lx-sync-server', variant: 'destructive' });
      return;
    }
    await updateLxSyncConfig({ serverUrl: url, syncMode: syncMode() });
    await connectLxSyncClient({
      serverUrl: url,
      password: password(),
      onConnected: () => showAppToast({ title: '已连接同步服务' }),
      onDisconnected: () => showAppToast({ title: '同步已断开' }),
      onListAction: (action, data) => {
        if (action.startsWith('dislike_')) {
          void handleLxDislikeAction(action, data);
        } else {
          void handleLxListAction(action, data);
        }
      },
    });
    void refetch();
  };

  const exportSnapshot = async () => {
    const snap = await exportAudioLibrarySnapshot();
    const blob = new Blob([serializeSnapshot(snap)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `audio_library_snapshot_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importSnapshotFile = async (file: File) => {
    const text = await file.text();
    const snap = parseSnapshot(text);
    const merge = syncMode().startsWith('merge');
    await importAudioLibrarySnapshot(snap, { merge });
    showAppToast({ title: '快照已导入' });
  };

  const pullFromLx = async () => {
    setBusy(true);
    try {
      await pullPlaylistsFromLx();
      showAppToast({ title: '已从 LX 同步歌单' });
    } catch (e) {
      showAppToast({ title: '拉取失败', description: String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const pushToLx = async () => {
    setBusy(true);
    try {
      await pushLocalPlaylistsToLx(lxSyncListAction);
      showAppToast({ title: '已推送到 LX' });
    } catch (e) {
      showAppToast({ title: '推送失败', description: String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AudioPanelShell open={props.open} inline={props.inline} title="同步" onClose={props.onClose}>
      <div class="space-y-4 p-4">
            <section>
              <h3 class="mb-2 text-sm font-medium">同步模式</h3>
              <MusicAppSelect
                value={syncMode()}
                onChange={(v) => setSyncMode(v as LxSyncMode)}
                options={SYNC_MODES.map((m) => m.value)}
                optionLabel={(v) => SYNC_MODES.find((m) => m.value === v)?.label ?? v}
                aria-label="同步模式"
              />
            </section>
            <section>
              <h3 class="mb-2 text-sm font-medium">lx-music-sync-server</h3>
              <AppTextFieldBareInput
                class="mb-2"
                placeholder="http://127.0.0.1:9527"
                value={serverUrl() || config()?.serverUrl || ''}
                onInput={(e) => setServerUrl(e.currentTarget.value)}
              />
              <AppTextFieldBareInput
                class="mb-2"
                placeholder="连接密码"
                type="password"
                value={password()}
                onInput={(e) => setPassword(e.currentTarget.value)}
              />
              <div class="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void saveAndConnect()}>
                  连接
                </Button>
                <Button size="sm" variant="outline" onClick={() => disconnectLxSyncClient()}>
                  断开
                </Button>
                <Button size="sm" variant="outline" disabled={busy()} onClick={() => void pullFromLx()}>
                  Pull
                </Button>
                <Button size="sm" variant="outline" disabled={busy()} onClick={() => void pushToLx()}>
                  Push
                </Button>
              </div>
              <Show when={config()?.connected}>
                <p class="mt-2 text-xs text-success-foreground">已连接（v4 协议，连接时自动同步）</p>
              </Show>
            </section>
            <section>
              <h3 class="mb-2 text-sm font-medium">WebDAV / JSON 快照</h3>
              <input
                type="file"
                accept=".json"
                class="mb-2 text-sm"
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  if (file) void importSnapshotFile(file);
                }}
              />
              <div class="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => void exportSnapshot()}>
                  导出 JSON
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void syncAudioLibraryViaWebDav('upload').then(() =>
                      showAppToast({ title: '已上传到 WebDAV' }),
                    ).catch((e) =>
                      showAppToast({ title: '上传失败', description: String(e), variant: 'destructive' }),
                    )
                  }
                >
                  上传到 WebDAV
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void syncAudioLibraryViaWebDav('merge').then(() =>
                      showAppToast({ title: 'WebDAV 同步完成' }),
                    ).catch((e) =>
                      showAppToast({ title: '同步失败', description: String(e), variant: 'destructive' }),
                    )
                  }
                >
                  从 WebDAV 合并
                </Button>
              </div>
            </section>
            <section>
              <h3 class="mb-2 text-sm font-medium">GitHub 快照（可选）</h3>
              <AppTextFieldBareInput
                class="mb-2"
                placeholder="https://gist.githubusercontent.com/..."
                value={githubUrl()}
                onInput={(e) => {
                  setGithubUrl(e.currentTarget.value);
                  setGithubSnapshotUrl(e.currentTarget.value);
                }}
              />
              <div class="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void syncAudioLibraryViaGithub('upload').then(() =>
                      showAppToast({ title: '已上传到 GitHub' }),
                    ).catch((e) =>
                      showAppToast({ title: '上传失败', description: String(e), variant: 'destructive' }),
                    )
                  }
                >
                  上传到 GitHub
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void syncAudioLibraryViaGithub('merge').then(() =>
                      showAppToast({ title: 'GitHub 同步完成' }),
                    ).catch((e) =>
                      showAppToast({ title: '同步失败', description: String(e), variant: 'destructive' }),
                    )
                  }
                >
                  从 GitHub 合并
                </Button>
              </div>
            </section>
          </div>
    </AudioPanelShell>
  );
};
