/**
 * 书籍目录选择对话框
 * 首次导入本地书籍时提示用户选择书籍存储目录
 */

import { createSignal, createEffect } from 'solid-js';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getAppDataDir } from '@/lib/platform/app-data-dir';
import { isTauri } from '@/lib/platform/detect';
import { settingsStore } from '@/stores/settings';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { join } from '@tauri-apps/api/path';

export interface BookDirectoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultPath?: string;
}

/**
 * 获取默认书籍目录路径
 */
async function getDefaultBooksPath(): Promise<string> {
  if (!isTauri()) {
    return 'Books';
  }
  
  try {
    const appDir = await getAppDataDir();
    return await join(appDir, 'Books');
  } catch (error) {
    console.error('获取默认书籍目录失败:', error);
    return 'Books';
  }
}

export function BookDirectoryDialog(props: BookDirectoryDialogProps) {
  const [defaultPath, setDefaultPath] = createSignal<string>('');

  // 加载默认路径
  createEffect(async () => {
    if (props.open && !defaultPath()) {
      const path = props.defaultPath || await getDefaultBooksPath();
      setDefaultPath(path);
    }
  });

  const handleModify = async () => {
    if (!isTauri()) {
      props.onOpenChange(false);
      return;
    }

    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        defaultPath: defaultPath(),
      });

      if (selected && typeof selected === 'string') {
        await settingsStore.setBooksDirectory(selected);
        props.onOpenChange(false);
      }
    } catch (error) {
      console.error('选择目录失败:', error);
    }
  };

  const handleLater = async () => {
    // 使用默认路径
    if (defaultPath()) {
      await settingsStore.setBooksDirectory(defaultPath());
    }
    props.onOpenChange(false);
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class="max-w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>选择保存书籍的文件夹</DialogTitle>
          <DialogDescription class="pt-2">
            <p class="mb-2">
              由于存在访问权限问题，需要指定一个目录来实现书籍的拷贝、下载等功能，如不指定，则将无法正常使用本地书籍、WebDev等功能。
            </p>
            <p class="mt-2">
              程序默认使用 <code class="px-1 py-0.5 bg-muted rounded text-sm">{defaultPath() || '加载中...'}</code>，可以点击下方按钮修改或稍后前往设置页面进行修改。
            </p>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter class="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleLater}
            class="w-full sm:w-auto"
          >
            稍后处理
          </Button>
          <Button
            variant="default"
            onClick={handleModify}
            class="w-full sm:w-auto"
          >
            立即修改
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
