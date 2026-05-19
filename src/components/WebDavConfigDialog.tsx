/**
 * WebDav 配置对话框
 * 用于配置 WebDav 服务器信息
 */

import { createSignal, createEffect } from 'solid-js';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { TextField, TextFieldInput } from '@/components/ui/text-field';
import { Label } from '@/components/ui/label';
import { showAppToast } from '@/components/AppToasts';
import { getStorage, setStorage } from '@/lib/platform/storage';
import type { WebDavConfig } from '@/types/remote-book';
import { dialogViewportLimits } from '@/lib/viewport-classes';

export interface WebDavConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfigSaved?: (config: WebDavConfig) => void;
}

const WEBDAV_CONFIG_KEY = 'webdav_config';

export function WebDavConfigDialog(props: WebDavConfigDialogProps) {
  const [url, setUrl] = createSignal('');
  const [username, setUsername] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [rootBookPath, setRootBookPath] = createSignal('books');
  const [isSaving, setIsSaving] = createSignal(false);

  // 每次打开时从存储加载已保存的配置，关闭时丢弃未保存的修改（不写回）
  createEffect(() => {
    if (!props.open) return;
    (async () => {
      try {
        const saved = await getStorage<WebDavConfig>(WEBDAV_CONFIG_KEY);
        if (saved) {
          setUrl(saved.url || '');
          setUsername(saved.username || '');
          setPassword(saved.password || '');
          setRootBookPath(saved.rootBookPath || 'books');
        } else {
          setUrl('');
          setUsername('');
          setPassword('');
          setRootBookPath('books');
        }
      } catch (error) {
        console.warn('加载 WebDav 配置失败:', error);
      }
    })();
  });

  const handleSave = async () => {
    const urlValue = url().trim();
    const usernameValue = username().trim();
    const passwordValue = password().trim();

    if (!urlValue || !usernameValue || !passwordValue) {
      showAppToast({
        title: "配置不完整",
        description: "请填写所有必填项",
        variant: "error",
      });
      return;
    }

    // 验证 URL 格式
    if (!urlValue.startsWith('http://') && !urlValue.startsWith('https://')) {
      showAppToast({
        title: "URL 格式错误",
        description: "WebDav 服务器地址必须以 http:// 或 https:// 开头",
        variant: "error",
      });
      return;
    }

    setIsSaving(true);
    try {
      const config: WebDavConfig = {
        url: urlValue,
        username: usernameValue,
        password: passwordValue,
        rootBookPath: rootBookPath().trim() || 'books',
      };

      await setStorage(WEBDAV_CONFIG_KEY, config);
      
      showAppToast({
        title: "保存成功",
        description: "WebDav 配置已保存",
        variant: "success",
      });

      props.onConfigSaved?.(config);
      props.onOpenChange(false);
    } catch (error) {
      console.error('保存 WebDav 配置失败:', error);
      showAppToast({
        title: "保存失败",
        description: error instanceof Error ? error.message : "无法保存配置",
        variant: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class={`${dialogViewportLimits} flex flex-col overflow-hidden p-0`}>
        <DialogHeader class="shrink-0 px-6 pt-6">
          <DialogTitle>WebDav 配置</DialogTitle>
          <DialogDescription>
            配置 WebDav 服务器信息以访问远程书籍
          </DialogDescription>
        </DialogHeader>
        <div class="min-h-0 space-y-4 overflow-y-auto overscroll-contain px-6 py-4 contain-layout">
          <div class="space-y-2">
            <Label for="webdav-url">服务器地址 *</Label>
            <TextField>
              <TextFieldInput
                id="webdav-url"
                type="url"
                placeholder="https://dav.example.com"
                value={url()}
                onInput={(e: Event) => setUrl((e.currentTarget as HTMLInputElement).value)}
                disabled={isSaving()}
              />
            </TextField>
          </div>
          <div class="space-y-2">
            <Label for="webdav-username">用户名 *</Label>
            <TextField>
              <TextFieldInput
                id="webdav-username"
                placeholder="username"
                value={username()}
                onInput={(e: Event) => setUsername((e.currentTarget as HTMLInputElement).value)}
                disabled={isSaving()}
              />
            </TextField>
          </div>
          <div class="space-y-2">
            <Label for="webdav-password">密码 *</Label>
            <TextField>
              <TextFieldInput
                id="webdav-password"
                type="password"
                placeholder="password"
                value={password()}
                onInput={(e: Event) => setPassword((e.currentTarget as HTMLInputElement).value)}
                disabled={isSaving()}
              />
            </TextField>
          </div>
          <div class="space-y-2">
            <Label for="webdav-root-path">根书籍目录（可选）</Label>
            <TextField>
              <TextFieldInput
                id="webdav-root-path"
                placeholder="books"
                value={rootBookPath()}
                onInput={(e: Event) => setRootBookPath((e.currentTarget as HTMLInputElement).value)}
                disabled={isSaving()}
              />
            </TextField>
            <p class="text-xs text-muted-foreground">
              远程书籍存储的根目录路径，默认为 "books"
            </p>
          </div>
        </div>
        <DialogFooter class="shrink-0 flex-row justify-end gap-2 border-t border-border/50 bg-background px-6 py-4">
          <Button
            variant="outline"
            onClick={() => props.onOpenChange(false)}
            disabled={isSaving()}
          >
            取消
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving() || !url().trim() || !username().trim() || !password().trim()}
          >
            {isSaving() ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
