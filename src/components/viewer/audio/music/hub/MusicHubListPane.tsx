/**
 * 列表分区：桌面左右分栏 / 移动全宽曲目 + Drawer 歌单
 */

import { createSignal, Show, type Component } from 'solid-js';
import { Menu, Share2, Copy, Filter } from 'lucide-solid';
import { isMobile } from '@/lib/platform/detect';
import { MusicPlaylistSidebar } from '@/components/viewer/audio/music/hub/MusicPlaylistSidebar';
import { MusicTrackList } from '@/components/viewer/audio/music/hub/MusicTrackList';
import { Button } from '@/components/ui/button';
import { viewerStore } from '@/stores/viewer';
import {
  getPlaylistTracks,
  setPlaylistTracks,
} from '@/lib/database/audio-library';
import { showAppToast } from '@/components/shared/AppToasts';

export interface MusicHubListPaneProps {
  drawerOpen?: boolean;
  onDrawerOpen?: () => void;
  onScanLocal?: () => void;
}

function encodeShareCode(data: unknown): string {
  const json = JSON.stringify(data);
  return btoa(unescape(encodeURIComponent(json)));
}

function decodeShareCode(code: string): unknown {
  const json = decodeURIComponent(escape(atob(code.trim())));
  return JSON.parse(json);
}

export const MusicHubListPane: Component<MusicHubListPaneProps> = (props) => {
  const [importCode, setImportCode] = createSignal('');

  const exportShare = async () => {
    const listId = viewerStore.state.activePlaylistId;
    if (!listId?.startsWith('pl_')) {
      showAppToast({ title: '请选择用户歌单', variant: 'warning' });
      return;
    }
    const tracks = await getPlaylistTracks(listId);
    const code = encodeShareCode({
      v: 1,
      name: listId,
      trackIds: tracks.map((t) => t.id),
      tracks,
    });
    await navigator.clipboard.writeText(code);
    showAppToast({ title: '分享码已复制', variant: 'success' });
  };

  const importShare = async () => {
    const listId = viewerStore.state.activePlaylistId;
    if (!listId?.startsWith('pl_')) {
      showAppToast({ title: '请先选择目标歌单', variant: 'warning' });
      return;
    }
    try {
      const data = decodeShareCode(importCode()) as {
        trackIds?: string[];
        tracks?: Array<{ id: string }>;
      };
      const ids = data.trackIds ?? data.tracks?.map((t) => t.id) ?? [];
      if (ids.length === 0) throw new Error('空列表');
      const existing = await getPlaylistTracks(listId);
      await setPlaylistTracks(listId, [...existing.map((t) => t.id), ...ids]);
      showAppToast({ title: `已导入 ${ids.length} 首`, variant: 'success' });
      setImportCode('');
    } catch {
      showAppToast({ title: '分享码无效', variant: 'destructive' });
    }
  };

  const dedupPlaylist = async () => {
    const listId = viewerStore.state.activePlaylistId;
    if (!listId?.startsWith('pl_')) {
      showAppToast({ title: '请选择用户歌单', variant: 'warning' });
      return;
    }
    const tracks = await getPlaylistTracks(listId);
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const t of tracks) {
      const key = `${t.name}|${t.artist}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(t.id);
    }
    await setPlaylistTracks(listId, unique);
    showAppToast({ title: `去重后 ${unique.length} 首`, variant: 'success' });
  };

  return (
    <div class="flex min-h-0 flex-1 overflow-hidden">
      <Show when={!isMobile()}>
        <MusicPlaylistSidebar />
      </Show>
      <div class="flex min-h-0 min-w-0 flex-1 flex-col">
        <Show when={isMobile()}>
          <div class="flex shrink-0 items-center gap-2 border-b px-3 py-2">
            <Button size="sm" variant="outline" onClick={props.onDrawerOpen}>
              <Menu class="mr-1 h-4 w-4" />
              歌单
            </Button>
          </div>
        </Show>
        <div class="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2 text-sm">
          <Button size="sm" variant="outline" onClick={() => void exportShare()}>
            <Share2 class="mr-1 h-3 w-3" />
            导出分享码
          </Button>
          <Button size="sm" variant="outline" onClick={() => void dedupPlaylist()}>
            <Filter class="mr-1 h-3 w-3" />
            去重
          </Button>
          <input
            class="min-w-0 flex-1 rounded border px-2 py-1 text-xs"
            placeholder="粘贴分享码导入"
            value={importCode()}
            onInput={(e) => setImportCode(e.currentTarget.value)}
          />
          <Button size="sm" variant="outline" onClick={() => void importShare()}>
            <Copy class="mr-1 h-3 w-3" />
            导入
          </Button>
        </div>
        <MusicTrackList onScanLocal={props.onScanLocal} />
      </div>
      <Show when={isMobile() && props.drawerOpen}>
        <div class="fixed inset-0 z-30 flex">
          <div
            class="absolute inset-0 bg-black/40"
            onClick={props.onDrawerOpen}
            role="presentation"
          />
          <MusicPlaylistSidebar
            class="relative z-10 h-full w-56 bg-background shadow-lg"
          />
        </div>
      </Show>
    </div>
  );
};
