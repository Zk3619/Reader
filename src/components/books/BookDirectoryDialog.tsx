/**
 * 书籍目录选择对话框
 * 首次导入本地书籍时提示用户选择书籍存储目录
 */

import { createSignal, createEffect, Show } from 'solid-js';
import {
  AppDialog,
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { Button } from '@/components/ui/button';
import { showAppToast } from '@/components/shared/AppToasts';
import { pickDirectory } from '@/lib/platform/fs/pick-directory';
import {
  applyDefaultBooksStorageRoot,
  resolveBooksDirectoryPath,
} from '@/lib/platform/fs/managed-storage';
import { FsUnsupportedError, isUserCancelled } from '@/lib/platform/fs/errors';
import { refDisplayLabel } from '@/lib/platform/fs/storage-ref';
import { isTauri } from '@/lib/platform/detect';
import { resolveFsPlatform } from '@/lib/platform/fs/capabilities';

export interface BookDirectoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultPath?: string;
  /** 跳转设置页修改书籍目录（与文案「前往设置页面」一致） */
  onOpenSettings?: () => void;
}

export function BookDirectoryDialog(props: BookDirectoryDialogProps) {
  const [defaultPath, setDefaultPath] = createSignal<string>('');
  const [picking, setPicking] = createSignal(false);

  createEffect(async () => {
    if (props.open && !defaultPath()) {
      const path = props.defaultPath || (await resolveBooksDirectoryPath());
      setDefaultPath(path);
    }
  });

  const handleModify = async () => {
    if (picking()) return;
    setPicking(true);
    try {
      const result = await pickDirectory({ forBooksStorage: true });
      showAppToast({
        title: '书籍目录已设置',
        description: refDisplayLabel(result.ref),
        variant: 'default',
      });
      props.onOpenChange(false);
    } catch (e) {
      if (isUserCancelled(e)) return;
      if (e instanceof FsUnsupportedError) {
        const platform = resolveFsPlatform();
        showAppToast({
          title: '无法选择目录',
          description:
            platform === 'android'
              ? '请尝试更新 WebView，或在设置中使用默认书籍目录。'
              : e.message,
          variant: 'destructive',
        });
        return;
      }
      console.error('选择目录失败:', e);
      showAppToast({
        title: '选择目录失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setPicking(false);
    }
  };

  const handleLater = async () => {
    await applyDefaultBooksStorageRoot();
    props.onOpenChange(false);
  };

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>选择保存书籍的目录</AppDialogTitle>
        </AppDialogHeader>
        <div class="space-y-2 px-4">
          <p>
            由于存在访问权限问题，需要指定一个目录来实现书籍的拷贝、下载等功能，如不指定，则将无法正常使用本地书籍、WebDev等功能。
          </p>
          <p>
            程序默认使用{' '}
            <code class="px-1 py-0.5 bg-muted rounded text-sm">
              {defaultPath() || '加载中...'}
            </code>
            ，可以点击下方按钮修改或稍后前往设置页面进行修改。
          </p>
          {!isTauri() && (
            <p class="text-sm text-muted-foreground">
              浏览器环境将使用内置存储或文件夹访问 API。
            </p>
          )}
        </div>
        <AppDialogFooter class="flex-wrap gap-2 sm:justify-between">
          <Show when={props.onOpenSettings}>
            <Button
              variant="link"
              class="px-0 sm:mr-auto"
              onClick={() => {
                props.onOpenChange(false);
                props.onOpenSettings?.();
              }}
            >
              前往设置
            </Button>
          </Show>
          <div class="flex flex-wrap gap-2 sm:ml-auto">
            <Button variant="outline" disabled={picking()} onClick={() => void handleLater()}>
              稍后处理
            </Button>
            <Button
              variant="default"
              disabled={picking()}
              onClick={() => void handleModify()}
            >
              {picking() ? '正在打开…' : '立即修改'}
            </Button>
          </div>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
