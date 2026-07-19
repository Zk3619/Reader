/**
 * 新建用户列表：输入编号（插入位置）与列表名
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
} from '@/components/viewer/viewer-app-overlay';
import {
  createPlaylist,
  listUserMusicPlaylists,
} from '@/lib/database/audio-library';
import { getMusicGroups } from '@/lib/database/media-groups';
import { setActiveMusicGroupId } from '@/stores/viewer/media/audio';
import { showAppToast } from '@/components/shared/AppToasts';
import { toUserFacingMusicError } from '@/lib/media/audio/music-user-error';
import { MediaGroupId } from '@/types/book-group';

export interface MusicListCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

export const MusicListCreateDialog: Component<MusicListCreateDialogProps> = (props) => {
  const [name, setName] = createSignal('');
  const [position, setPosition] = createSignal('0');
  const [maxPos, setMaxPos] = createSignal(0);
  const [busy, setBusy] = createSignal(false);

  createEffect(() => {
    if (!props.open) return;
    void listUserMusicPlaylists().then((list) => {
      setMaxPos(list.length);
      setPosition(String(list.length));
      setName('');
    });
  });

  const submit = async () => {
    const listName = name().trim();
    if (!listName) {
      showAppToast({ title: '请输入列表名', variant: 'warning' });
      return;
    }
    const pos = Number.parseInt(position(), 10);
    if (!Number.isFinite(pos) || pos < 0 || pos > maxPos()) {
      showAppToast({
        title: `编号需为 0–${maxPos()} 的整数`,
        variant: 'warning',
      });
      return;
    }
    setBusy(true);
    try {
      const id = `pl_${Date.now()}`;
      await createPlaylist(id, listName, 'local', { position: pos });
      const groups = await getMusicGroups();
      setActiveMusicGroupId(
        groups.find((g) => g.listId === id)?.groupId ?? MediaGroupId.MusicLocal,
        id,
      );
      showAppToast({ title: '列表已创建', variant: 'success' });
      props.onCreated?.();
      props.onOpenChange(false);
    } catch (e) {
      showAppToast({ title: '创建失败', description: toUserFacingMusicError(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ViewerAppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <ViewerAppDialogContent layout="plain" class="max-w-sm">
        <ViewerAppDialogHeader>
          <ViewerAppDialogTitle>新建列表</ViewerAppDialogTitle>
          <ViewerAppDialogDescription>
            编号决定列表在侧栏中的位置（0 为最前，最大 {maxPos()} 为末尾）。
          </ViewerAppDialogDescription>
        </ViewerAppDialogHeader>
        <div class="space-y-3">
          <AppTextField>
            <AppTextFieldLabel>编号</AppTextFieldLabel>
            <AppTextFieldInput
              type="number"
              min={0}
              max={maxPos()}
              value={position()}
              onInput={(e) => setPosition(e.currentTarget.value)}
            />
          </AppTextField>
          <AppTextField>
            <AppTextFieldLabel>列表名</AppTextFieldLabel>
            <AppTextFieldInput
              placeholder="你想起什么名…"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              onKeyDown={(e: KeyboardEvent) => {
                if (e.key === 'Enter') void submit();
              }}
            />
          </AppTextField>
        </div>
        <ViewerAppDialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button disabled={busy()} onClick={() => void submit()}>
            {busy() ? '创建中…' : '创建'}
          </Button>
        </ViewerAppDialogFooter>
      </ViewerAppDialogContent>
    </ViewerAppDialog>
  );
};
