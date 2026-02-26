/**
 * 书源网络导入对话框
 * 对齐 legado：输入书源 JSON 的 URL，拉取后解析并导入
 */

import { createSignal } from 'solid-js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { TextField, TextFieldInput } from '@/components/ui/text-field';
import { invoke } from '@tauri-apps/api/core';
import { parseBookSourceJson } from '@/lib/book-source/source-import';
import * as sourcesDb from '@/lib/database/sources';
import { showAppToast } from '@/components/AppToasts';
import { isTauri } from '@/lib/platform/detect';
import { cn } from '@/lib/utils';

export interface ImportSourceNetworkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ImportSourceNetworkDialog(props: ImportSourceNetworkDialogProps) {
  const [url, setUrl] = createSignal('');
  const [isImporting, setIsImporting] = createSignal(false);

  const handleImport = async () => {
    const u = url().trim();
    if (!u) return;
    setIsImporting(true);
    try {
      let text: string;
      if (isTauri()) {
        text = await invoke<string>('fetch_url_text', { url: u, timeoutMs: 30000 });
      } else {
        const res = await fetch(u, { mode: 'cors' });
        if (!res.ok) throw new Error(`请求失败: ${res.status}`);
        text = await res.text();
      }
      const list = parseBookSourceJson(text);
      if (list.length === 0) {
        showAppToast({ title: '网络导入书源', description: '未解析到有效书源', variant: 'default' });
        props.onSuccess?.();
        props.onOpenChange(false);
        return;
      }
      for (const source of list) {
        await sourcesDb.insertSource(source);
      }
      window.dispatchEvent(new CustomEvent('sources-refresh'));
      showAppToast({ title: '网络导入书源', description: `已导入 ${list.length} 条书源`, variant: 'default' });
      setUrl('');
      props.onSuccess?.();
      props.onOpenChange(false);
    } catch (err) {
      console.error('书源网络导入失败:', err);
      const isCorsOrNetwork =
        err instanceof TypeError &&
        (err.message === 'Failed to fetch' || err.message.includes('fetch'));
      const description = isCorsOrNetwork
        ? '该链接因跨域限制无法直接拉取。请下载书源 JSON 文件后使用「本地导入」。'
        : String(err);
      showAppToast({ title: '网络导入书源失败', description, variant: 'destructive' });
    } finally {
      setIsImporting(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && isImporting()) return;
    props.onOpenChange(open);
  };

  return (
    <Dialog open={props.open} onOpenChange={handleOpenChange} modal>
      <DialogContent class={cn('max-w-[calc(100vw-2rem)] sm:max-w-md', isImporting() && 'dialog-importing')}>
        <DialogHeader>
          <DialogTitle>网络导入书源</DialogTitle>
          <DialogDescription>
            输入书源 JSON 的链接（http/https），将拉取并导入，兼容 legado 书源格式。桌面端由应用内网络拉取，不受跨域限制；浏览器环境下若遇跨域请改用「本地导入」。
          </DialogDescription>
        </DialogHeader>
        <div class="py-4">
          <TextField>
            <TextFieldInput
              placeholder="https://example.com/bookSources.json"
              value={url()}
              onInput={(e: Event) => setUrl((e.currentTarget as HTMLInputElement).value)}
              disabled={isImporting()}
            />
          </TextField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isImporting()}>
            取消
          </Button>
          <Button onClick={handleImport} disabled={!url().trim() || isImporting()}>
            {isImporting() ? '导入中...' : '导入'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
