/**
 * 将当前系统列表（播放列表 / 试听列表 / 最近播放）另存为用户列表
 */

import { createEffect, createSignal, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  AppTextField,
  AppTextFieldInput,
  AppTextFieldLabel,
} from '@/components/shared/AppTextField';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogDescription,
  ViewerAppDialogFooter,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
} from '@/components/media/viewer/viewer-app-overlay';
import {
  addTracksToPlaylist,
  createPlaylist,
  getTracksForGroupId,
  listUserMusicPlaylists,
} from '@/lib/database/audio-library';
import { getMusicGroups } from '@/lib/database/media-groups';
import { setActiveMusicGroupId } from '@/stores/viewer/media/audio';
import { showAppToast } from '@/components/shared/AppToasts';
import { toUserFacingMusicError } from '@/lib/media/audio/music-user-error';
import { MediaGroupId } from '@/types/book-group';

export interface MusicListSaveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 要保存的列表分组 ID */
  sourceGroupId: number | null;
  /** 默认列表名建议 */
  suggestedName?: string;
  onSaved?: () => void;
}

export const MusicListSaveDialog: Component<MusicListSaveDialogProps> = (props) => {
  const [name, setName] = createSignal('');
  const [busy, setBusy] = createSignal(false);

  createEffect(() => {
    if (!props.open) return;
    setName(props.suggestedName?.trim() || '');
  });

  const submit = async () => {
    const listName = name().trim();
    const groupId = props.sourceGroupId;
    if (!listName) {
      showAppToast({ title: '请输入列表名', variant: 'warning' });
      return;
    }
    if (groupId == null) {
      showAppToast({ title: '未选择要保存的列表', variant: 'warning' });
      return;
    }
    setBusy(true);
    try {
      const tracks = await getTracksForGroupId(groupId);
      if (tracks.length === 0) {
        showAppToast({ title: '当前列表暂无曲目', variant: 'warning' });
        return;
      }
      const users = await listUserMusicPlaylists();
      const id = `pl_${Date.now()}`;
      await createPlaylist(id, listName, 'local', { position: users.length });
      await addTracksToPlaylist(id, tracks);
      const groups = await getMusicGroups();
      setActiveMusicGroupId(
        groups.find((g) => g.listId === id)?.groupId ?? MediaGroupId.MusicLocal,
        id,
      );
      showAppToast({
        title: '列表已保存',
        description: `已保存 ${tracks.length} 首到「${listName}」`,
        variant: 'success',
      });
      props.onSaved?.();
      props.onOpenChange(false);
    } catch (e) {
      showAppToast({ title: '保存失败', description: toUserFacingMusicError(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ViewerAppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <ViewerAppDialogContent layout="plain" class="max-w-sm">
        <ViewerAppDialogHeader>
          <ViewerAppDialogTitle>保存列表</ViewerAppDialogTitle>
          <ViewerAppDialogDescription>
            将当前列表曲目复制为一份独立的用户列表。
          </ViewerAppDialogDescription>
        </ViewerAppDialogHeader>
        <AppTextField>
          <AppTextFieldLabel>列表名</AppTextFieldLabel>
          <AppTextFieldInput
            placeholder="输入新列表名称…"
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === 'Enter') void submit();
            }}
          />
        </AppTextField>
        <ViewerAppDialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button disabled={busy()} onClick={() => void submit()}>
            {busy() ? '保存中…' : '保存'}
          </Button>
        </ViewerAppDialogFooter>
      </ViewerAppDialogContent>
    </ViewerAppDialog>
  );
};
