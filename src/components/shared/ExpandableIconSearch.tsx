/**
 * 页头可展开搜索：折叠为 ghost 图标按钮；展开后输入框向左延伸。
 * 展开布局（同一边框内）：[input] | [clear?] [search]
 */

import { Show, createEffect, createSignal, mergeProps, onCleanup, type JSX } from 'solid-js';
import { Button } from '@/components/ui/button';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import { AppTextInputContextMenu } from '@/components/shared/AppTextInputContextMenu';
import { SearchIcon, XIcon } from '@/components/shared/icons';
import { cn } from '@/lib/utils';

export type ExpandableIconSearchProps = {
  value: string;
  onValueChange: (value: string) => void;
  /** Enter 或展开后再次点击搜索按钮 */
  onSearch?: (value: string) => void;
  placeholder?: string;
  /** 折叠态 tooltip / sr-only */
  tooltip?: string;
  'aria-label'?: string;
  class?: string;
  inputClass?: string;
  /** 受控展开 */
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  /** 非受控初始展开 */
  defaultExpanded?: boolean;
  disabled?: boolean;
  /** 挂到输入容器（下拉提示定位等） */
  boxRef?: (el: HTMLDivElement | undefined) => void;
  inputRef?: (el: HTMLInputElement | undefined) => void;
  onInputFocus?: () => void;
  onInputBlur?: () => void;
  onInputKeyDown?: (e: KeyboardEvent) => void;
  /** 展开区左侧额外内容（少用） */
  leading?: JSX.Element;
};

/** 隐藏 type=search 的浏览器原生清除按钮 */
const HIDE_NATIVE_SEARCH_CANCEL =
  '[&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden [&::-ms-clear]:hidden';

export function ExpandableIconSearch(rawProps: ExpandableIconSearchProps) {
  const props = mergeProps(
    {
      placeholder: '搜索',
      tooltip: '搜索',
      'aria-label': '搜索',
      defaultExpanded: false,
    },
    rawProps,
  );

  const [internalExpanded, setInternalExpanded] = createSignal(props.defaultExpanded);
  const isControlled = () => props.expanded !== undefined;
  const expanded = () => (isControlled() ? !!props.expanded : internalExpanded());

  const setExpanded = (next: boolean) => {
    if (!isControlled()) setInternalExpanded(next);
    props.onExpandedChange?.(next);
  };

  const [inputEl, setInputEl] = createSignal<HTMLInputElement | undefined>();
  const valueRef: { current: string } = { current: props.value };
  let blurCloseTimer: ReturnType<typeof setTimeout> | null = null;

  createEffect(() => {
    valueRef.current = props.value;
    if (props.value.trim()) setExpanded(true);
  });

  onCleanup(() => {
    if (blurCloseTimer) clearTimeout(blurCloseTimer);
  });

  const focusInput = () => {
    queueMicrotask(() => {
      const el = inputEl();
      if (!el) return;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    });
  };

  const expand = () => {
    setExpanded(true);
    focusInput();
  };

  const clearBlurTimer = () => {
    if (blurCloseTimer) {
      clearTimeout(blurCloseTimer);
      blurCloseTimer = null;
    }
  };

  const handleSearchClick = () => {
    if (!expanded()) {
      expand();
      return;
    }
    props.onSearch?.(valueRef.current);
  };

  const handleClear = () => {
    valueRef.current = '';
    props.onValueChange('');
    focusInput();
  };

  return (
    <div class={cn('flex items-center justify-end', props.class)}>
      <Show
        when={expanded()}
        fallback={
          <AppTooltip>
            <AppTooltipTrigger
              as={Button}
              type="button"
              variant="ghost"
              size="icon"
              class="h-9 w-9 shrink-0"
              disabled={props.disabled}
              aria-label={props['aria-label']}
              aria-expanded={false}
              onClick={expand}
            >
              <SearchIcon class="h-4 w-4" />
              <span class="sr-only">{props.tooltip}</span>
            </AppTooltipTrigger>
            <AppTooltipContent>{props.tooltip}</AppTooltipContent>
          </AppTooltip>
        }
      >
        <div
          ref={(el) => props.boxRef?.(el)}
          class={cn(
            'flex h-9 min-w-0 items-center overflow-hidden rounded-md border border-input bg-background text-sm',
            'w-44 animate-in fade-in slide-in-from-right-2 duration-150 sm:w-60',
            props.inputClass,
          )}
        >
          {props.leading}
          <AppTextInputContextMenu
            disabled={props.disabled}
            triggerClass="flex h-full min-w-0 flex-1"
          >
            <input
              ref={(el) => {
                setInputEl(el);
                props.inputRef?.(el);
                if (el && expanded()) {
                  requestAnimationFrame(() => {
                    el.focus();
                    const len = el.value.length;
                    el.setSelectionRange(len, len);
                  });
                }
              }}
              type="search"
              inputMode="search"
              enterkeyhint="search"
              placeholder={props.placeholder}
              value={props.value}
              disabled={props.disabled}
              onInput={(e) => {
                const v = e.currentTarget.value;
                valueRef.current = v;
                props.onValueChange(v);
              }}
              onFocus={() => {
                clearBlurTimer();
                props.onInputFocus?.();
              }}
              onBlur={() => {
                props.onInputBlur?.();
                blurCloseTimer = setTimeout(() => {
                  if (!valueRef.current.trim()) setExpanded(false);
                  blurCloseTimer = null;
                }, 180);
              }}
              onKeyDown={(e) => {
                props.onInputKeyDown?.(e);
                if (e.defaultPrevented) return;
                if (e.key === 'Escape') {
                  e.preventDefault();
                  if (!valueRef.current.trim()) {
                    setExpanded(false);
                    (e.currentTarget as HTMLInputElement).blur();
                  }
                  return;
                }
                if (e.key === 'Enter') {
                  e.preventDefault();
                  props.onSearch?.(valueRef.current);
                }
              }}
              class={cn(
                'h-full min-w-0 flex-1 bg-transparent py-2 pl-2.5 pr-1 placeholder:text-muted-foreground focus-visible:outline-none',
                HIDE_NATIVE_SEARCH_CANCEL,
              )}
              aria-label={props['aria-label']}
            />
          </AppTextInputContextMenu>
          <div
            class="mx-0.5 h-5 w-px shrink-0 bg-border"
            role="separator"
            aria-orientation="vertical"
          />
          <Show when={props.value.length > 0}>
            <button
              type="button"
              class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
              disabled={props.disabled}
              aria-label="清除搜索"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleClear}
            >
              <XIcon class="h-3.5 w-3.5" />
            </button>
          </Show>
          <button
            type="button"
            class="mr-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            disabled={props.disabled}
            aria-label="搜索"
            aria-expanded={true}
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleSearchClick}
          >
            <SearchIcon class="h-4 w-4" />
          </button>
        </div>
      </Show>
    </div>
  );
}
