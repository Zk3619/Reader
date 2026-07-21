import { appDialogScrollBodySpaceY4 } from '@/lib/ui/viewport-classes';
/**
 * 导入操作选择对话框
 * 本地书籍 / 音频 / 视频导入时选择复制、移动或无动作
 */

import { createSignal, createEffect, createResource, Show } from 'solid-js';
import {
  AppDialogScrollBody,
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem, RadioGroupItemLabel } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { settingsStore } from '@/stores/settings';
import { isTauri } from '@/lib/platform/detect';
import { usesDirectoryHandleBooksRoot } from '@/lib/platform/fs/managed-storage';
import {
  usesDirectoryHandleLocalRoot,
  type LocalLibraryModule,
} from '@/lib/platform/fs/managed-local-library';
import type { ImportBookAction } from '@/lib/local-book/import';
import {
  persistImportMediaAction,
  type ImportMediaAction,
} from '@/lib/media/local-media-import';

export type ImportAction = ImportBookAction;

export type ImportActionMediaKind = 'book' | LocalLibraryModule;

export interface ImportActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (action: ImportAction, remember: boolean) => void;
  /** 默认 book，兼容书架导入 */
  mediaKind?: ImportActionMediaKind;
}

const KIND_COPY: Record<
  ImportActionMediaKind,
  { title: string; item: string; library: string; defaultAction: () => ImportAction }
> = {
  book: {
    title: '选择书籍存放方式',
    item: '书籍',
    library: '书籍库',
    defaultAction: () => settingsStore.state.app.importBookAction || 'copy',
  },
  music: {
    title: '选择音频存放方式',
    item: '音频',
    library: '本地音频库',
    defaultAction: () => settingsStore.state.app.importAudioAction || 'copy',
  },
  video: {
    title: '选择视频存放方式',
    item: '视频',
    library: '本地视频库',
    defaultAction: () => settingsStore.state.app.importVideoAction || 'copy',
  },
};

function defaultRemember(kind: ImportActionMediaKind): boolean {
  if (kind === 'book') return settingsStore.state.app.rememberImportAction || false;
  if (kind === 'music') return settingsStore.state.app.rememberImportAudioAction || false;
  return settingsStore.state.app.rememberImportVideoAction || false;
}

export function ImportActionDialog(props: ImportActionDialogProps) {
  const kind = () => props.mediaKind ?? 'book';
  const copy = () => KIND_COPY[kind()];

  const [webUsesUserFolder] = createResource(
    () => (props.open && !isTauri() ? kind() : null),
    async (mediaKind) => {
      if (!mediaKind) return false;
      if (mediaKind === 'book') return usesDirectoryHandleBooksRoot();
      return usesDirectoryHandleLocalRoot(mediaKind);
    },
  );

  const [action, setAction] = createSignal<ImportAction>(copy().defaultAction());
  const [remember, setRemember] = createSignal(defaultRemember(kind()));

  createEffect(() => {
    if (props.open) {
      void kind();
      setAction(copy().defaultAction());
      setRemember(defaultRemember(kind()));
    }
  });

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setAction(copy().defaultAction());
      setRemember(defaultRemember(kind()));
    }
    props.onOpenChange(open);
  };

  const handleConfirm = () => {
    const next = action();
    const rememberChoice = remember();
    props.onConfirm(next, rememberChoice);
    if (kind() === 'book') {
      void settingsStore.setImportBookAction(next, rememberChoice);
    } else {
      void persistImportMediaAction(kind() as LocalLibraryModule, next as ImportMediaAction, rememberChoice);
    }
    props.onOpenChange(false);
  };

  return (
    <AppDialog open={props.open} onOpenChange={handleOpenChange}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>{copy().title}</AppDialogTitle>
          <AppDialogDescription>
            <Show
              when={webUsesUserFolder()}
              fallback={
                <>
                  请选择导入{copy().item}时的操作方式。选「无动作」时将直接引用所选文件，不复制到
                  {copy().library}目录。
                </>
              }
            >
              可将{copy().item}写入指定文件夹，或仅登记原文件位置（无动作）。浏览器无法移动磁盘上的原文件；选「移动」表示写入
              {copy().library}后释放本次选择的文件句柄。
            </Show>
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogScrollBody class={appDialogScrollBodySpaceY4}>
          <RadioGroup value={action()} onChange={(value) => setAction(value as ImportAction)}>
            <RadioGroupItem value="copy" class="py-2">
              <RadioGroupItemLabel class="flex-1 cursor-pointer">
                <div>
                  <div class="font-medium">复制</div>
                  <div class="text-sm text-muted-foreground">
                    将{copy().item}文件复制到{copy().library}目录，保留原文件
                  </div>
                </div>
              </RadioGroupItemLabel>
            </RadioGroupItem>
            <RadioGroupItem value="move" class="py-2">
              <RadioGroupItemLabel class="flex-1 cursor-pointer">
                <div>
                  <div class="font-medium">移动</div>
                  <div class="text-sm text-muted-foreground">
                    {isTauri()
                      ? `将${copy().item}文件移动到${copy().library}目录，删除原文件`
                      : `将${copy().item}写入${copy().library}目录，并释放本次选择的文件句柄`}
                  </div>
                </div>
              </RadioGroupItemLabel>
            </RadioGroupItem>
            <RadioGroupItem value="none" class="py-2">
              <RadioGroupItemLabel class="flex-1 cursor-pointer">
                <div>
                  <div class="font-medium">无动作</div>
                  <div class="text-sm text-muted-foreground">
                    不写入{copy().library}目录，直接引用当前文件位置（移动或删除原文件后可能无法使用）
                  </div>
                </div>
              </RadioGroupItemLabel>
            </RadioGroupItem>
          </RadioGroup>
          <div class="flex items-center space-x-2">
            <Checkbox
              id={`remember-action-${kind()}`}
              checked={remember()}
              onChange={(checked) => setRemember(checked)}
            />
            <Label for={`remember-action-${kind()}`} class="cursor-pointer text-sm">
              <div>
                <div class="font-medium">记住我的选择</div>
                <div class="text-xs text-muted-foreground">
                  {kind() === 'book'
                    ? '可在「阅读设置」或「主设置 → 存储 → 记住的选择」中修改。'
                    : kind() === 'music'
                      ? '可在「音乐设置 → 下载」或「主设置 → 存储 → 记住的选择」中修改。'
                      : '可在「影视设置」或「主设置 → 存储 → 记住的选择」中修改。'}
                </div>
              </div>
            </Label>
          </div>
        </AppDialogScrollBody>
        <AppDialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button variant="default" onClick={handleConfirm}>
            确定
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
