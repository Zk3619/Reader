import { For, Show, createEffect, createResource, createSignal, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { AppTextField, AppTextFieldInput } from '@/components/shared/AppTextField';
import { AppDialogScrollBody } from '@/components/shared/AppDialog';
import { showAppToast } from '@/components/shared/AppToasts';
import { toUserFacingMusicError } from '@/lib/media/audio/music-user-error';
import { getMusicSettings } from '@/lib/media/audio/music-settings';
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
  isTrackInPlaylist,
  removeTrackFromPlaylist,
} from '@/lib/database/audio-library';
import { listPlaylistTargets, type PlaylistTarget } from '@/lib/media/audio/music-context-actions';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import { cn } from '@/lib/utils';
import {
  appDialogScrollBodySpaceY3,
  dialogScrollFrameFlex,
} from '@/lib/ui/viewport-classes';

interface DialogTarget extends PlaylistTarget {
  allExist: boolean;
}

export interface MusicAddToListDialogProps {
  open: boolean;
  track?: AudioTrack;
  tracks?: AudioTrack[];
  mode?: 'add' | 'move';
  fromPlaylistId?: string | null;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}

export const MusicAddToListDialog: Component<MusicAddToListDialogProps> = (props) => {
  const [creating, setCreating] = createSignal(false);
  const [newListName, setNewListName] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [selected, setSelected] = createSignal<Set<string>>(new Set());
  const [revision, setRevision] = createSignal(0);
  const mode = () => props.mode ?? 'add';
  const tracks = () => props.tracks ?? (props.track ? [props.track] : []);

  const [targets] = createResource(
    () =>
      props.open
        ? {
          ids: tracks().map((track) => track.id).join('\0'),
          mode: mode(),
          from: props.fromPlaylistId ?? '',
          revision: revision(),
        }
        : null,
    async (): Promise<DialogTarget[]> => {
      const lists = (await listPlaylistTargets()).filter(
        (list) => mode() !== 'move' || list.listId !== props.fromPlaylistId,
      );
      return Promise.all(
        lists.map(async (list) => ({
          ...list,
          allExist:
            tracks().length > 0 &&
            (
              await Promise.all(
                tracks().map((track) => isTrackInPlaylist(list.listId, track.id)),
              )
            ).every(Boolean),
        })),
      );
    },
  );

  createEffect(() => {
    if (!props.open) return;
    setCreating(false);
    setNewListName('');
    setSelected(new Set<string>());
  });

  const toggleTarget = (target: DialogTarget) => {
    if (busy() || (mode() === 'add' && target.allExist)) return;
    if (mode() === 'move') {
      setSelected(new Set([target.listId]));
      return;
    }
    const next = new Set(selected());
    if (next.has(target.listId)) next.delete(target.listId);
    else next.add(target.listId);
    setSelected(next);
  };

  const submit = async () => {
    const targetIds = [...selected()];
    const items = tracks();
    if (targetIds.length === 0 || items.length === 0 || busy()) return;
    setBusy(true);
    try {
      for (const listId of targetIds) {
        await addTracksToPlaylist(listId, items, {
          position: getMusicSettings().listAddPosition,
        });
      }
      if (mode() === 'move' && props.fromPlaylistId) {
        for (const track of items) {
          await removeTrackFromPlaylist(props.fromPlaylistId, track.id);
        }
      }
      showAppToast({
        title:
          mode() === 'move'
            ? `已移动 ${items.length} 首歌曲`
            : `已将 ${items.length} 首歌曲添加到 ${targetIds.length} 个列表`,
        variant: 'success',
      });
      props.onChanged?.();
      props.onOpenChange(false);
    } catch (error) {
      showAppToast({
        title: mode() === 'move' ? '移动失败' : '添加失败',
        description: toUserFacingMusicError(error),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const createAndSelect = async () => {
    const name = newListName().trim();
    if (!name || busy()) return;
    setBusy(true);
    try {
      const id = `pl_${Date.now()}`;
      await createPlaylist(id, name);
      setSelected((current) => new Set([...current, id]));
      setCreating(false);
      setNewListName('');
      setRevision((value) => value + 1);
      props.onChanged?.();
    } catch (error) {
      showAppToast({
        title: '新建列表失败',
        description: toUserFacingMusicError(error),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ViewerAppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <ViewerAppDialogContent
        layout="app"
        class="w-[calc(100dvw-2rem)] max-w-lg"
      >
        <ViewerAppDialogHeader>
          <ViewerAppDialogTitle>{mode() === 'move' ? '移动到...' : '添加到...'}</ViewerAppDialogTitle>
          <ViewerAppDialogDescription>
            已选择 {tracks().length} 首歌曲
            {mode() === 'add' ? '，可同时选择多个列表' : '，请选择一个目标列表'}
          </ViewerAppDialogDescription>
        </ViewerAppDialogHeader>

        <AppDialogScrollBody frameClass={dialogScrollFrameFlex} class={appDialogScrollBodySpaceY3}>
          <Show
            when={!targets.loading}
            fallback={<p class="py-6 text-center text-sm text-muted-foreground">加载中…</p>}
          >
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <For each={targets() ?? []}>
                {(target) => {
                  const disabled = () => mode() === 'add' && target.allExist;
                  const inputId = () => `music-add-target-${target.listId}-input`;
                  return (
                    <div
                      role="button"
                      tabIndex={disabled() || busy() ? -1 : 0}
                      aria-disabled={disabled() || busy() ? 'true' : undefined}
                      class={cn(
                        'flex h-10 min-w-0 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                        selected().has(target.listId)
                          ? 'border-secondary bg-secondary text-secondary-foreground'
                          : 'border-border bg-background hover:bg-muted/40',
                        (disabled() || busy()) && 'cursor-not-allowed opacity-50',
                      )}
                      title={disabled() ? '所选歌曲均已在该列表中' : target.name}
                      onClick={() => toggleTarget(target)}
                      onKeyDown={(event) => {
                        if (disabled() || busy()) return;
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          toggleTarget(target);
                        }
                      }}
                    >
                      <Checkbox
                        id={inputId()}
                        checked={selected().has(target.listId)}
                        class="pointer-events-none shrink-0"
                      />
                      <Label class="sr-only" for={inputId()}>
                        选择 {target.name}
                      </Label>
                      <span class="truncate">{target.name}</span>
                    </div>
                  );
                }}
              </For>

              <Show
                when={creating()}
                fallback={
                  <Button
                    type="button"
                    variant="outline"
                    class="h-10 border-dashed"
                    disabled={busy()}
                    onClick={() => setCreating(true)}
                  >
                    ＋ 新建列表
                  </Button>
                }
              >
                <AppTextField>
                  <AppTextFieldInput
                    autofocus
                    class="h-10 text-center"
                    placeholder="列表名"
                    value={newListName()}
                    disabled={busy()}
                    onInput={(event) => setNewListName(event.currentTarget.value)}
                    onBlur={() => {
                      if (!newListName().trim()) setCreating(false);
                    }}
                    onKeyDown={(event: KeyboardEvent) => {
                      if (event.key === 'Enter') void createAndSelect();
                      if (event.key === 'Escape') setCreating(false);
                    }}
                  />
                </AppTextField>
              </Show>
            </div>
          </Show>
        </AppDialogScrollBody>

        <ViewerAppDialogFooter>
          <Button variant="outline" disabled={busy()} onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button disabled={busy() || selected().size === 0} onClick={() => void submit()}>
            {mode() === 'move' ? '移动' : '添加'}
          </Button>
        </ViewerAppDialogFooter>
      </ViewerAppDialogContent>
    </ViewerAppDialog>
  );
};
