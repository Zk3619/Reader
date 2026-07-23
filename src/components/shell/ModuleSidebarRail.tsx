/**
 * 桌面独立模式：模块子页第二固定侧栏
 */

import { Show } from 'solid-js';
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import type { PageType } from '@/components/shell/Navigation';
import { normalizePageType } from '@/lib/media-shelf/compat-keys';
import {
  getActiveModuleNavIdForShell,
  navigateModuleNav,
} from '@/lib/modules/module-nav-registry';
import { ReaderModuleSidebarSection } from '@/components/media/reader/ReaderModuleSidebarSection';
import { ModuleSidebarNavSection } from '@/components/shell/ModuleSidebarNavSection';
import { resolveModuleRailWidth } from '@/lib/shell/layout';
import { ThemedComponentBackground } from '@/components/theme/ThemedComponentBackground';
import { componentDataAttr } from '@/lib/theme/preview/component-registry';
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/shared/icons';
import { sidebarNavButtonClass, sidebarNavMenuClass, sidebarNavMenuItemClass } from '@/lib/shell/sidebar-nav-button-class';
import { sidebarIconRailScroll, scrollGutterAuto } from '@/lib/ui/viewport-classes';
import type { RecentReadBook } from '@/lib/bookshelf/recent-reading';

export interface ModuleSidebarRailProps {
  shellPage: PageType;
  offsetTopAppBar?: boolean;
  /** 主壳侧栏展开态（决定本栏 left 偏移） */
  mainSidebarExpanded?: boolean;
  /** 模块侧栏自身展开态（与主侧栏独立） */
  moduleRailExpanded?: boolean;
  onToggleModuleRail?: () => void;
  recentBooks?: RecentReadBook[];
  onOpenRecentBook?: (book: RecentReadBook) => void;
  onOpenReaderRecord?: () => void;
}

export function ModuleSidebarRail(props: ModuleSidebarRailProps) {
  const shellPage = () => normalizePageType(props.shellPage);
  const activeId = () => getActiveModuleNavIdForShell(shellPage());
  const mainExpanded = () => props.mainSidebarExpanded !== false;
  const moduleExpanded = () => props.moduleRailExpanded !== false;
  const isCollapsed = () => !moduleExpanded();
  const railLeft = () =>
    mainExpanded() ? 'var(--sidebar-width)' : 'var(--sidebar-width-icon)';
  const railWidth = () => resolveModuleRailWidth(moduleExpanded());

  return (
    <aside
      class={cn(
        'group fixed bottom-0 z-40 flex min-h-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar transition-[left,width] duration-200 ease-linear',
        props.offsetTopAppBar
          ? 'top-[calc(var(--app-bar-height)+var(--safe-area-top-effective))]'
          : 'top-0',
      )}
      style={{ width: railWidth(), left: railLeft() }}
      data-state={moduleExpanded() ? 'expanded' : 'collapsed'}
      data-collapsible={isCollapsed() ? 'icon' : undefined}
      {...componentDataAttr('moduleSidebarRail')}
    >
      <ThemedComponentBackground componentId="sidebar" />
      <div class="relative z-1 flex min-h-0 flex-1 flex-col">
        <div
          class={cn(
            "relative min-h-0 flex-1",
            isCollapsed()
              ? sidebarIconRailScroll
              : cn("overflow-y-auto overscroll-contain", scrollGutterAuto),
          )}
          {...componentDataAttr('sidebarNav')}
        >
          <ThemedComponentBackground componentId="sidebarNav" />
          <div class="relative z-1 px-0 py-0">
            <Show
              when={shellPage() === 'reader'}
              fallback={
                <ModuleSidebarNavSection
                  shellPage={shellPage()}
                  collapsed={isCollapsed()}
                  activeTab={activeId}
                  onTabChange={(id) => navigateModuleNav(shellPage(), id)}
                />
              }
            >
              <ReaderModuleSidebarSection
                collapsed={isCollapsed()}
                activeTab={activeId}
                onTabChange={(id) => navigateModuleNav('reader', id)}
                recentBooks={props.recentBooks}
                onOpenRecentBook={props.onOpenRecentBook}
                onOpenReaderRecord={props.onOpenReaderRecord}
              />
            </Show>
          </div>
        </div>

        <SidebarFooter
          class={cn(
            "relative mt-auto shrink-0 overflow-hidden border-t border-sidebar-border",
            isCollapsed() && "px-0",
          )}
          {...componentDataAttr('moduleSidebarFooter')}
        >
          <ThemedComponentBackground componentId="sidebarFooter" />
          <div class="relative z-1">
            <SidebarMenu class={sidebarNavMenuClass(isCollapsed())}>
              <SidebarMenuItem class={sidebarNavMenuItemClass(isCollapsed())}>
                <SidebarMenuButton
                  onClick={() => props.onToggleModuleRail?.()}
                  tooltip={isCollapsed() ? '展开侧边栏' : '收起侧边栏'}
                  class={sidebarNavButtonClass(false, {
                    collapsed: isCollapsed(),
                    extra: cn('group/toggle-button [&_svg]:size-4'),
                  })}
                >
                  <Show
                    when={isCollapsed()}
                    fallback={
                      <>
                        <ChevronLeftIcon class="h-4 w-4 transition-colors duration-200" size={16} />
                        <span class={cn('font-medium transition-colors duration-200', isCollapsed() && 'hidden')}>
                          收起
                        </span>
                      </>
                    }
                  >
                    <ChevronRightIcon
                      class={cn('h-4 w-4 transition-colors duration-200', isCollapsed() && 'mx-auto')}
                      size={16}
                    />
                  </Show>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </div>
        </SidebarFooter>
      </div>
    </aside>
  );
}
