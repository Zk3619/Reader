/**
 * 添加/编辑分组对话框
 * 根据 mode 自动切换为「添加」或「编辑」模式
 */

import { createSignal, Show, createEffect } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Switch, SwitchControl, SwitchThumb } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectIcon,
  SelectItem,
  SelectListbox,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { TextField, TextFieldInput } from '@/components/ui/text-field';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { cn } from '@/lib/utils';
import { ImageIcon, AlertCircleIcon } from '@/components/shared/icons';
import { getCoverPreviewInfo } from '@/lib/bookshelf/book-group-cover';
import * as groupsDb from '@/lib/database/book-groups';
import type { BookGroup } from '@/types';
import { readFile } from '@tauri-apps/plugin-fs';
import { open as openDialog } from '@tauri-apps/plugin-dialog';

export type BookGroupFormMode = 'add' | 'edit';

export const bookSortOptions = [
  { value: -1, label: '默认' },
  { value: 0, label: '最近阅读时间' },
  { value: 1, label: '最近更新时间' },
  { value: 2, label: '书名' },
  { value: 3, label: '手动排序' },
  { value: 4, label: '综合排序' },
  { value: 5, label: '作者' },
];

function isDefaultGroup(groupId: number): boolean {
  return groupId < 0;
}

export interface BookGroupFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: BookGroupFormMode;
  /** 编辑时的分组数据，添加时为 null */
  initialGroup: BookGroup | null;
  onSuccess: () => void;
  onError: (message: string) => void;
}

export function BookGroupFormDialog(props: BookGroupFormDialogProps) {
  const [form, setForm] = createSignal<Partial<BookGroup>>({
    groupName: '',
    cover: '',
    bookSort: -1,
    enableRefresh: true,
    show: true,
  });
  const [bookSort, setBookSort] = createSignal<string>('-1');
  const [selectOpen, setSelectOpen] = createSignal(false);

  createEffect(() => {
    if (!props.open) return;
    if (props.mode === 'edit' && props.initialGroup) {
      const g = props.initialGroup;
      setForm({
        groupName: g.groupName,
        cover: g.cover,
        bookSort: g.bookSort,
        enableRefresh: g.enableRefresh,
        show: g.show,
      });
      setBookSort(String(g.bookSort ?? -1));
    } else {
      setForm({
        groupName: '',
        cover: '',
        bookSort: -1,
        enableRefresh: true,
        show: true,
      });
      setBookSort('-1');
    }
  });

  const isEdit = () => props.mode === 'edit';
  const initialGroup = () => props.initialGroup;
  /** 仅默认分组（系统分组）不可修改名称，用户添加的分组可修改 */
  const nameDisabled = () => isEdit() && initialGroup() && isDefaultGroup(initialGroup()!.groupId);

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
    if (props.mode === 'edit') {
      const group = props.initialGroup;
      if (!group) return;
      try {
        const formData = form();
        const coverTrimmed = formData.cover?.trim();
        const coverValid = coverTrimmed && getCoverPreviewInfo(coverTrimmed).isValid;
        const updatedGroup: BookGroup = {
          ...group,
          ...formData,
          bookSort: Number(bookSort()),
          cover: coverValid ? coverTrimmed : undefined,
        };
        await groupsDb.updateGroup(updatedGroup);
        props.onSuccess();
        props.onOpenChange(false);
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : '保存失败';
        props.onError(errorMsg);
        console.error('保存分组失败:', e);
      }
      return;
    }

    const formData = form();
    if (!formData.groupName || formData.groupName.trim() === '') {
      props.onError('分组名称不能为空');
      return;
    }
    try {
      const canAdd = await groupsDb.canAddGroup();
      if (!canAdd) {
        props.onError('最多只能添加64个分组');
        return;
      }
      const groupId = await groupsDb.getUnusedGroupId();
      const maxOrder = await groupsDb.getMaxOrder();
      const coverTrimmed = formData.cover?.trim();
      const coverValid = coverTrimmed && getCoverPreviewInfo(coverTrimmed).isValid;
      const newGroup: BookGroup = {
        groupId,
        groupName: formData.groupName.trim(),
        cover: coverValid ? coverTrimmed : undefined,
        bookSort: Number(bookSort()),
        enableRefresh: formData.enableRefresh ?? true,
        show: formData.show ?? true,
        order: maxOrder + 1,
      };
      await groupsDb.insertGroup(newGroup);
      props.onSuccess();
      props.onOpenChange(false);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : '添加失败';
      props.onError(errorMsg);
      console.error('添加分组失败:', e);
    }
  }

  function handleCancel() {
    props.onOpenChange(false);
  }

  const options = () => bookSortOptions.map((o) => String(o.value));

  return (
    <AppDialog open={props.open} onOpenChange={handleOpenChange}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>{isEdit() ? '编辑分组' : '添加分组'}</AppDialogTitle>
          <AppDialogDescription>
            {isEdit() && initialGroup() && isDefaultGroup(initialGroup()!.groupId)
              ? '默认分组无法修改名称'
              : isEdit()
                ? '修改分组设置'
                : '创建一个新的书架分组'}
          </AppDialogDescription>
        </AppDialogHeader>

        <div class="min-h-0 space-y-4 overflow-y-auto overscroll-contain px-6 py-4 contain-layout">
          {/* 分组名称：仅默认分组不可编辑 */}
          <div class="space-y-2">
            <Label for="group-name">分组名称</Label>
            <TextField>
              <TextFieldInput
                id="group-name"
                value={form().groupName ?? ''}
                disabled={!!nameDisabled()}
                readOnly={!!nameDisabled()}
                onInput={(e) => !nameDisabled() && setForm({ ...form(), groupName: e.currentTarget.value })}
                placeholder="输入分组名称"
                class={cn(nameDisabled() && 'bg-muted')}
              />
            </TextField>
          </div>

          {/* 封面 */}
          <div class="space-y-2">
            <Label for="group-cover">封面（URL或Emoji）</Label>
            <div class="flex gap-2">
              <TextField class="flex-1">
                <TextFieldInput
                  id="group-cover"
                  value={form().cover || ''}
                  onInput={(e) => setForm({ ...form(), cover: e.currentTarget.value })}
                  placeholder={isEdit() ? '输入图片URL或Emoji' : '输入图片URL或Emoji（可选）'}
                />
              </TextField>
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  const dataUrl = await selectLocalImage();
                  if (dataUrl) setForm({ ...form(), cover: dataUrl });
                }}
              >
                选择本地图片
              </Button>
            </div>

            {/* 封面预览 */}
            {(() => {
              const cover = () => form().cover;
              const previewInfo = () => getCoverPreviewInfo(cover());
              const [imageError, setImageError] = createSignal(false);
              return (
                <AspectRatio ratio={3 / 4} class="overflow-hidden rounded-lg border bg-muted">
                  <button
                    type="button"
                    onClick={async () => {
                      const dataUrl = await selectLocalImage();
                      if (dataUrl) {
                        setForm({ ...form(), cover: dataUrl });
                        setImageError(false);
                      }
                    }}
                    class="flex h-full w-full items-center justify-center transition-colors hover:bg-muted/80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  >
                    <Show
                      when={cover()}
                      fallback={
                        <div class="flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                          <ImageIcon class="h-8 w-8" size={32} />
                          <span>点击选择封面</span>
                        </div>
                      }
                    >
                      {(() => {
                        const info = previewInfo();
                        if (!info.isValid) {
                          return (
                            <div class="flex flex-col items-center justify-center gap-2 text-sm text-destructive">
                              <AlertCircleIcon class="h-8 w-8" size={32} />
                              <span class="text-center px-2">
                                {info.type === 'invalid' && cover()?.startsWith('http')
                                  ? 'URL 格式错误'
                                  : '无效的输入'}
                              </span>
                            </div>
                          );
                        }
                        if (info.type === 'emoji') {
                          return (
                            <div class="flex h-full w-full items-center justify-center text-6xl">
                              {cover()}
                            </div>
                          );
                        }
                        if (info.url && !imageError()) {
                          return (
                            <img
                              src={info.url}
                              alt="封面预览"
                              class="h-full w-full object-cover"
                              onError={() => setImageError(true)}
                            />
                          );
                        }
                        if (imageError()) {
                          return (
                            <div class="flex flex-col items-center justify-center gap-2 text-sm text-destructive">
                              <AlertCircleIcon class="h-8 w-8" size={32} />
                              <span class="text-center px-2">图片加载失败</span>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </Show>
                  </button>
                </AspectRatio>
              );
            })()}
          </div>

          {/* 排序方式 */}
          <div class="space-y-2">
            <Label for="book-sort">内部书籍排序方式</Label>
            <Select
              value={bookSort()}
              onChange={(v) => setBookSort(v || '')}
              options={options()}
              placeholder="选择排序方式"
              open={selectOpen()}
              onOpenChange={setSelectOpen}
              itemComponent={(itemProps) => {
                const option = bookSortOptions.find((o) => String(o.value) === itemProps.item.rawValue);
                return (
                  <SelectItem class="pl-2" item={itemProps.item}>
                    {option?.label || itemProps.item.rawValue}
                  </SelectItem>
                );
              }}
            >
              <SelectTrigger id="book-sort" class="w-full" aria-label="内部书籍排序方式">
                <SelectValue<string>>
                  {(state) => {
                    const v = state.selectedOption();
                    const opt = bookSortOptions.find((o) => String(o.value) === v);
                    return opt?.label || v || '选择排序方式';
                  }}
                </SelectValue>
                <SelectIcon />
              </SelectTrigger>
              <SelectContent>
                <SelectListbox />
              </SelectContent>
            </Select>
          </div>

          {/* 允许下拉刷新 */}
          <div class="flex items-center justify-between">
            <Label for="enable-refresh">允许下拉刷新</Label>
            <Switch
              checked={form().enableRefresh ?? true}
              onChange={(checked) => setForm({ ...form(), enableRefresh: checked })}
            >
              <SwitchControl id="enable-refresh">
                <SwitchThumb />
              </SwitchControl>
            </Switch>
          </div>

          {/* 是否显示 */}
          <div class="flex items-center justify-between">
            <Label for="show-group">显示分组</Label>
            <Switch
              checked={form().show ?? true}
              onChange={(checked) => setForm({ ...form(), show: checked })}
            >
              <SwitchControl id="show-group">
                <SwitchThumb />
              </SwitchControl>
            </Switch>
          </div>
        </div>

        <AppDialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            取消
          </Button>
          <Button onClick={handleSubmit}>确认</Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
