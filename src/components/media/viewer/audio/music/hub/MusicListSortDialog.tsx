/**
 * 列表排序对话框（对齐 lx ListSortModal）
 */

import { createEffect, createSignal, For, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem, RadioGroupItemLabel } from '@/components/ui/radio-group';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogDescription,
  ViewerAppDialogFooter,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
} from '@/components/media/viewer/viewer-app-overlay';
import {
  sortPlaylistTracks,
  type PlaylistSortField,
  type PlaylistSortType,
} from '@/lib/media/audio/list/playlist-share';
import { showAppToast } from '@/components/shared/AppToasts';
import { toUserFacingMusicError } from '@/lib/media/audio/music-user-error';

export interface MusicListSortDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listId: string;
  listName: string;
  onSorted?: () => void;
}

const FIELDS: Array<{ id: PlaylistSortField; label: string }> = [
  { id: 'name', label: '歌曲名' },
  { id: 'artist', label: '歌手名' },
  { id: 'album', label: '专辑名' },
  { id: 'duration', label: '时长' },
  { id: 'source', label: '音源' },
];

const TYPES: Array<{ id: PlaylistSortType; label: string }> = [
  { id: 'up', label: '升序' },
  { id: 'down', label: '降序' },
  { id: 'random', label: '随机' },
];

export const MusicListSortDialog: Component<MusicListSortDialogProps> = (props) => {
  const [field, setField] = createSignal<PlaylistSortField | ''>('');
  const [type, setType] = createSignal<PlaylistSortType | ''>('');
  const [busy, setBusy] = createSignal(false);

  createEffect(() => {
    if (!props.open) return;
    setField('');
    setType('');
    setBusy(false);
  });

  const canConfirm = () => {
    const t = type();
    if (!t) return false;
    if (t === 'random') return true;
    return Boolean(field());
  };

  const submit = async () => {
    const t = type();
    if (!t || !canConfirm()) return;
    setBusy(true);
    try {
      const count = await sortPlaylistTracks(props.listId, t, field());
      showAppToast({ title: `已排序 ${count} 首`, variant: 'success' });
      props.onSorted?.();
      props.onOpenChange(false);
    } catch (e) {
      showAppToast({
        title: '排序失败',
        description: toUserFacingMusicError(e),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ViewerAppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <ViewerAppDialogContent layout="app" class="w-[calc(100dvw-2rem)] max-w-sm">
        <ViewerAppDialogHeader>
          <ViewerAppDialogTitle>排序歌曲</ViewerAppDialogTitle>
          <ViewerAppDialogDescription>{props.listName}</ViewerAppDialogDescription>
        </ViewerAppDialogHeader>
        <div class="space-y-4 px-6 pb-2">
          <div class="space-y-2">
            <p class="text-xs font-medium text-muted-foreground">排序字段</p>
            <RadioGroup
              value={field()}
              onChange={(v) => setField(v as PlaylistSortField)}
              disabled={type() === 'random'}
              class="grid grid-cols-2 gap-2"
            >
              <For each={FIELDS}>
                {(item) => (
                  <RadioGroupItem value={item.id} disabled={type() === 'random'}>
                    <RadioGroupItemLabel>{item.label}</RadioGroupItemLabel>
                  </RadioGroupItem>
                )}
              </For>
            </RadioGroup>
          </div>
          <div class="space-y-2">
            <p class="text-xs font-medium text-muted-foreground">排序方式</p>
            <RadioGroup
              value={type()}
              onChange={(v) => setType(v as PlaylistSortType)}
              class="grid grid-cols-2 gap-2"
            >
              <For each={TYPES}>
                {(item) => (
                  <RadioGroupItem value={item.id}>
                    <RadioGroupItemLabel>{item.label}</RadioGroupItemLabel>
                  </RadioGroupItem>
                )}
              </For>
            </RadioGroup>
          </div>
        </div>
        <ViewerAppDialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button disabled={!canConfirm() || busy()} onClick={() => void submit()}>
            {busy() ? '排序中…' : '确定'}
          </Button>
        </ViewerAppDialogFooter>
      </ViewerAppDialogContent>
    </ViewerAppDialog>
  );
};
