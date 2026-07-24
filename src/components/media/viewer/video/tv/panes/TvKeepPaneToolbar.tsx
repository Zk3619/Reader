/**
 * 影视收藏页操作区：可展开搜索 / 刷新 / 更多（布局、添加、导入导出、搜索偏好）
 */

import { For, Show, createSignal, onCleanup, onMount } from 'solid-js';
import { blurActiveElement } from '@/utils/accessibility';
import { Button } from '@/components/ui/button';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuIconTrigger,
  AppDropdownMenuItem,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import {
  ExportIcon,
  FolderPlusIcon,
  FolderTreeIcon,
  GlobeIcon,
  ImportIcon,
  LayoutIcon,
  LinkIcon,
  MoreIcon,
  RefreshIcon,
  Settings2Icon,
  TrashIcon,
} from '@/components/shared/icons';
import { ExpandableIconSearch } from '@/components/shared/ExpandableIconSearch';
import { TvKeepLayoutDialog } from '@/components/media/viewer/video/tv/hub/TvKeepLayoutDialog';
import { TvKeepGroupFormDialog } from '@/components/media/viewer/video/tv/hub/TvKeepGroupFormDialog';
import { TvKeepExportDialog } from '@/components/media/viewer/video/tv/hub/TvKeepExportDialog';
import { TvKeepImportDialog } from '@/components/media/viewer/video/tv/hub/TvKeepImportDialog';
import { TvKeepAddByUrlDialog } from '@/components/media/viewer/video/tv/hub/TvKeepAddByUrlDialog';
import { TvKeepRemoteDialog } from '@/components/media/viewer/video/tv/hub/TvKeepRemoteDialog';
import {
  getTvKeepUi,
  setTvKeepMatchMode,
  type TvKeepMatchMode,
} from '@/stores/tv-hub/tv-keep-ui';
import * as TvDao from '@/lib/media/tv/db/tv-dao';
import { addLocalKeepFromPath } from '@/lib/media/tv/tv-keep-export';
import type { TvKeepRow } from '@/lib/media/tv/types';
import { showAppToast } from '@/components/shared/AppToasts';
import { pickFiles } from '@/lib/platform/fs/pick-file';
import { isUserCancelled } from '@/lib/platform/fs/errors';
import { formatStorageRef } from '@/lib/platform/fs/storage-ref';
import { ImportActionDialog } from '@/components/media/reader/books/ImportActionDialog';
import {
  materializeFileToLocalLibrary,
  resolveImportMediaActionOrPrompt,
  type ImportMediaAction,
} from '@/lib/media/local-media-import';
import { cn } from '@/lib/utils';
import { readBytes } from '@/lib/platform/fs/read-write';

function MenuRadioIndicator(props: { selected: boolean }) {
  return (
    <span
      class="flex h-4 w-4 shrink-0 items-center justify-center pointer-events-none"
      aria-label={props.selected ? '已选' : '未选'}
    >
      <span class="relative flex size-4 items-center justify-center" aria-hidden>
        <span class="size-4 rounded-full border border-primary" />
        <Show when={props.selected}>
          <span class="absolute size-2 rounded-full bg-primary" />
        </Show>
      </span>
    </span>
  );
}

const MATCH_OPTIONS: Array<{ value: TvKeepMatchMode; label: string }> = [
  { value: 'exact', label: '精确搜索' },
  { value: 'fuzzy', label: '模糊搜索' },
];

export interface TvKeepPaneToolbarProps {
  loading?: boolean;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  onRefresh: () => void;
  onClear: () => void;
  canClear?: boolean;
  exportRows: () => TvKeepRow[];
  onOpenGroupManage: () => void;
  onOpenKeepManage: () => void;
  onGroupCreated?: () => void;
  onLibraryChanged?: () => void;
}

export function TvKeepPaneToolbar(props: TvKeepPaneToolbarProps) {
  const ui = getTvKeepUi;
  const [moreOpen, setMoreOpen] = createSignal(false);
  const [layoutOpen, setLayoutOpen] = createSignal(false);
  const [createGroupOpen, setCreateGroupOpen] = createSignal(false);
  const [exportOpen, setExportOpen] = createSignal(false);
  const [importOpen, setImportOpen] = createSignal(false);
  const [addUrlOpen, setAddUrlOpen] = createSignal(false);
  const [remoteOpen, setRemoteOpen] = createSignal(false);
  const [actionDialogOpen, setActionDialogOpen] = createSignal(false);
  let pendingActionResolve: ((action: ImportMediaAction | null) => void) | null = null;

  onMount(() => {
    const handleDialogOpened = () => {
      setMoreOpen(false);
      blurActiveElement();
    };
    window.addEventListener('dialog-opened', handleDialogOpened);
    onCleanup(() => window.removeEventListener('dialog-opened', handleDialogOpened));
  });

  const promptImportAction = async (): Promise<ImportMediaAction | null> => {
    const resolved = await resolveImportMediaActionOrPrompt('video');
    if (resolved !== 'prompt') return resolved;
    return new Promise((resolve) => {
      pendingActionResolve = resolve;
      setActionDialogOpen(true);
    });
  };

  const handleActionConfirm = (action: ImportMediaAction) => {
    pendingActionResolve?.(action);
    pendingActionResolve = null;
    setActionDialogOpen(false);
  };

  const handleActionDialogOpenChange = (open: boolean) => {
    setActionDialogOpen(open);
    if (!open && pendingActionResolve) {
      pendingActionResolve(null);
      pendingActionResolve = null;
    }
  };

  const handleAddLocal = async () => {
    try {
      const action = await promptImportAction();
      if (!action) return;

      const files = await pickFiles({
        multiple: true,
        filters: [
          {
            name: 'Video',
            extensions: ['mp4', 'mkv', 'webm', 'avi', 'mov', 'm3u8'],
          },
        ],
      });
      let n = 0;
      for (const f of files) {
        const sourceRef = formatStorageRef(f.ref);
        let storagePath = sourceRef;
        if (action !== 'none') {
          const content =
            f.bytes ??
            (f.ref.kind === 'path' ||
            f.ref.kind === 'uri' ||
            f.ref.kind === 'handle' ||
            f.ref.kind === 'opfs' ||
            f.ref.kind === 'dir-handle'
              ? await readBytes(f.ref)
              : undefined);
          const target = await materializeFileToLocalLibrary('video', sourceRef, action, {
            fileName: f.fileName,
            content,
          });
          if (
            target.startsWith('opfs:') ||
            target.startsWith('handle:') ||
            target.startsWith('uri:') ||
            target.startsWith('saf-tree:') ||
            target.startsWith('virtual:')
          ) {
            storagePath = target;
          } else if (target.startsWith('content://')) {
            storagePath = formatStorageRef({ kind: 'uri', value: target });
          } else {
            storagePath = formatStorageRef({ kind: 'path', value: target });
          }
        }
        const name = f.fileName?.replace(/\.[^.]+$/, '') || undefined;
        await addLocalKeepFromPath(storagePath, name);
        n += 1;
      }
      void showAppToast({
        title: '已添加本地',
        description: `${n} 部`,
        variant: 'success',
      });
      props.onLibraryChanged?.();
    } catch (e) {
      if (isUserCancelled(e)) return;
      void showAppToast({
        title: '添加失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    }
  };

  return (
    <>
      <ExpandableIconSearch
        value={props.searchQuery}
        onValueChange={props.onSearchQueryChange}
        placeholder="搜索当前分组"
        tooltip="搜索当前分组"
        aria-label="搜索当前分组影视"
      />

      <AppTooltip>
        <AppTooltipTrigger
          as={Button}
          variant="ghost"
          size="icon"
          class="h-9 w-9 shrink-0"
          disabled={props.loading}
          onClick={() => props.onRefresh()}
        >
          <RefreshIcon class={cn('h-4 w-4', props.loading && 'animate-spin')} />
          <span class="sr-only">刷新</span>
        </AppTooltipTrigger>
        <AppTooltipContent>刷新收藏</AppTooltipContent>
      </AppTooltip>

      <AppDropdownMenu open={moreOpen()} onOpenChange={setMoreOpen}>
        <AppTooltip>
          <AppTooltipTrigger as="div">
            <AppDropdownMenuTrigger
              as={(triggerProps: Record<string, unknown>) => (
                <AppDropdownMenuIconTrigger triggerProps={triggerProps}>
                  <MoreIcon class="h-4 w-4" />
                  <span class="sr-only">更多</span>
                </AppDropdownMenuIconTrigger>
              )}
            />
          </AppTooltipTrigger>
          <AppTooltipContent>更多</AppTooltipContent>
        </AppTooltip>
        <AppDropdownMenuContent layout="compact" scrollGutter="both">
          <AppDropdownMenuItem onSelect={() => void handleAddLocal()}>
            <FolderPlusIcon class="h-4 w-4" />
            <span>添加本地</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem onSelect={() => setRemoteOpen(true)}>
            <GlobeIcon class="h-4 w-4" />
            <span>远程影视</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem onSelect={() => setAddUrlOpen(true)}>
            <LinkIcon class="h-4 w-4" />
            <span>添加网址</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuSeparator />
          <AppDropdownMenuItem onSelect={() => props.onOpenKeepManage()}>
            <Settings2Icon class="h-4 w-4" />
            <span>收藏管理</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem onSelect={() => setLayoutOpen(true)}>
            <LayoutIcon class="h-4 w-4" />
            <span>收藏布局</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem onSelect={() => setCreateGroupOpen(true)}>
            <FolderPlusIcon class="h-4 w-4" />
            <span>新建分组</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem onSelect={() => props.onOpenGroupManage()}>
            <FolderTreeIcon class="h-4 w-4" />
            <span>分组管理</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuSeparator />
          <AppDropdownMenuItem
            disabled={!props.exportRows().length}
            onSelect={() => setExportOpen(true)}
          >
            <ExportIcon class="h-4 w-4" />
            <span>导出片单</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem onSelect={() => setImportOpen(true)}>
            <ImportIcon class="h-4 w-4" />
            <span>导入片单</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuSeparator />
          <AppDropdownMenuItem class="pointer-events-none text-xs text-muted-foreground">
            搜索偏好
          </AppDropdownMenuItem>
          <For each={MATCH_OPTIONS}>
            {(opt) => (
              <AppDropdownMenuItem
                onSelect={() => setTvKeepMatchMode(opt.value)}
                class="flex items-center gap-2"
              >
                <MenuRadioIndicator selected={ui().matchMode === opt.value} />
                <span>{opt.label}</span>
              </AppDropdownMenuItem>
            )}
          </For>
          <AppDropdownMenuSeparator />
          <AppDropdownMenuItem
            disabled={props.canClear === false}
            class="text-destructive focus:text-destructive"
            onSelect={() => props.onClear()}
          >
            <TrashIcon class="h-4 w-4" />
            <span>清空收藏</span>
          </AppDropdownMenuItem>
        </AppDropdownMenuContent>
      </AppDropdownMenu>

      <TvKeepLayoutDialog open={layoutOpen()} onOpenChange={setLayoutOpen} />
      <TvKeepGroupFormDialog
        open={createGroupOpen()}
        onOpenChange={setCreateGroupOpen}
        onSubmit={async ({ groupName }) => {
          await TvDao.insertVideoGroup({ groupName });
          props.onGroupCreated?.();
          void showAppToast({
            title: '已创建分组',
            description: groupName,
            variant: 'success',
          });
        }}
      />
      <TvKeepExportDialog
        open={exportOpen()}
        onOpenChange={setExportOpen}
        rows={props.exportRows}
      />
      <TvKeepImportDialog
        open={importOpen()}
        onOpenChange={setImportOpen}
        onDone={() => props.onLibraryChanged?.()}
      />
      <TvKeepAddByUrlDialog
        open={addUrlOpen()}
        onOpenChange={setAddUrlOpen}
        onDone={() => props.onLibraryChanged?.()}
      />
      <TvKeepRemoteDialog
        open={remoteOpen()}
        onOpenChange={setRemoteOpen}
        onDone={() => props.onLibraryChanged?.()}
      />
      <ImportActionDialog
        open={actionDialogOpen()}
        onOpenChange={handleActionDialogOpenChange}
        mediaKind="video"
        onConfirm={(action) => handleActionConfirm(action)}
      />
    </>
  );
}
