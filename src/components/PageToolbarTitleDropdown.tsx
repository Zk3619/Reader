/**
 * PageToolbar 标题+描述：可选下拉（DropdownMenu）
 */

import { Show, type JSX } from 'solid-js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PageToolbarTitleText } from '@/components/PageToolbar';
import { cn } from '@/lib/utils';
import { maxHTitleMenu } from '@/lib/viewport-classes';
import { ChevronDownIcon } from '@/components/icons';

const TITLE_BLOCK_PADDING = 'rounded-md px-2.5 py-2';

const TITLE_DROPDOWN_TRIGGER_CLASS = cn(
  'group/trigger inline-grid max-w-full w-auto grid-cols-[auto_auto] items-center gap-x-2',
  'h-auto bg-transparent text-left font-normal',
  TITLE_BLOCK_PADDING,
  'hover:bg-accent/50 focus:bg-accent/50 focus-visible:outline-none',
  'data-expanded:bg-accent/50'
);

const TITLE_DROPDOWN_CONTENT_CLASS = 'p-0 w-52 min-w-52 max-w-52 overflow-hidden';

const TITLE_MENU_MAX_HEIGHT = maxHTitleMenu;

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
  /** 覆盖 DropdownMenuContent 的 class（如书架更宽面板） */
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
        <DropdownMenu>
          <DropdownMenuTrigger class={TITLE_DROPDOWN_TRIGGER_CLASS}>
            <PageToolbarTitleText title={props.title} description={props.description} />
            <span class="flex shrink-0 items-center justify-center self-center">
              <TitleDropdownChevron />
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent class={cn(TITLE_DROPDOWN_CONTENT_CLASS, props.contentClass)}>
            <div
              class={cn(
                'flex w-full min-w-0 flex-col gap-2 p-3 overflow-y-auto overflow-x-hidden overscroll-contain',
                TITLE_MENU_MAX_HEIGHT,
                props.listClass
              )}
            >
              {props.children}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </Show>
    </Show>
  );
}
