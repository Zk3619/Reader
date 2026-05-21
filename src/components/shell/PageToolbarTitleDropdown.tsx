/**
 * PageToolbar 标题+描述：可选下拉（DropdownMenu）
 */

import { Show, type JSX } from 'solid-js';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  APP_DROPDOWN_MENU_TITLE_LIST_CLASS,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import { PageToolbarTitleText } from '@/components/shell/PageToolbar';
import { cn } from '@/lib/utils';
import { ChevronDownIcon } from '@/components/shared/icons';

const TITLE_BLOCK_PADDING = 'rounded-md px-2.5 py-2';

const TITLE_DROPDOWN_TRIGGER_CLASS = cn(
  'group/trigger inline-grid max-w-full w-auto grid-cols-[auto_auto] items-center gap-x-2',
  'h-auto bg-transparent text-left font-normal',
  TITLE_BLOCK_PADDING,
  'hover:bg-accent/50 focus:bg-accent/50 focus-visible:outline-none',
  'data-expanded:bg-accent/50'
);

function TitleDropdownChevron() {
  return (
    <ChevronDownIcon
      class="size-3 shrink-0 transition-transform duration-200 group-data-expanded/trigger:rotate-180"
      size={12}
    />
  );
}

export interface PageToolbarTitleDropdownProps {
  title: string;
  description?: string | JSX.Element;
  /** 为 false 时仅展示标题+描述，无下拉与箭头 */
  dropdownEnabled?: boolean;
  /**
   * 选中项变化时传入（如分组 id、筛选 key），用于重置 Kobalte 下拉内部状态；
   * 避免 HMR 后菜单高亮与标题/页面内容不一致。
   */
  selectionKey?: string | number;
  children?: JSX.Element;
  /** 内容面板布局：title 固定宽；titleWide 为书架分组下拉 */
  contentLayout?: 'title' | 'titleWide';
  /** 在 layout 默认类之上追加的 class */
  contentClass?: string;
  /** 列表容器额外 class */
  listClass?: string;
}

export function PageToolbarTitleDropdown(props: PageToolbarTitleDropdownProps) {
  const dropdownEnabled = () => props.dropdownEnabled !== false;
  const menuKey = () => String(props.selectionKey ?? props.title);

  return (
    <Show
      when={dropdownEnabled()}
      fallback={
        <div class={cn('w-max max-w-full', TITLE_BLOCK_PADDING)}>
          <PageToolbarTitleText title={props.title} description={props.description} />
        </div>
      }
    >
      <Show when={menuKey()} keyed>
        <AppDropdownMenu>
          <AppDropdownMenuTrigger class={TITLE_DROPDOWN_TRIGGER_CLASS}>
            <PageToolbarTitleText title={props.title} description={props.description} />
            <span class="flex shrink-0 items-center justify-center self-center">
              <TitleDropdownChevron />
            </span>
          </AppDropdownMenuTrigger>
          <AppDropdownMenuContent
            layout={props.contentLayout ?? 'title'}
            class={props.contentClass}
          >
            <div class={cn(APP_DROPDOWN_MENU_TITLE_LIST_CLASS, props.listClass)}>
              {props.children}
            </div>
          </AppDropdownMenuContent>
        </AppDropdownMenu>
      </Show>
    </Show>
  );
}
