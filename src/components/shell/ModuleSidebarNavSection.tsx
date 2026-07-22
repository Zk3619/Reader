/**
 * 模块侧栏子页导航（阅读以外的模块共用，样式与阅读模块一致）
 */

import { type Accessor, For, Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import {
  sidebarNavButtonClass,
  sidebarNavMenuClass,
  sidebarNavMenuItemClass,
} from '@/lib/shell/sidebar-nav-button-class';
import type { PageType } from '@/components/shell/Navigation';
import { normalizePageType } from '@/lib/media-shelf/compat-keys';
import {
  getModuleNavItems,
} from '@/lib/modules/module-nav-registry';

export interface ModuleSidebarNavSectionProps {
  shellPage: PageType;
  collapsed?: boolean;
  /** 传 Accessor 可在子页切换时保持选中态响应式更新 */
  activeTab: string | Accessor<string>;
  onTabChange: (tabId: string) => void;
}

export function ModuleSidebarNavSection(props: ModuleSidebarNavSectionProps) {
  const shellPage = () => normalizePageType(props.shellPage);
  const items = () => getModuleNavItems(shellPage());
  const isCollapsed = () => props.collapsed ?? false;
  // 始终从 props 读取，避免误传 string 快照时选中态冻住
  const activeTab = (): string => {
    const value = props.activeTab;
    return typeof value === 'function' ? value() : value;
  };

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu class={sidebarNavMenuClass(isCollapsed())}>
          <For each={items()}>
            {(item) => (
              <SidebarMenuItem class={sidebarNavMenuItemClass(isCollapsed())}>
                <SidebarMenuButton
                  isActive={activeTab() === item.id}
                  onClick={() => props.onTabChange(item.id)}
                  tooltip={item.label}
                  class={sidebarNavButtonClass(activeTab() === item.id, {
                    collapsed: isCollapsed(),
                    extra: 'group/menu-button',
                  })}
                >
                  <Show when={item.icon}>
                    <span class={cn('shrink-0', isCollapsed() && 'mx-auto')}>
                      <Dynamic component={item.icon!} class="h-5 w-5" />
                    </span>
                  </Show>
                  <span class={cn('min-w-0 flex-1 truncate font-medium', isCollapsed() && 'hidden')}>
                    {item.label}
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </For>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
