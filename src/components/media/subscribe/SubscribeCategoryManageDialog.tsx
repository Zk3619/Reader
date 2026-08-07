/**
 * 订阅分类管理：增删改 + 按分类导出 OPML 精选合集（无列表方案）
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
import { showAppToast } from '@/components/shared/AppToasts';
import { ExportIcon, SearchIcon } from '@/components/shared/icons';
import {
  addSubscribeCategory,
  deleteSubscribeCategory,
  listSubscribeCategories,
  renameSubscribeCategory,
} from '@/lib/subscribe/service';
import { downloadSubscribeOpmlFile } from '@/lib/subscribe/download-subscribe-opml';

export interface SubscribeCategoryManageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCategoriesChange?: () => void;
}

export function SubscribeCategoryManageDialog(props: SubscribeCategoryManageDialogProps) {
  const [categories, setCategories] = createSignal<string[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [fuzzySearch, setFuzzySearch] = createSignal(false);
  const [formMode, setFormMode] = createSignal<'add' | { edit: string } | null>(null);
  const [formValue, setFormValue] = createSignal('');
  const [saving, setSaving] = createSignal(false);

  async function loadCategories() {
    setLoading(true);
    try {
      setCategories(await listSubscribeCategories());
    } catch (e) {
      console.error('加载订阅分类失败:', e);
      showAppToast({
        title: '加载失败',
        description: String(e),
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  }

  createEffect(() => {
    if (props.open) {
      void loadCategories();
      setSearchQuery('');
      setFuzzySearch(false);
      setFormMode(null);
      setFormValue('');
    }
  });

  const filteredCategories = createMemo(() => {
    const list = categories();
    const q = searchQuery().trim().toLowerCase();
    if (!q) return list;
    const fuzzy = fuzzySearch();
    return list.filter((name) => {
      const lower = name.toLowerCase();
      if (!fuzzy) return lower.includes(q);
      let qi = 0;
      for (const ch of lower) {
        if (ch === q[qi]) qi += 1;
        if (qi >= q.length) return true;
      }
      return false;
    });
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
      showAppToast({ title: '分类名不能为空', variant: 'error' });
      return;
    }
    const mode = formMode();
    if (!mode) return;
    setSaving(true);
    try {
      if (mode === 'add') {
        const result = await addSubscribeCategory(v);
        showAppToast({
          title: '已添加分类',
          description:
            result.assigned > 0
              ? `已将 ${result.assigned} 个未分类源归入「${v}」`
              : `「${v}」已就绪，可在编辑源时选用`,
        });
      } else {
        await renameSubscribeCategory(mode.edit, v);
        showAppToast({ title: '已重命名', description: `「${mode.edit}」→「${v}」` });
      }
      setFormMode(null);
      setFormValue('');
      await loadCategories();
      props.onCategoriesChange?.();
    } catch (e) {
      showAppToast({
        title: '保存失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
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
    if (!confirm(`确定删除分类「${name}」？该分类下的订阅源将变为未分类。`)) return;
    try {
      await deleteSubscribeCategory(name);
      showAppToast({ title: '已删除分类', description: `「${name}」` });
      await loadCategories();
      props.onCategoriesChange?.();
    } catch (e) {
      showAppToast({
        title: '删除失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    }
  };

  const handleExport = async (name: string) => {
    try {
      await downloadSubscribeOpmlFile({ category: name });
      showAppToast({
        title: '已导出精选合集',
        description: `「${name}」可分享给他人导入`,
      });
    } catch (e) {
      showAppToast({
        title: '导出失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
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
          <AppDialogTitle>分类管理</AppDialogTitle>
        </AppDialogHeader>

        <div class="flex min-h-0 flex-col overflow-hidden">
          <div class="flex shrink-0 items-center gap-2 border-b border-border/50 px-6 py-3">
            <div class="relative flex min-w-0 flex-1 items-center">
              <SearchIcon class="pointer-events-none absolute left-2.5 h-4 w-4 text-muted-foreground" />
              <AppTextInputContextMenu>
                <input
                  type="text"
                  placeholder="搜索分类"
                  value={searchQuery()}
                  onInput={(e) => setSearchQuery(e.currentTarget.value)}
                  class="h-9 w-full rounded-md border border-input bg-transparent py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="搜索分类"
                />
              </AppTextInputContextMenu>
            </div>
            <div class="flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap">
              <Checkbox
                id="subscribe-category-fuzzy-search"
                checked={fuzzySearch()}
                onChange={(checked) => setFuzzySearch(checked)}
                aria-label="模糊搜索"
              />
              <Label
                for="subscribe-category-fuzzy-search"
                class="cursor-pointer text-sm text-muted-foreground"
              >
                模糊搜索
              </Label>
            </div>
          </div>

          <Show when={formMode()}>
            <div class="flex shrink-0 items-center gap-2 border-b border-border/50 bg-muted/30 px-6 py-3">
              <AppTextInputContextMenu triggerClass="min-w-0 flex-1">
                <input
                  type="text"
                  placeholder="分类名称"
                  value={formValue()}
                  onInput={(e) => setFormValue(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleFormSubmit();
                    if (e.key === 'Escape') handleFormCancel();
                  }}
                  class="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="分类名称"
                />
              </AppTextInputContextMenu>
              <Button size="sm" onClick={() => void handleFormSubmit()} disabled={saving()}>
                确定
              </Button>
              <Button size="sm" variant="outline" onClick={handleFormCancel} disabled={saving()}>
                取消
              </Button>
            </div>
          </Show>

          <div class="mb-4 min-h-0 overflow-y-auto overscroll-contain contain-layout">
            <Show when={loading()}>
              <div class="px-4 py-8 text-center text-sm text-muted-foreground">加载中...</div>
            </Show>
            <Show when={!loading() && filteredCategories().length === 0}>
              <div class="px-4 py-8 text-center text-sm text-muted-foreground">
                {searchQuery().trim()
                  ? '无匹配分类'
                  : '暂无分类，可点击「添加」将未分类源归入新分类'}
              </div>
            </Show>
            <Show when={!loading() && filteredCategories().length > 0}>
              <ul class="divide-y divide-border">
                <For each={filteredCategories()}>
                  {(name) => (
                    <li class="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-muted/50">
                      <span class="min-w-0 truncate text-sm font-medium">{name}</span>
                      <div class="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          class="h-8 px-2 text-muted-foreground"
                          onClick={() => void handleExport(name)}
                          disabled={formMode() !== null}
                        >
                          <ExportIcon class="mr-1 h-3.5 w-3.5" />
                          导出
                        </Button>
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
                          onClick={() => void handleDelete(name)}
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
