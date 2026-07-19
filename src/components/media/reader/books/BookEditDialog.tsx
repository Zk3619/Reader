/**
 * 书籍编辑对话框
 * 参考 legado：编辑书名、作者、封面、所属分组
 */

import { createSignal, createEffect } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  AppDialogScrollBody,
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import {
  AppSelect,
  AppSelectContent,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import { AppTextField, AppTextFieldInput } from '@/components/shared/AppTextField';
import { FormCoverPreview } from '@/components/shared/FormCoverPreview';
import { getCoverPreviewInfo } from '@/lib/bookshelf/book-group-cover';
import { pickLocalImageAsDataUrl } from '@/lib/platform/image-data-url';
import {
  dialogFormCoverAsideWide,
  dialogFormRowWide,
} from '@/lib/ui/viewport-classes';
import { useDialogFormWideLayout } from '@/lib/shell/dialog-form-layout';
import { cn } from '@/lib/utils';
import * as booksDb from '@/lib/database/books';
import * as groupsDb from '@/lib/database/book-groups';
import type { Book } from '@/types';
import type { BookGroup } from '@/types';

export interface BookEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  book: Book | null;
  onSuccess: () => void;
  onError: (message: string) => void;
}

export function BookEditDialog(props: BookEditDialogProps) {
  const wideForm = useDialogFormWideLayout();
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

  async function pickCoverFromLocal() {
    try {
      const dataUrl = await pickLocalImageAsDataUrl();
      if (dataUrl) setCover(dataUrl);
    } catch (error) {
      console.error('选择本地图片失败:', error);
      props.onError('选择本地图片失败');
    }
  }

  return (
    <AppDialog open={props.open} onOpenChange={handleOpenChange}>
      <AppDialogContent class="max-w-2xl">
        <AppDialogHeader>
          <AppDialogTitle>编辑书籍</AppDialogTitle>
          <AppDialogDescription>修改书名、作者、封面或所属分组</AppDialogDescription>
        </AppDialogHeader>

        <AppDialogScrollBody>
          <div class={cn('flex flex-col gap-4', wideForm() && dialogFormRowWide)}>
            <div class={cn('shrink-0', wideForm() ? dialogFormCoverAsideWide : 'hidden')}>
              <FormCoverPreview cover={cover} onPickCover={pickCoverFromLocal} />
            </div>

            <div class="min-w-0 flex-1 space-y-4">
              <div class="space-y-2">
                <Label for="book-edit-name">书名</Label>
                <AppTextField>
                  <AppTextFieldInput
                    id="book-edit-name"
                    value={name()}
                    onInput={(e) => setName(e.currentTarget.value)}
                    placeholder="书名"
                  />
                </AppTextField>
              </div>

              <div class="space-y-2">
                <Label for="book-edit-author">作者</Label>
                <AppTextField>
                  <AppTextFieldInput
                    id="book-edit-author"
                    value={author()}
                    onInput={(e) => setAuthor(e.currentTarget.value)}
                    placeholder="作者"
                  />
                </AppTextField>
              </div>

              <div class="space-y-2">
                <Label for="book-edit-cover">封面（URL 或 Emoji）</Label>
                <div class="flex gap-2">
                  <AppTextField class="flex-1">
                    <AppTextFieldInput
                      id="book-edit-cover"
                      value={cover()}
                      onInput={(e) => setCover(e.currentTarget.value)}
                      placeholder="输入图片 URL 或 Emoji"
                    />
                  </AppTextField>
                  <Button type="button" variant="outline" onClick={() => void pickCoverFromLocal()}>
                    选择本地图片
                  </Button>
                </div>

                <div class={cn(wideForm() ? 'hidden' : undefined)}>
                  <FormCoverPreview cover={cover} onPickCover={pickCoverFromLocal} />
                </div>
              </div>

              <div class="space-y-2">
                <Label for="book-edit-group">所属分组</Label>
                <AppSelect
                  value={groupValue()}
                  onChange={(v) => setGroupValue(v || '0')}
                  options={['0', ...groups().map((g) => String(g.groupId))]}
                  placeholder="选择分组"
                  open={selectOpen()}
                  onOpenChange={setSelectOpen}
                  itemComponent={(itemProps) => (
                    <AppSelectItem item={itemProps.item}>
                      {itemProps.item.rawValue === '0'
                        ? '未分组'
                        : (groups().find((g) => String(g.groupId) === itemProps.item.rawValue)?.groupName ??
                          itemProps.item.rawValue)}
                    </AppSelectItem>
                  )}
                >
                  <AppSelectTrigger id="book-edit-group" aria-label="所属分组">
                    <AppSelectValue<string>>
                      {(state) => {
                        const v = state.selectedOption();
                        return v === '0'
                          ? '未分组'
                          : (groups().find((g) => String(g.groupId) === v)?.groupName ?? v ?? '选择分组');
                      }}
                    </AppSelectValue>
                    <AppSelectIcon />
                  </AppSelectTrigger>
                  <AppSelectContent>
                    <AppSelectListbox />
                  </AppSelectContent>
                </AppSelect>
              </div>
            </div>
          </div>
        </AppDialogScrollBody>

        <AppDialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={() => void handleSubmit()}>保存</Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
