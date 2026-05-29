/**
 * 单书源发现书籍列表（带返回页头），从书源页等入口进入时使用
 */

import { createSignal } from 'solid-js';
import { ExplorePaginationPreferenceDialog } from '@/components/explore/ExplorePaginationPreferenceDialog';
import { PageHeader } from '@/components/shell/PageHeader';
import { RefreshIcon, MoreIcon, Settings2Icon } from '@/components/shared/icons';
import type { BookSource } from '@/types';
import type { Book, SearchBook } from '@/types';
import type { ExploreSection } from '@/lib/book-source/explore-sections';
import { pageCacheStore } from '@/stores/page-cache';
import { ExploreSourcePageContent } from '@/pages/explore/ExploreSourcePageContent';

export interface ExploreSourcePageProps {
  source: BookSource;
  section: ExploreSection;
  onBack: () => void;
  onOpenBook: (book: Book) => void;
  onOpenBookInfo?: (source: BookSource, book: SearchBook) => void;
}

export function ExploreSourcePage(props: ExploreSourcePageProps) {
  const [refreshKey, setRefreshKey] = createSignal(0);
  const [paginationPreferenceOpen, setPaginationPreferenceOpen] = createSignal(false);

  const sectionUrl = () => props.section.url ?? '';

  const refresh = () => {
    const cacheSourceId = props.source.sourceId || props.source.sourceName;
    if (cacheSourceId && typeof cacheSourceId === 'string') {
      pageCacheStore.clearExploreCache(cacheSourceId, sectionUrl());
    }
    setRefreshKey((k) => k + 1);
  };

  return (
    <section class="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background">
      <PageHeader
        onBack={props.onBack}
        title={`${props.source.sourceName} · ${props.section.title}`}
        subtitle="发现"
        pinToTop
        draggable={true}
        actions={[
          {
            icon: RefreshIcon,
            label: '刷新',
            onClick: refresh,
            showTooltip: true,
          },
          {
            icon: MoreIcon,
            label: '更多',
            isDropdown: true,
            dropdownItems: [
              {
                icon: Settings2Icon,
                label: '分页偏好',
                onClick: () => setPaginationPreferenceOpen(true),
              },
            ],
          },
        ]}
        class="border-b"
      />
      <ExploreSourcePageContent
        class="min-h-0 flex-1 py-4 px-1"
        source={props.source}
        section={props.section}
        refreshKey={refreshKey()}
        onOpenBook={props.onOpenBook}
        onOpenBookInfo={props.onOpenBookInfo}
      />
      <ExplorePaginationPreferenceDialog
        open={paginationPreferenceOpen()}
        onOpenChange={setPaginationPreferenceOpen}
      />
    </section>
  );
}
