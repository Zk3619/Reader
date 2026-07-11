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
import { ReaderModuleSidebarSection } from '@/components/reader/ReaderModuleSidebarSection';
import { ModuleSidebarNavSection } from '@/components/shell/ModuleSidebarNavSection';
import { resolveModuleRailWidth } from '@/lib/shell/layout';
import { ThemedComponentBackground } from '@/components/theme/ThemedComponentBackground';
import { componentDataAttr } from '@/lib/theme/preview/component-registry';
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/shared/icons';
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

function sidebarNavButtonClass(active: boolean, extra?: string) {
  return cn(
    'relative overflow-hidden rounded-xl border-l-2 transition-colors duration-200',
    'text-sidebar-foreground/70 [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-current',
    active ? 'border-l-primary bg-primary/10! text-primary! font-semibold shadow-sm' : 'border-l-transparent',
    !active && 'hover:bg-primary/10 hover:text-primary hover:shadow-sm',
    extra,
  );
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
        'group fixed bottom-0 z-40 flex flex-col overflow-hidden border-r border-sidebar-border bg-sidebar transition-[left,width] duration-200 ease-linear',
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
        <div class="relative min-h-0 flex-1 overflow-hidden" {...componentDataAttr('sidebarNav')}>
          <ThemedComponentBackground componentId="sidebarNav" />
          <div class="relative z-1 min-h-0 flex-1 overflow-y-auto px-0 py-0">
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
          class="relative mt-auto shrink-0 overflow-hidden border-t border-sidebar-border"
          {...componentDataAttr('moduleSidebarFooter')}
        >
          <ThemedComponentBackground componentId="sidebarFooter" />
          <div class="relative z-1">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => props.onToggleModuleRail?.()}
                  tooltip={isCollapsed() ? '展开侧边栏' : '收起侧边栏'}
                  class={sidebarNavButtonClass(
                    false,
                    cn('group/toggle-button h-10 [&_svg]:size-4', isCollapsed() && 'justify-center'),
                  )}
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
