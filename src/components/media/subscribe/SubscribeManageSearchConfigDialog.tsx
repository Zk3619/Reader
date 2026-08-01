/**
 * 订阅管理页搜索偏好弹窗：搜索范围 + 搜索模式（对齐音乐搜索配置）
 */

import { createEffect, createSignal, For } from 'solid-js';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  DEFAULT_SUBSCRIBE_MANAGE_SEARCH_PREFS,
  getSubscribeManageSearchPrefs,
  setSubscribeManageSearchPrefs,
  subscribeManageSearchPrefsEqual,
  type SubscribeManageSearchMode,
  type SubscribeManageSearchPrefs,
  type SubscribeManageSearchScope,
} from '@/lib/subscribe/subscribe-manage-search-prefs';

const SCOPE_OPTIONS: { id: SubscribeManageSearchScope; label: string }[] = [
  { id: 'title', label: '标题' },
  { id: 'url', label: 'URL' },
  { id: 'category', label: '分类（列表）' },
];

const MODE_OPTIONS: { id: SubscribeManageSearchMode; label: string; hint: string }[] = [
  { id: 'normal', label: '常规搜索', hint: '所选字段须连续包含关键词' },
  { id: 'precise', label: '精准搜索', hint: '所选字段须与关键词完全一致' },
  { id: 'fuzzy', label: '模糊搜索', hint: '所选字段模糊匹配关键词' },
];

export interface SubscribeManageSearchConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (prefs: SubscribeManageSearchPrefs) => void;
}

export function SubscribeManageSearchConfigDialog(
  props: SubscribeManageSearchConfigDialogProps,
) {
  const [draft, setDraft] = createSignal<SubscribeManageSearchPrefs>({
    scopes: [...DEFAULT_SUBSCRIBE_MANAGE_SEARCH_PREFS.scopes],
    mode: DEFAULT_SUBSCRIBE_MANAGE_SEARCH_PREFS.mode,
  });
  const [discardOpen, setDiscardOpen] = createSignal(false);

  createEffect(() => {
    if (props.open) {
      const cur = getSubscribeManageSearchPrefs();
      setDraft({ scopes: [...cur.scopes], mode: cur.mode });
      setDiscardOpen(false);
    }
  });

  const dirty = () => !subscribeManageSearchPrefsEqual(draft(), getSubscribeManageSearchPrefs());

  const closeWithoutCheck = () => {
    setDiscardOpen(false);
    props.onOpenChange(false);
  };

  const requestClose = (open: boolean) => {
    if (open) {
      props.onOpenChange(true);
      return;
    }
    if (dirty()) {
      setDiscardOpen(true);
      return;
    }
    closeWithoutCheck();
  };

  const toggleScope = (id: SubscribeManageSearchScope, checked: boolean) => {
    const cur = draft();
    const scopes = checked
      ? cur.scopes.includes(id)
        ? cur.scopes
        : [...cur.scopes, id]
      : cur.scopes.filter((s) => s !== id);
    setDraft({ ...cur, scopes });
  };

  const save = () => {
    setSubscribeManageSearchPrefs(draft());
    props.onSaved?.(getSubscribeManageSearchPrefs());
    closeWithoutCheck();
  };

  return (
    <>
      <AppDialog open={props.open} onOpenChange={requestClose} modal>
        <AppDialogContent class="max-w-md" portalToBody>
          <AppDialogHeader>
            <AppDialogTitle>搜索偏好</AppDialogTitle>
            <AppDialogDescription>
              配置管理页源列表的本地筛选规则。未勾选任何范围时按全部字段匹配。
            </AppDialogDescription>
          </AppDialogHeader>

          <div class="space-y-5 px-6 py-2">
            <section class="space-y-2">
              <h3 class="text-sm font-medium">搜索范围</h3>
              <p class="text-xs text-muted-foreground">可多选，也可全部不选（不选时按全部字段匹配）。</p>
              <div class="flex flex-wrap gap-3">
                <For each={SCOPE_OPTIONS}>
                  {(opt) => (
                    <div class="flex items-center gap-2 text-sm">
                      <Checkbox
                        id={`subscribe-manage-scope-${opt.id}`}
                        checked={draft().scopes.includes(opt.id)}
                        onChange={(checked) => toggleScope(opt.id, checked)}
                      />
                      <Label for={`subscribe-manage-scope-${opt.id}`}>{opt.label}</Label>
                    </div>
                  )}
                </For>
              </div>
            </section>

            <section class="space-y-2">
              <h3 class="text-sm font-medium">搜索模式</h3>
              <p class="text-xs text-muted-foreground">单选，须勾选其中一项。</p>
              <div class="space-y-2">
                <For each={MODE_OPTIONS}>
                  {(opt) => (
                    <label class="flex cursor-pointer items-start gap-2 text-sm">
                      <Checkbox
                        checked={draft().mode === opt.id}
                        onChange={(checked) => {
                          if (checked) setDraft({ ...draft(), mode: opt.id });
                        }}
                      />
                      <span class="min-w-0">
                        <span class="font-medium">{opt.label}</span>
                        <span class="mt-0.5 block text-xs text-muted-foreground">{opt.hint}</span>
                      </span>
                    </label>
                  )}
                </For>
              </div>
            </section>
          </div>

          <AppDialogFooter>
            <Button type="button" variant="outline" onClick={() => requestClose(false)}>
              取消
            </Button>
            <Button type="button" onClick={save}>
              保存
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>

      <AppDialog open={discardOpen()} onOpenChange={setDiscardOpen}>
        <AppDialogContent class="max-w-sm" portalToBody portalZClass="z-[80]">
          <AppDialogHeader>
            <AppDialogTitle>放弃未保存的修改？</AppDialogTitle>
            <AppDialogDescription>
              搜索偏好已更改但尚未保存。关闭将丢弃这些修改。
            </AppDialogDescription>
          </AppDialogHeader>
          <AppDialogFooter>
            <Button type="button" variant="outline" onClick={() => setDiscardOpen(false)}>
              继续编辑
            </Button>
            <Button type="button" variant="destructive" onClick={closeWithoutCheck}>
              放弃修改
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>
    </>
  );
}
