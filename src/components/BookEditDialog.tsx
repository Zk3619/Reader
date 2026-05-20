/**
 * 书籍编辑对话框
 * 参考 legado：编辑书名、作者、封面、所属分组
 */

import { createSignal, createEffect } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/AppDialog';
import {
  Select,
  SelectContent,
  SelectIcon,
  SelectItem,
  SelectListbox,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TextField, TextFieldInput } from '@/components/ui/text-field';
import { getCoverPreviewInfo } from '@/utils/book-group-cover';
import * as booksDb from '@/lib/database/books';
import * as groupsDb from '@/lib/database/book-groups';
import type { Book } from '@/types';
import type { BookGroup } from '@/types';
import { readFile } from '@tauri-apps/plugin-fs';
import { open as openDialog } from '@tauri-apps/plugin-dialog';

export interface BookEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  book: Book | null;
  onSuccess: () => void;
  onError: (message: string) => void;
}

export function BookEditDialog(props: BookEditDialogProps) {
  const [name, setName] = createSignal('');
  const [author, setAuthor] = createSignal('');
  const [cover, setCover] = createSignal('');
  const [groupValue, setGroupValue] = createSignal<string>('0');
  const [groups, setGroups] = createSignal<BookGroup[]>([]);
  const [selectOpen, setSelectOpen] = createSignal(false);

  createEffect(async () => {
    if (!props.open) return;
    const book = props.book;
    if (book) {
      setName(book.name);
      setAuthor(book.author ?? '');
      setCover(book.customCoverUrl ?? book.coverUrl ?? '');
      setGroupValue(String(book.group ?? 0));
    }
    const list = await groupsDb.getAllGroups();
    const userGroups = list.filter((g) => g.groupId >= 0);
    setGroups(userGroups);
  });

  async function selectLocalImage(): Promise<string | null> {
    try {
      const filePath = await openDialog({
        multiple: false,
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] }],
      });
      if (!filePath || typeof filePath !== 'string') return null;
      const fileData = await readFile(filePath);
      const extension = filePath.split('.').pop()?.toLowerCase() || 'png';
      const mimeType = `image/${extension === 'jpg' ? 'jpeg' : extension === 'svg' ? 'svg+xml' : extension}`;
      const uint8Array = fileData instanceof Uint8Array ? fileData : new Uint8Array(fileData);
      const base64 = btoa(String.fromCharCode(...uint8Array));
      return `data:${mimeType};base64,${base64}`;
    } catch (error) {
      console.error('选择本地图片失败:', error);
      props.onError('选择本地图片失败');
      return null;
    }
  }

  function handleOpenChange(open: boolean) {
    if (open) {
      requestAnimationFrame(() => setSelectOpen(false));
    }
    props.onOpenChange(open);
  }

  async function handleSubmit() {
    const book = props.book;
    if (!book) return;
    const nameTrim = name().trim();
    if (!nameTrim) {
      props.onError('书名不能为空');
      return;
    }
    try {
      const coverTrimmed = cover().trim();
      const coverValid = coverTrimmed && getCoverPreviewInfo(coverTrimmed).isValid;
      const updated: Book = {
        ...book,
        name: nameTrim,
        author: author().trim(),
        customCoverUrl: coverValid ? coverTrimmed : undefined,
        group: Number(groupValue()) || 0,
      };
      await booksDb.updateBook(updated);
      props.onSuccess();
      props.onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '保存失败';
      props.onError(msg);
      console.error('保存书籍失败:', e);
    }
  }

  const coverValid = () => cover().trim() && getCoverPreviewInfo(cover()).isValid;

  return (
    <AppDialog open={props.open} onOpenChange={handleOpenChange}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>编辑书籍</AppDialogTitle>
          <AppDialogDescription>修改书名、作者、封面或所属分组</AppDialogDescription>
        </AppDialogHeader>

        <div class="min-h-0 space-y-4 overflow-y-auto overscroll-contain px-6 py-4 contain-layout">
          <div class="space-y-2">
            <Label for="book-edit-name">书名</Label>
            <TextField>
              <TextFieldInput
                id="book-edit-name"
                value={name()}
                onInput={(e) => setName(e.currentTarget.value)}
                placeholder="书名"
              />
            </TextField>
          </div>

          <div class="space-y-2">
            <Label for="book-edit-author">作者</Label>
            <TextField>
              <TextFieldInput
                id="book-edit-author"
                value={author()}
                onInput={(e) => setAuthor(e.currentTarget.value)}
                placeholder="作者"
              />
            </TextField>
          </div>

          <div class="space-y-2">
            <Label>封面</Label>
            <div class="flex items-center gap-3">
              <div class="h-16 w-12 shrink-0 overflow-hidden rounded bg-muted/50">
                {coverValid() ? (
                  <img src={cover()} alt="" class="h-full w-full object-cover" />
                ) : (
                  <span class="flex h-full w-full items-center justify-center text-muted-foreground text-xs">无</span>
                )}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={async () => {
                const url = await selectLocalImage();
                if (url) setCover(url);
              }}>
                选择图片
              </Button>
            </div>
          </div>

          <div class="space-y-2">
            <Label for="book-edit-group">所属分组</Label>
            <Select
              value={groupValue()}
              onChange={(v) => setGroupValue(v || '0')}
              options={['0', ...groups().map((g) => String(g.groupId))]}
              placeholder="选择分组"
              open={selectOpen()}
              onOpenChange={setSelectOpen}
              itemComponent={(itemProps) => (
                <SelectItem class="pl-2" item={itemProps.item}>
                  {itemProps.item.rawValue === '0' ? '未分组' : groups().find((g) => String(g.groupId) === itemProps.item.rawValue)?.groupName ?? itemProps.item.rawValue}
                </SelectItem>
              )}
            >
              <SelectTrigger id="book-edit-group" class="w-full" aria-label="所属分组">
                <SelectValue<string>>
                  {(state) => {
                    const v = state.selectedOption();
                    return v === '0' ? '未分组' : (groups().find((g) => String(g.groupId) === v)?.groupName ?? v ?? '选择分组');
                  }}
                </SelectValue>
                <SelectIcon />
              </SelectTrigger>
              <SelectContent>
                <SelectListbox />
              </SelectContent>
            </Select>
          </div>
        </div>

        <AppDialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSubmit}>保存</Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
