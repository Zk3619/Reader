/**
 * 融合侧栏 / Sheet 内的模块子页导航
 */

import { Show } from 'solid-js';
import { Separator } from '@/components/ui/separator';
import type { PageType } from '@/components/shell/Navigation';
import { normalizePageType } from '@/lib/media-shelf/compat-keys';
import {
  getActiveModuleNavIdForShell,
  navigateModuleNav,
} from '@/lib/modules/module-nav-registry';
import { ReaderModuleSidebarSection } from '@/components/reader/ReaderModuleSidebarSection';
import { ModuleSidebarNavSection } from '@/components/shell/ModuleSidebarNavSection';
import type { RecentReadBook } from '@/lib/bookshelf/recent-reading';

export interface ModuleNavSectionProps {
  shellPage: PageType;
  collapsed?: boolean;
  recentBooks?: RecentReadBook[];
  onOpenRecentBook?: (book: RecentReadBook) => void;
  onOpenReaderRecord?: () => void;
  onNavigate?: () => void;
}

export function ModuleNavSection(props: ModuleNavSectionProps) {
  const shellPage = () => normalizePageType(props.shellPage);
  const activeId = () => getActiveModuleNavIdForShell(shellPage());
  const isCollapsed = () => props.collapsed ?? false;

  const handleNav = (id: string) => {
    navigateModuleNav(shellPage(), id);
    props.onNavigate?.();
  };

  return (
    <>
      <Separator />
      <Show
        when={shellPage() === 'reader'}
        fallback={
          <ModuleSidebarNavSection
            shellPage={shellPage()}
            collapsed={isCollapsed()}
            activeTab={activeId()}
            onTabChange={handleNav}
          />
        }
      >
        <ReaderModuleSidebarSection
          collapsed={props.collapsed}
          activeTab={activeId()}
          onTabChange={handleNav}
          recentBooks={props.recentBooks}
          onOpenRecentBook={props.onOpenRecentBook}
          onOpenReaderRecord={props.onOpenReaderRecord}
        />
      </Show>
    </>
  );
}
