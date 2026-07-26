/**
 * 源/规则列表项操作区（音乐 UserApi·MusicFree / 影视 TVBox·番剧）
 * - 列表容器宽 ≥ md：展开 leading + 图标按钮
 * - 列表容器宽 < md：仅保留开关 +「更多」；leading 复选与操作一并收纳到下拉
 */

import {
  createContext,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  useContext,
  type Accessor,
  type Component,
  type JSX,
  type ParentProps,
} from 'solid-js';
import { EllipsisVertical } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import {
  AppDropdownMenu,
  AppDropdownMenuCheckboxItem,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuIconTrigger,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import { cn } from '@/lib/utils';

/** 与 Tailwind `md` 断点一致；按列表容器宽度判定，非 window */
export const SOURCE_LIST_MD_PX = 768;

type SourceListLayoutContextValue = {
  compact: Accessor<boolean>;
};

const SourceListLayoutContext = createContext<SourceListLayoutContextValue>();

export function useSourceListCompact(): Accessor<boolean> {
  const ctx = useContext(SourceListLayoutContext);
  return ctx?.compact ?? (() => false);
}

export type SourceListLayoutRootProps = ParentProps<{
  class?: string;
  /** 默认 ul；AppManualRadioGroup 等可传 div */
  as?: 'ul' | 'div';
  role?: JSX.HTMLAttributes<HTMLElement>['role'];
  'aria-label'?: string;
}>;

/**
 * 包裹列表滚动区：ResizeObserver 监听自身宽度，向子项提供 compact 状态。
 */
export function SourceListLayoutRoot(props: SourceListLayoutRootProps) {
  const [compact, setCompact] = createSignal(false);
  let rootEl: HTMLElement | undefined;

  const measure = () => {
    const w = rootEl?.clientWidth ?? 0;
    setCompact(w > 0 && w < SOURCE_LIST_MD_PX);
  };

  onMount(() => {
    measure();
    if (!rootEl || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(rootEl);
    onCleanup(() => ro.disconnect());
  });

  const setRef = (el: HTMLElement) => {
    rootEl = el;
  };

  return (
    <SourceListLayoutContext.Provider value={{ compact }}>
      <Show
        when={props.as === 'div'}
        fallback={
          <ul
            ref={setRef}
            class={props.class}
            role={props.role}
            aria-label={props['aria-label']}
          >
            {props.children}
          </ul>
        }
      >
        <div
          ref={setRef}
          class={props.class}
          role={props.role}
          aria-label={props['aria-label']}
        >
          {props.children}
        </div>
      </Show>
    </SourceListLayoutContext.Provider>
  );
}

export type SourceListItemAction = {
  id: string;
  label: string;
  icon: Component<{ class?: string }>;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
  hidden?: boolean;
};

export type SourceListItemLeadingMenu = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

export type SourceListItemActionsProps = {
  class?: string;
  /**
   * 宽屏行内展示（如「更新提示」复选）。
   * 窄屏（compact）时隐藏，改由 leadingMenu 进入「更多」下拉。
   */
  leading?: JSX.Element;
  /** 窄屏时收纳到「更多」菜单的复选项（通常与 leading 对应） */
  leadingMenu?: SourceListItemLeadingMenu;
  /** 始终可见的启用开关 */
  enabledSwitch?: JSX.Element;
  actions: SourceListItemAction[];
  moreAriaLabel?: string;
  portalZClass?: string;
};

const ICON_BTN = 'h-8 w-8 shrink-0';

/** 操作槽：固定子项宽度；leading 与开关留足间距，避免文字贴开关 */
const ACTIONS_SLOT = 'flex w-max shrink-0 items-center justify-end gap-2';

export function SourceListItemActions(props: SourceListItemActionsProps) {
  const compact = useSourceListCompact();
  const visibleActions = () => props.actions.filter((a) => !a.hidden);
  const showMoreMenu = () =>
    visibleActions().length > 0 || Boolean(props.leadingMenu);

  return (
    <div class={cn(ACTIONS_SLOT, props.class)}>
      <Show when={props.leading && !compact()}>
        <div class="mr-1 flex h-8 w-19 shrink-0 items-center justify-start gap-1.5 whitespace-nowrap text-[11px] text-muted-foreground">
          {props.leading}
        </div>
      </Show>

      <Show when={props.enabledSwitch}>
        <div class="flex h-8 w-10 shrink-0 items-center justify-center">
          {props.enabledSwitch}
        </div>
      </Show>

      <Show
        when={compact()}
        fallback={
          <For each={visibleActions()}>
            {(action) => (
              <AppTooltip>
                <AppTooltipTrigger as="div">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    class={cn(
                      ICON_BTN,
                      action.destructive &&
                        'text-destructive hover:bg-destructive/10 hover:text-destructive',
                    )}
                    disabled={action.disabled}
                    aria-label={action.label}
                    onClick={() => action.onSelect()}
                  >
                    <action.icon class="h-4 w-4" />
                  </Button>
                </AppTooltipTrigger>
                <AppTooltipContent layer="viewer">{action.label}</AppTooltipContent>
              </AppTooltip>
            )}
          </For>
        }
      >
        <Show when={showMoreMenu()}>
          <AppDropdownMenu>
            <AppTooltip>
              <AppTooltipTrigger as="div">
                <AppDropdownMenuTrigger
                  as={(triggerProps: Record<string, unknown>) => (
                    <AppDropdownMenuIconTrigger
                      triggerProps={triggerProps}
                      class={ICON_BTN}
                      aria-label={props.moreAriaLabel ?? '更多操作'}
                    >
                      <EllipsisVertical class="h-4 w-4" />
                      <span class="sr-only">{props.moreAriaLabel ?? '更多'}</span>
                    </AppDropdownMenuIconTrigger>
                  )}
                />
              </AppTooltipTrigger>
              <AppTooltipContent layer="viewer">更多</AppTooltipContent>
            </AppTooltip>
            <AppDropdownMenuContent
              layout="compact"
              class="min-w-40"
              portalZClass={props.portalZClass ?? 'z-[70]'}
            >
              <Show when={props.leadingMenu}>
                {(menu) => (
                  <>
                    <AppDropdownMenuCheckboxItem
                      checked={menu().checked}
                      disabled={menu().disabled}
                      onChange={menu().onChange}
                      closeOnSelect={false}
                    >
                      {menu().label}
                    </AppDropdownMenuCheckboxItem>
                    <Show when={visibleActions().length > 0}>
                      <AppDropdownMenuSeparator />
                    </Show>
                  </>
                )}
              </Show>
              <For each={visibleActions()}>
                {(action) => (
                  <AppDropdownMenuItem
                    class={cn(
                      'gap-2',
                      action.destructive && 'text-destructive focus:text-destructive',
                    )}
                    disabled={action.disabled}
                    onSelect={() => action.onSelect()}
                  >
                    <action.icon class="h-4 w-4 shrink-0" />
                    <span>{action.label}</span>
                  </AppDropdownMenuItem>
                )}
              </For>
            </AppDropdownMenuContent>
          </AppDropdownMenu>
        </Show>
      </Show>
    </div>
  );
}

/**
 * 列表行统一：
 * - 正常宽度占满容器
 * - 容器过窄时由内容最小宽度撑开，并交给列表根节点横向滚动
 */
export const SOURCE_LIST_ROW_CLASS =
  'flex w-full min-w-max items-center gap-2 rounded-md border px-2 py-1.5 text-sm';

/**
 * 名称/主信息区固定保留 12rem；剩余空间可扩展，文本在该槽内截断。
 * 禁止缩到 0，否则窄列表只剩复选框与操作按钮。
 */
export const SOURCE_LIST_MAIN_CLASS = 'w-48 min-w-48 flex-1';
