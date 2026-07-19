/**
 * 同步设置
 */

import { createEffect, createResource, createSignal, type Component } from 'solid-js';
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
import { toUserFacingMusicError } from '@/lib/media/audio/music-user-error';
import { AudioPanelShell } from '@/components/viewer/audio/music/AudioPanelShell';

export interface AudioSyncSettingsProps {
  open: boolean;
  onClose?: () => void;
  inline?: boolean;
  embedded?: boolean;
}

const SYNC_MODES: { value: LxSyncMode; label: string }[] = [
  { value: 'merge_local_remote', label: '合并数据，以 Reader 为准' },
  { value: 'merge_remote_local', label: '合并数据，以 LX Music 为准' },
  { value: 'overwrite_local_remote', label: '用 Reader 列表覆盖 LX Music' },
  { value: 'overwrite_remote_local', label: '用 LX Music 列表覆盖 Reader' },
  { value: 'overwrite_local_remote_full', label: '用 Reader 全部数据覆盖 LX Music' },
  { value: 'overwrite_remote_local_full', label: '用 LX Music 全部数据覆盖 Reader' },
];

export const AudioSyncSettings: Component<AudioSyncSettingsProps> = (props) => {
  const active = () => props.inline || props.open;
  const [config, { refetch }] = createResource(() => (active() ? loadLxSyncConfig() : null));
  const [serverUrl, setServerUrl] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [syncMode, setSyncMode] = createSignal<LxSyncMode>('merge_local_remote');
  const [githubUrl, setGithubUrl] = createSignal(getGithubSnapshotUrl());
  const [busy, setBusy] = createSignal(false);

  createEffect(() => {
    const loaded = config();
    if (!loaded) return;
    setServerUrl(loaded.serverUrl ?? '');
    setSyncMode(loaded.syncMode as LxSyncMode);
  });

  const saveAndConnect = async () => {
    const url = serverUrl().trim() || config()?.serverUrl || '';
    if (!url) return;
    const probe = await probeSyncServer(url);
    if (!probe.ok) {
      showAppToast({ title: '连接失败', description: '无法访问 LX 同步服务', variant: 'destructive' });
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
      showAppToast({ title: '已从 LX Music 拉取歌单' });
    } catch (e) {
      showAppToast({ title: '拉取失败', description: toUserFacingMusicError(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const pushToLx = async () => {
    setBusy(true);
    try {
      await pushLocalPlaylistsToLx(lxSyncListAction);
      showAppToast({ title: '已向 LX Music 推送歌单' });
    } catch (e) {
      showAppToast({ title: '推送失败', description: toUserFacingMusicError(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AudioPanelShell
      open={props.open}
      inline={props.inline}
      hideHeader={props.embedded}
      title="数据同步"
      onClose={props.onClose}
    >
      <div class="space-y-4 p-4">
            <section class="space-y-2 rounded-lg border p-4">
              <div>
                <h3 class="text-sm font-medium">LX Music 同步</h3>
                <p class="mt-1 text-xs text-muted-foreground">
                  连接 LX Sync v4 服务。拉取表示从 LX Music 获取到 Reader；推送方向相反。
                </p>
              </div>
              <label class="block space-y-1">
                <span class="block text-xs font-medium text-muted-foreground">连接后的数据处理方式</span>
              <MusicAppSelect
                value={syncMode()}
                onChange={(v) => setSyncMode(v as LxSyncMode)}
                options={SYNC_MODES.map((m) => m.value)}
                optionLabel={(v) => SYNC_MODES.find((m) => m.value === v)?.label ?? v}
                aria-label="同步模式"
              />
              </label>
              <label class="block space-y-1">
                <span class="block text-xs font-medium text-muted-foreground">同步服务地址</span>
              <AppTextFieldBareInput
                placeholder="http://127.0.0.1:9527"
                value={serverUrl() || config()?.serverUrl || ''}
                onInput={(e) => setServerUrl(e.currentTarget.value)}
              />
              </label>
              <label class="block space-y-1">
                <span class="block text-xs font-medium text-muted-foreground">连接密码（如服务已设置）</span>
              <AppTextFieldBareInput
                type="password"
                value={password()}
                onInput={(e) => setPassword(e.currentTarget.value)}
              />
              </label>
              <div class="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void saveAndConnect()}>
                  连接
                </Button>
                <Button size="sm" variant="outline" onClick={() => disconnectLxSyncClient()}>
                  断开
                </Button>
                <Button size="sm" variant="outline" disabled={busy()} onClick={() => void pullFromLx()}>
                  从 LX Music 拉取
                </Button>
                <Button size="sm" variant="outline" disabled={busy()} onClick={() => void pushToLx()}>
                  推送到 LX Music
                </Button>
              </div>
              <p class="text-xs text-muted-foreground">
                连接状态：{config()?.connected ? '已连接（v4 协议）' : '未连接'}
              </p>
            </section>
            <section class="space-y-2 rounded-lg border border-dashed p-4">
              <div>
                <h3 class="text-sm font-medium">WebDAV 与 JSON 快照</h3>
                <p class="mt-1 text-xs text-muted-foreground">
                  这些格式用于曲库快照，不等同于 LX Sync 实时协议。
                </p>
              </div>
              <input
                type="file"
                accept=".json"
                title="选择 Reader 音乐曲库快照"
                aria-label="导入 Reader 音乐曲库快照"
                class="text-sm"
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
                      showAppToast({ title: '上传失败', description: toUserFacingMusicError(e), variant: 'destructive' }),
                    )
                  }
                >
                  推送快照到 WebDAV
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void syncAudioLibraryViaWebDav('merge').then(() =>
                      showAppToast({ title: 'WebDAV 同步完成' }),
                    ).catch((e) =>
                      showAppToast({ title: '同步失败', description: toUserFacingMusicError(e), variant: 'destructive' }),
                    )
                  }
                >
                  从 WebDAV 拉取并合并
                </Button>
              </div>
            </section>
            <section class="space-y-2 rounded-lg border border-dashed p-4">
              <div>
                <h3 class="text-sm font-medium">GitHub 快照</h3>
                <p class="mt-1 text-xs text-muted-foreground">配置可读写的快照地址后使用。</p>
              </div>
              <AppTextFieldBareInput
                aria-label="GitHub 快照地址"
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
                      showAppToast({ title: '上传失败', description: toUserFacingMusicError(e), variant: 'destructive' }),
                    )
                  }
                >
                  推送快照到 GitHub
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void syncAudioLibraryViaGithub('merge').then(() =>
                      showAppToast({ title: 'GitHub 同步完成' }),
                    ).catch((e) =>
                      showAppToast({ title: '同步失败', description: toUserFacingMusicError(e), variant: 'destructive' }),
                    )
                  }
                >
                  从 GitHub 拉取并合并
                </Button>
              </div>
            </section>
          </div>
    </AudioPanelShell>
  );
};
