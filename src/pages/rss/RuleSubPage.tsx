/**
 * 规则订阅管理（对齐 Legado RuleSubActivity）
 */

import { createSignal, createMemo, For, Show } from 'solid-js';
import { useBackHandler } from '@/lib/navigation/use-back-handler';
import { PageToolbar } from '@/components/shell/PageToolbar';
import { PageToolbarTitleDropdown } from '@/components/shell/PageToolbarTitleDropdown';
import { RssSourcesManageToolbarLeading } from '@/components/rss/RssSourcesManagePageToolbar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  NumberField,
  NumberFieldDecrementTrigger,
  NumberFieldDescription,
  NumberFieldGroup,
  NumberFieldIncrementTrigger,
  NumberFieldInput,
  NumberFieldLabel,
} from '@/components/ui/number-field';
import { AppTextField, AppTextFieldInput } from '@/components/shared/AppTextField';
import {
  AppDialog,
  AppDialogContent,
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
  APP_SELECT_TRIGGER_FORM,
} from '@/components/shared/AppSelect';
import { showAppToast } from '@/components/shared/AppToasts';
import * as ruleSubsDb from '@/lib/database/rule-subs';
import {
  RULE_SUB_TYPE_BOOK,
  RULE_SUB_TYPE_RSS,
  RULE_SUB_TYPE_REPLACE,
  applyRuleSubUpdate,
} from '@/lib/rss-source';
import type { RuleSub } from '@/types';
import { cn } from '@/lib/utils';
import { mainShellPageRoot } from '@/lib/ui/viewport-classes';
import { PlusIcon, RefreshIcon, XIcon } from '@/components/shared/icons';

const RULE_SUB_TYPE_OPTIONS = [
  { value: RULE_SUB_TYPE_BOOK, label: '书源' },
  { value: RULE_SUB_TYPE_RSS, label: '订阅源' },
  { value: RULE_SUB_TYPE_REPLACE, label: '替换规则' },
] as const;

const RULE_SUB_TYPE_LABEL: Record<number, string> = {
  [RULE_SUB_TYPE_BOOK]: '书源',
  [RULE_SUB_TYPE_RSS]: '订阅源',
  [RULE_SUB_TYPE_REPLACE]: '替换规则',
};

function emptyRuleSub(customOrder: number): RuleSub {
  return {
    name: '新规则订阅',
    url: '',
    type: RULE_SUB_TYPE_RSS,
    customOrder,
    autoUpdate: false,
    update: 0,
    updateInterval: 24,
    silentUpdate: true,
  };
}

/** 避免 label + Kobalte Control 双重切换；由行容器统一处理点击 */
function RuleSubCheckRow(props: {
  checked: boolean;
  label: string;
  description?: string;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const rowClass = () =>
    cn(
      'flex items-center justify-between gap-3 rounded-md px-1 py-1',
      props.disabled
        ? 'cursor-not-allowed opacity-60'
        : 'cursor-pointer hover:bg-muted/40',
    );

  const toggle = () => {
    if (props.disabled) return;
    props.onChange(!props.checked);
  };

  return (
    <div
      role="button"
      tabIndex={props.disabled ? -1 : 0}
      class={rowClass()}
      onClick={toggle}
      onKeyDown={(e) => {
        if (props.disabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      }}
    >
      <div class="min-w-0">
        <span class="text-sm text-foreground select-none">{props.label}</span>
        <Show when={props.description}>
          <p class="mt-0.5 text-xs text-muted-foreground">{props.description}</p>
        </Show>
      </div>
      <Checkbox checked={props.checked} disabled={props.disabled} class="pointer-events-none" />
    </div>
  );
}

export interface RuleSubPageProps {
  onClose?: () => void;
  onImportBookFromUrl?: (url: string) => void;
  onImportRssFromUrl?: (url: string) => void;
  onImportReplaceFromUrl?: (url: string) => void;
}

export function RuleSubPage(props: RuleSubPageProps) {
  const [subs, setSubs] = createSignal<RuleSub[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [editOpen, setEditOpen] = createSignal(false);
  const [draft, setDraft] = createSignal<RuleSub>(emptyRuleSub(Date.now()));
  const [updatingId, setUpdatingId] = createSignal<number | null>(null);

  useBackHandler(() => () => {
    props.onClose?.();
    return true;
  });

  const reload = async () => {
    setLoading(true);
    try {
      setSubs(await ruleSubsDb.getAllRuleSubs());
    } finally {
      setLoading(false);
    }
  };

  void reload();

  const filteredSubs = createMemo(() => {
    const q = searchQuery().trim().toLowerCase();
    if (!q) return subs();
    return subs().filter(
      (sub) =>
        sub.name.toLowerCase().includes(q) ||
        sub.url.toLowerCase().includes(q) ||
        (RULE_SUB_TYPE_LABEL[sub.type] ?? '').includes(q),
    );
  });

  const pageDescription = () => {
    const total = subs().length;
    const shown = filteredSubs().length;
    if (total === 0) return '暂无规则订阅';
    if (searchQuery().trim() && shown !== total) return `共 ${total} 条 · 显示 ${shown} 条`;
    return `共 ${total} 条规则订阅`;
  };

  const openNew = async () => {
    const maxOrder = await ruleSubsDb.getMaxRuleSubOrder();
    setDraft(emptyRuleSub(maxOrder + 1));
    setEditOpen(true);
  };

  const openEdit = (sub: RuleSub) => {
    setDraft({ ...sub });
    setEditOpen(true);
  };

  const openImportForSub = (sub: RuleSub) => {
    const url = sub.url.trim();
    if (!url) {
      showAppToast({ title: 'URL 为空', variant: 'destructive' });
      return;
    }
    switch (sub.type) {
      case RULE_SUB_TYPE_BOOK:
        props.onImportBookFromUrl?.(url);
        break;
      case RULE_SUB_TYPE_RSS:
        props.onImportRssFromUrl?.(url);
        break;
      case RULE_SUB_TYPE_REPLACE:
        props.onImportReplaceFromUrl?.(url);
        break;
      default:
        showAppToast({ title: '未知订阅类型', variant: 'destructive' });
    }
  };

  const saveDraft = async () => {
    const d = draft();
    if (!d.name.trim() || !d.url.trim()) {
      showAppToast({ title: '请填写名称和 URL', variant: 'destructive' });
      return;
    }
    const existing = await ruleSubsDb.findRuleSubByUrl(d.url.trim());
    if (existing && existing.id !== d.id) {
      showAppToast({
        title: 'URL 已存在',
        description: `与「${existing.name}」重复`,
        variant: 'destructive',
      });
      return;
    }
    await ruleSubsDb.upsertRuleSub(d);
    setEditOpen(false);
    await reload();
    showAppToast({ title: '已保存' });
  };

  const remove = async (id: number) => {
    await ruleSubsDb.deleteRuleSub(id);
    await reload();
    showAppToast({ title: '已删除' });
  };

  const handleUpdate = async (sub: RuleSub) => {
    if (sub.id == null) return;
    setUpdatingId(sub.id);
    try {
      if (sub.silentUpdate) {
        const count = await applyRuleSubUpdate(sub);
        const typeLabel = RULE_SUB_TYPE_LABEL[sub.type] ?? '规则';
        showAppToast({
          title: '更新完成',
          description: `导入 ${count} 条${typeLabel}`,
        });
      } else {
        openImportForSub(sub);
      }
      await reload();
    } catch (e) {
      showAppToast({
        title: '更新失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const setDraftAutoUpdate = (checked: boolean) => {
    setDraft((d) => ({
      ...d,
      autoUpdate: checked,
      updateInterval: checked ? (d.updateInterval > 0 ? d.updateInterval : 24) : 0,
      silentUpdate: checked ? d.silentUpdate : false,
    }));
  };

  const setDraftUpdateInterval = (interval: number) => {
    const value = Number.isFinite(interval) ? Math.max(0, Math.round(interval)) : 0;
    setDraft((d) => ({
      ...d,
      updateInterval: value,
      autoUpdate: value > 0 ? d.autoUpdate : false,
      silentUpdate: value > 0 ? d.silentUpdate : false,
    }));
  };

  return (
    <div class={cn('@container flex min-h-0 flex-1 flex-col', mainShellPageRoot)}>
      <PageToolbar
        title="规则订阅"
        description={pageDescription()}
        titleSlot={
          <PageToolbarTitleDropdown
            title="规则订阅"
            description={pageDescription()}
            dropdownEnabled={false}
          />
        }
        leading={<RssSourcesManageToolbarLeading onBack={() => props.onClose?.()} />}
      >
        <div class="relative flex h-9 w-40 sm:w-52 items-center rounded-md border border-input bg-transparent text-sm">
          <input
            type="text"
            placeholder="搜索规则订阅"
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            class="h-full w-full flex-1 bg-transparent px-3 py-2 placeholder:text-muted-foreground focus-visible:outline-none rounded-md"
            aria-label="搜索规则订阅"
          />
        </div>
        <Button variant="ghost" size="icon" class="h-9 w-9 shrink-0" onClick={() => void openNew()}>
          <PlusIcon class="h-4 w-4" />
          <span class="sr-only">添加规则订阅</span>
        </Button>
      </PageToolbar>

      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        <Show when={loading()}>
          <div class="space-y-2 py-2">
            <For each={Array.from({ length: 4 })}>
              {() => <div class="h-20 animate-pulse rounded-xl bg-muted/40" />}
            </For>
          </div>
        </Show>

        <Show when={!loading() && filteredSubs().length === 0}>
          <div class="rounded-2xl border border-border/50 bg-card p-8 text-center text-muted-foreground">
            <p class="mb-4">
              {subs().length === 0 ? '暂无规则订阅' : '没有匹配的规则订阅'}
            </p>
            <Show when={subs().length === 0}>
              <Button onClick={() => void openNew()}>添加规则订阅</Button>
            </Show>
          </div>
        </Show>

        <div class="space-y-2">
          <For each={filteredSubs()}>
            {(sub) => (
              <div class="rounded-xl border border-border/50 bg-card p-4">
                <div
                  class="cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onClick={() => openImportForSub(sub)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openImportForSub(sub);
                    }
                  }}
                >
                  <div class="font-medium text-foreground">{sub.name}</div>
                  <div class="mt-1 text-xs text-muted-foreground">
                    {RULE_SUB_TYPE_LABEL[sub.type] ?? `类型 ${sub.type}`}
                    {sub.autoUpdate ? ` · 每 ${sub.updateInterval}h 自动更新` : ''}
                    {sub.silentUpdate && sub.autoUpdate ? ' · 静默' : ''}
                  </div>
                  <div class="mt-1 truncate text-xs text-muted-foreground">{sub.url}</div>
                </div>
                <div class="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(sub)}>
                    编辑
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    class="gap-1"
                    disabled={updatingId() === sub.id}
                    onClick={() => void handleUpdate(sub)}
                  >
                    <RefreshIcon
                      class={updatingId() === sub.id ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
                    />
                    更新
                  </Button>
                  <Show when={sub.id != null}>
                    <Button
                      size="sm"
                      variant="ghost"
                      class="text-destructive"
                      onClick={() => void remove(sub.id!)}
                    >
                      <XIcon class="h-4 w-4" />
                    </Button>
                  </Show>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>

      <AppDialog open={editOpen()} onOpenChange={setEditOpen} modal>
        <AppDialogContent>
          <AppDialogHeader>
            <AppDialogTitle>{draft().id ? '编辑规则订阅' : '新建规则订阅'}</AppDialogTitle>
          </AppDialogHeader>
          <div class="space-y-3 px-6 py-2">
            <div class="space-y-1.5">
              <label class="text-sm font-medium">类型</label>
              <AppSelect
                value={draft().type}
                onChange={(value) => {
                  if (value == null) return;
                  setDraft((d) => ({ ...d, type: Number(value) }));
                }}
                options={RULE_SUB_TYPE_OPTIONS.map((o) => o.value)}
                itemComponent={(itemProps) => (
                  <AppSelectItem item={itemProps.item}>
                    {RULE_SUB_TYPE_OPTIONS.find((o) => o.value === itemProps.item.rawValue)?.label ??
                      itemProps.item.rawValue}
                  </AppSelectItem>
                )}
              >
                <AppSelectTrigger class={APP_SELECT_TRIGGER_FORM} aria-label="规则订阅类型">
                  <AppSelectValue>
                    {(state) => {
                      const raw = state.selectedOption();
                      const type = typeof raw === 'number' ? raw : Number(raw);
                      return RULE_SUB_TYPE_LABEL[type] ?? '订阅源';
                    }}
                  </AppSelectValue>
                  <AppSelectIcon />
                </AppSelectTrigger>
                <AppSelectContent portalZClass="z-[130]">
                  <AppSelectListbox />
                </AppSelectContent>
              </AppSelect>
            </div>
            <AppTextField>
              <AppTextFieldInput
                placeholder="名称"
                value={draft().name}
                onInput={(e) => setDraft((d) => ({ ...d, name: e.currentTarget.value }))}
              />
            </AppTextField>
            <AppTextField>
              <AppTextFieldInput
                placeholder="远程 JSON 列表 URL"
                value={draft().url}
                onInput={(e) => setDraft((d) => ({ ...d, url: e.currentTarget.value }))}
              />
            </AppTextField>
            <RuleSubCheckRow
              checked={draft().autoUpdate}
              label="自动更新"
              onChange={setDraftAutoUpdate}
            />
            <NumberField
              class="space-y-1.5"
              rawValue={draft().updateInterval}
              onRawValueChange={(value) => {
                if (!Number.isFinite(value) || value === draft().updateInterval) return;
                setDraftUpdateInterval(value);
              }}
              minValue={0}
              step={1}
              disabled={!draft().autoUpdate}
            >
              <NumberFieldLabel>更新间隔（小时）</NumberFieldLabel>
              <NumberFieldGroup>
                <NumberFieldInput class="h-10 pr-7" />
                <NumberFieldIncrementTrigger />
                <NumberFieldDecrementTrigger />
              </NumberFieldGroup>
              <NumberFieldDescription>
                到达间隔后自动拉取远程 JSON；设为 0 小时表示不自动更新。
              </NumberFieldDescription>
            </NumberField>
            <RuleSubCheckRow
              checked={draft().silentUpdate}
              label="静默更新"
              description="开启后直接写入本地，不弹出导入选择框"
              disabled={!draft().autoUpdate || draft().updateInterval <= 0}
              onChange={(checked) => setDraft((d) => ({ ...d, silentUpdate: checked }))}
            />
          </div>
          <AppDialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void saveDraft()}>保存</Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>
    </div>
  );
}
