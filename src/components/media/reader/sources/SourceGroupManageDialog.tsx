/**
 * 书源分组管理对话框
 * 对齐 legado 项目书源管理中的 GroupManageDialog：分组列表、添加/编辑/删除
 * 并增加分组搜索与模糊搜索选项
 */

import { createSignal, createMemo, Show, For, createEffect } from 'solid-js';
import {
  AppDialog,
  AppDialogContent,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { AppTextInputContextMenu } from '@/components/shared/AppTextInputContextMenu';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { blurActiveElement } from '@/utils/accessibility';
import * as sourcesDb from '@/lib/database/sources';
import { showAppToast } from '@/components/shared/AppToasts';
import { fuzzyMatchQuery } from '@/lib/sources/source-list-filter';
import { SearchIcon } from '@/components/shared/icons';

export interface SourceGroupManageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 分组列表变更后回调（用于刷新导航栏分组下拉） */
  onGroupsChange?: () => void;
}

export function SourceGroupManageDialog(props: SourceGroupManageDialogProps) {
  const [groups, setGroups] = createSignal<string[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [fuzzySearch, setFuzzySearch] = createSignal(false);
  /** 添加：'add'；编辑：{ edit: groupName } */
  const [formMode, setFormMode] = createSignal<'add' | { edit: string } | null>(null);
  const [formValue, setFormValue] = createSignal('');
  const [saving, setSaving] = createSignal(false);

  async function loadGroups() {
    setLoading(true);
    try {
      const list = await sourcesDb.getAllSourceGroups();
      setGroups(list);
    } catch (e) {
      console.error('加载书源分组失败:', e);
      showAppToast({ title: '加载失败', description: String(e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  createEffect(() => {
    if (props.open) {
      loadGroups();
      setSearchQuery('');
      setFuzzySearch(false);
      setFormMode(null);
      setFormValue('');
    }
  });

  const filteredGroups = createMemo(() => {
    const list = groups();
    const q = searchQuery().trim().toLowerCase();
    if (!q) return list;
    const fuzzy = fuzzySearch();
    return list.filter((name) =>
      fuzzy
        ? fuzzyMatchQuery(q, name)
        : name.toLowerCase().includes(q)
    );
  });

  const handleAdd = () => {
    setFormMode('add');
    setFormValue('');
  };

  const handleEdit = (name: string) => {
    setFormMode({ edit: name });
    setFormValue(name);
  };

  const handleFormSubmit = async () => {
    const v = formValue().trim();
    if (!v) {
      showAppToast({ title: '分组名不能为空', variant: 'destructive' });
      return;
    }
    const mode = formMode();
    if (!mode) return;
    setSaving(true);
    try {
      if (mode === 'add') {
        await sourcesDb.addSourceGroup(v);
        showAppToast({ title: '已添加分组', description: `未分组的书源已归入「${v}」`, variant: 'default' });
      } else {
        await sourcesDb.renameSourceGroup(mode.edit, v);
        showAppToast({ title: '已重命名', description: `「${mode.edit}」→「${v}」`, variant: 'default' });
      }
      setFormMode(null);
      setFormValue('');
      await loadGroups();
      props.onGroupsChange?.();
      window.dispatchEvent(new CustomEvent('sources-refresh'));
    } catch (e) {
      console.error('保存分组失败:', e);
      showAppToast({ title: '保存失败', description: String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleFormCancel = () => {
    setFormMode(null);
    setFormValue('');
    blurActiveElement();
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`确定删除分组「${name}」？该分组下的书源将变为未分组。`)) return;
    try {
      await sourcesDb.deleteSourceGroup(name);
      showAppToast({ title: '已删除分组', description: `「${name}」`, variant: 'default' });
      await loadGroups();
      props.onGroupsChange?.();
      window.dispatchEvent(new CustomEvent('sources-refresh'));
    } catch (e) {
      console.error('删除分组失败:', e);
      showAppToast({ title: '删除失败', description: String(e), variant: 'destructive' });
    }
  };

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange} modal>
      <AppDialogContent>
        <AppDialogHeader
          actions={
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                setFormMode(null);
                handleAdd();
              }}
              disabled={formMode() !== null}
            >
              添加
            </Button>
          }
        >
          <AppDialogTitle>分组管理</AppDialogTitle>
        </AppDialogHeader>

        <div class="flex flex-col min-h-0 overflow-hidden">
          {/* 搜索 + 模糊搜索（复选框在搜索框右侧） */}
          <div class="shrink-0 flex items-center gap-2 border-b border-border/50 px-6 py-3">
            <div class="relative flex-1 min-w-0 flex items-center">
              <SearchIcon class="absolute left-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <AppTextInputContextMenu>
                <input
                  type="text"
                  placeholder="搜索分组"
                  value={searchQuery()}
                  onInput={(e) => setSearchQuery(e.currentTarget.value)}
                  class="h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="搜索分组"
                />
              </AppTextInputContextMenu>
            </div>
            <div class="flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap">
              <Checkbox
                id="source-group-fuzzy-search"
                checked={fuzzySearch()}
                onChange={(checked) => setFuzzySearch(checked)}
                aria-label="模糊搜索"
              />
              <Label for="source-group-fuzzy-search" class="text-sm text-muted-foreground cursor-pointer">
                模糊搜索
              </Label>
            </div>
          </div>

          {/* 添加/编辑表单 */}
          <Show when={formMode()}>
            <div class="shrink-0 flex items-center gap-2 border-b border-border/50 bg-muted/30 px-6 py-3">
              <AppTextInputContextMenu triggerClass="min-w-0 flex-1">
                <input
                  type="text"
                  placeholder="分组名称"
                  value={formValue()}
                  onInput={(e) => setFormValue(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleFormSubmit();
                    if (e.key === 'Escape') handleFormCancel();
                  }}
                  class="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="分组名称"
                />
              </AppTextInputContextMenu>
              <Button size="sm" onClick={handleFormSubmit} disabled={saving()}>
                确定
              </Button>
              <Button size="sm" variant="outline" onClick={handleFormCancel} disabled={saving()}>
                取消
              </Button>
            </div>
          </Show>

          {/* 分组列表 */}
          <div class="min-h-0 overflow-y-auto overscroll-contain contain-layout mb-4">
            <Show when={loading()}>
              <div class="px-4 py-8 text-center text-sm text-muted-foreground">加载中...</div>
            </Show>
            <Show when={!loading() && filteredGroups().length === 0}>
              <div class="px-4 py-8 text-center text-sm text-muted-foreground">
                {searchQuery().trim() ? '无匹配分组' : '暂无分组，可点击「添加」将未分组书源归入新分组'}
              </div>
            </Show>
            <Show when={!loading() && filteredGroups().length > 0}>
              <ul class="divide-y divide-border">
                <For each={filteredGroups()}>
                  {(name) => (
                    <li class="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-muted/50">
                      <span class="min-w-0 truncate text-sm font-medium">{name}</span>
                      <div class="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          class="h-8 px-2 text-muted-foreground"
                          onClick={() => handleEdit(name)}
                          disabled={formMode() !== null}
                        >
                          编辑
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          class="h-8 px-2 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(name)}
                          disabled={formMode() !== null}
                        >
                          删除
                        </Button>
                      </div>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </div>
        </div>
      </AppDialogContent>
    </AppDialog>
  );
}
