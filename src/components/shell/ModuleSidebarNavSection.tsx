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

function sidebarNavButtonClass(active: boolean, extra?: string) {
  return cn(
    'relative overflow-hidden rounded-xl border-l-2 transition-colors duration-200',
    'text-sidebar-foreground/70 [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-current',
    active ? 'border-l-primary bg-primary/10! text-primary! font-semibold shadow-sm' : 'border-l-transparent',
    !active && 'hover:bg-primary/10 hover:text-primary hover:shadow-sm',
    extra,
  );
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
        <SidebarMenu>
          <For each={items()}>
            {(item) => (
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={activeTab() === item.id}
                  onClick={() => props.onTabChange(item.id)}
                  tooltip={item.label}
                  class={sidebarNavButtonClass(
                    activeTab() === item.id,
                    cn('group/menu-button h-10', isCollapsed() && 'justify-center'),
                  )}
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
