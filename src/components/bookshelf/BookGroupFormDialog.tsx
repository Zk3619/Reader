/**
 * 添加/编辑分组对话框
 * 根据 mode 自动切换为「添加」或「编辑」模式
 */

import { createSignal, createEffect } from 'solid-js';
import { Button } from '@/components/ui/button';
import { AppSwitch, AppSwitchControl, AppSwitchThumb } from '@/components/shared/AppSwitch';
import { Label } from '@/components/ui/label';
import {
  AppSelect,
  AppSelectContent,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import {
  AppDialogScrollBody,
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { AppTextField, AppTextFieldInput } from '@/components/shared/AppTextField';
import { FormCoverPreview } from '@/components/shared/FormCoverPreview';
import { cn } from '@/lib/utils';
import {
  dialogFormCoverAsideWide,
  dialogFormRowWide,
} from '@/lib/ui/viewport-classes';
import { useDialogFormWideLayout } from '@/lib/shell/dialog-form-layout';
import { getCoverPreviewInfo } from '@/lib/bookshelf/book-group-cover';
import { pickLocalImageAsDataUrl } from '@/lib/platform/image-data-url';
import * as groupsDb from '@/lib/database/book-groups';
import type { BookGroup } from '@/types';

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
  const wideForm = useDialogFormWideLayout();
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

  async function pickCoverFromLocal() {
    try {
      const dataUrl = await pickLocalImageAsDataUrl();
      if (dataUrl) setForm({ ...form(), cover: dataUrl });
    } catch (error) {
      console.error('选择本地图片失败:', error);
      props.onError('选择本地图片失败');
    }
  }

  const options = () => bookSortOptions.map((o) => String(o.value));
  const cover = () => form().cover;

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
        onlyUpdateRead: formData.onlyUpdateRead ?? false,
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

        <AppDialogScrollBody>
          <div class={cn('flex flex-col gap-4', wideForm() && dialogFormRowWide)}>
            {/* 宽屏：左侧封面预览 */}
            <div class={cn('shrink-0', wideForm() ? dialogFormCoverAsideWide : 'hidden')}>
              <FormCoverPreview cover={cover} onPickCover={pickCoverFromLocal} />
            </div>

            <div class="min-w-0 flex-1 space-y-4">
              {/* 分组名称：仅默认分组不可编辑 */}
              <div class="space-y-2">
                <Label for="group-name">分组名称</Label>
                <AppTextField>
                  <AppTextFieldInput
                    id="group-name"
                    value={form().groupName ?? ''}
                    disabled={!!nameDisabled()}
                    readOnly={!!nameDisabled()}
                    onInput={(e) => !nameDisabled() && setForm({ ...form(), groupName: e.currentTarget.value })}
                    placeholder="输入分组名称"
                    class={cn(nameDisabled() && 'bg-muted')}
                  />
                </AppTextField>
              </div>

              {/* 封面 */}
              <div class="space-y-2">
                <Label for="group-cover">封面（URL或Emoji）</Label>
                <div class="flex gap-2">
                  <AppTextField class="flex-1">
                    <AppTextFieldInput
                      id="group-cover"
                      value={form().cover || ''}
                      onInput={(e) => setForm({ ...form(), cover: e.currentTarget.value })}
                      placeholder={isEdit() ? '输入图片URL或Emoji' : '输入图片URL或Emoji（可选）'}
                    />
                  </AppTextField>
                  <Button type="button" variant="outline" onClick={pickCoverFromLocal}>
                    选择本地图片
                  </Button>
                </div>

                {/* 小于 md：封面预览在输入框下方 */}
                <div class={cn(wideForm() ? 'hidden' : undefined)}>
                  <FormCoverPreview cover={cover} onPickCover={pickCoverFromLocal} />
                </div>
              </div>

              {/* 排序方式 */}
              <div class="space-y-2">
                <Label for="book-sort">内部书籍排序方式</Label>
                <AppSelect
                  value={bookSort()}
                  onChange={(v) => setBookSort(v || '')}
                  options={options()}
                  placeholder="选择排序方式"
                  open={selectOpen()}
                  onOpenChange={setSelectOpen}
                  itemComponent={(itemProps) => {
                    const option = bookSortOptions.find((o) => String(o.value) === itemProps.item.rawValue);
                    return (
                      <AppSelectItem item={itemProps.item}>
                        {option?.label || itemProps.item.rawValue}
                      </AppSelectItem>
                    );
                  }}
                >
                  <AppSelectTrigger id="book-sort" aria-label="内部书籍排序方式">
                    <AppSelectValue<string>>
                      {(state) => {
                        const v = state.selectedOption();
                        const opt = bookSortOptions.find((o) => String(o.value) === v);
                        return opt?.label || v || '选择排序方式';
                      }}
                    </AppSelectValue>
                    <AppSelectIcon />
                  </AppSelectTrigger>
                  <AppSelectContent>
                    <AppSelectListbox />
                  </AppSelectContent>
                </AppSelect>
              </div>

              {/* 允许下拉刷新 */}
              <div class="flex items-center justify-between">
                <Label for="enable-refresh">允许下拉刷新</Label>
                <AppSwitch
                  checked={form().enableRefresh ?? true}
                  onChange={(checked) => setForm({ ...form(), enableRefresh: checked })}
                >
                  <AppSwitchControl id="enable-refresh">
                    <AppSwitchThumb />
                  </AppSwitchControl>
                </AppSwitch>
              </div>

              {/* 是否显示 */}
              <div class="flex items-center justify-between">
                <Label for="show-group">显示分组</Label>
                <AppSwitch
                  checked={form().show ?? true}
                  onChange={(checked) => setForm({ ...form(), show: checked })}
                >
                  <AppSwitchControl id="show-group">
                    <AppSwitchThumb />
                  </AppSwitchControl>
                </AppSwitch>
              </div>
            </div>
          </div>
        </AppDialogScrollBody>

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
