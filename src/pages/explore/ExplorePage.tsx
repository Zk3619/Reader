/**
 * 探索页：书源切换 + 分类固定区 + 书籍列表（导航独立入口）
 */

import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onMount,
  Show,
  untrack,
} from 'solid-js';
import * as sourcesDb from '@/lib/database/sources';
import type { BookSource } from '@/types';
import type { Book, SearchBook } from '@/types';
import type { ExploreSection } from '@/lib/book-source/explore-sections';
import {
  getExploreSections,
  getExploreSectionsAsync,
  isExploreUrlScript,
  resolveExploreSectionsFromResource,
  shouldShowExploreSectionsSkeleton,
  updateExploreSourceArgument,
} from '@/lib/book-source/explore-sections';
import { ExploreBookListSkeleton } from '@/pages/explore/ExploreBookCardSkeleton';
import { shouldOpenExplorePageForSection } from '@/lib/book-source/explore-section-action';
import {
  explorePageLayoutStore,
  initExplorePageLayoutSettings,
} from '@/stores/explore-page-layout';
import { pageCacheStore } from '@/stores/page-cache';
import { cn } from '@/lib/utils';
import { mainShellPageRoot, mainShellPageScroll } from '@/lib/ui/viewport-classes';
import { PageToolbar } from '@/components/shell/PageToolbar';
import {
  ExploreSourceNav,
  ExploreSourceTitleDropdown,
} from '@/components/explore/ExploreSourceNav';
import { ExplorePageToolbar } from '@/components/explore/ExplorePageToolbar';
import { ExploreSectionsPanel } from '@/components/explore/ExploreSectionsPanel';
import { ExploreSourcePageContent } from '@/pages/explore/ExploreSourcePageContent';

export interface ExplorePageProps {
  onOpenBook: (book: Book) => void;
  onOpenBookInfo?: (source: BookSource, book: SearchBook) => void;
  showPaginationPreferenceDialog?: boolean;
  onPaginationPreferenceDialogChange?: (open: boolean) => void;
}

function sourceHasExplore(source: BookSource): boolean {
  if (source.enableExplore === false) return false;
  return !!(source.exploreUrl?.trim() || source.ruleExplore);
}

function sectionsMatch(a: ExploreSection, b: ExploreSection): boolean {
  return a.title === b.title && (a.url ?? '') === (b.url ?? '');
}

const EXPLORE_PAGE_TITLE = '探索';

export function ExplorePage(props: ExplorePageProps) {
  const [sources, setSources] = createSignal<BookSource[]>([]);
  const [selectedSourceUrl, setSelectedSourceUrl] = createSignal<string | null>(null);
  const [selectedSection, setSelectedSection] = createSignal<ExploreSection | null>(null);
  const [exploreArgsVersion, setExploreArgsVersion] = createSignal(0);
  /** 与 dynamicSections 最后一次 ready 对齐的 args 版本（用于筛选变更后立即骨架屏） */
  const [loadedExploreArgsVersion, setLoadedExploreArgsVersion] = createSignal(-1);
  const [listRefreshKey, setListRefreshKey] = createSignal(0);

  const sourceDropdownEnabled = () => explorePageLayoutStore.settings.sourceDropdownEnabled;
  const sourceTabsEnabled = () => explorePageLayoutStore.settings.sourceTabsEnabled;

  const selectedSource = createMemo(() => {
    const url = selectedSourceUrl();
    if (!url) return null;
    return sources().find((s) => s.sourceUrl === url) ?? null;
  });

  const [dynamicSections] = createResource(
    () => {
      const s = selectedSource();
      const v = exploreArgsVersion();
      if (!s) return null;
      if (isExploreUrlScript(s.exploreUrl)) return { source: s, argsVersion: v };
      return null;
    },
    (ctx) => getExploreSectionsAsync(ctx!.source, ctx!.argsVersion),
  );

  const usesScriptExplore = createMemo(() => isExploreUrlScript(selectedSource()?.exploreUrl));

  const sectionsLoading = createMemo(() => {
    if (!usesScriptExplore()) return false;
    return shouldShowExploreSectionsSkeleton(
      true,
      exploreArgsVersion(),
      loadedExploreArgsVersion(),
      dynamicSections,
    );
  });

  const sections = createMemo((): ExploreSection[] => {
    const s = selectedSource();
    if (!s) return [];
    if (isExploreUrlScript(s.exploreUrl)) {
      if (sectionsLoading()) return [];
      return resolveExploreSectionsFromResource(dynamicSections);
    }
    return getExploreSections(s);
  });

  const sectionsError = () =>
    isExploreUrlScript(selectedSource()?.exploreUrl) && dynamicSections.state === 'errored'
      ? dynamicSections.error
      : undefined;

  async function loadSources() {
    try {
      const all = await sourcesDb.getAllSources();
      const list = all.filter(sourceHasExplore).sort((a, b) => a.customOrder - b.customOrder);
      setSources(list);
      if (list.length === 0) {
        setSelectedSourceUrl(null);
        setSelectedSection(null);
        return;
      }
      const current = selectedSourceUrl();
      if (!current || !list.some((s) => s.sourceUrl === current)) {
        setSelectedSourceUrl(list[0].sourceUrl);
      }
    } catch (e) {
      console.error('加载书源失败:', e);
    }
  }

  onMount(async () => {
    await initExplorePageLayoutSettings();
    await loadSources();
  });

  createEffect(() => {
    if (!usesScriptExplore()) {
      setLoadedExploreArgsVersion(exploreArgsVersion());
      return;
    }
    if (dynamicSections.state === 'ready' && !dynamicSections.loading) {
      setLoadedExploreArgsVersion(exploreArgsVersion());
    }
  });

  createEffect(() => {
    const s = selectedSource();
    const secs = sections();
    const sel = untrack(selectedSection);
    if (!s || secs.length === 0) return;
    if (sel && secs.some((x) => sectionsMatch(x, sel))) return;
    const firstOpenable = secs.find((x) => shouldOpenExplorePageForSection(x));
    setSelectedSection(firstOpenable ?? null);
  });

  const pageDescription = () => {
    const n = sources().length;
    return n > 0 ? `共 ${n} 个可探索书源` : '暂无可用书源';
  };

  const dropdownTitle = () => {
    const name = selectedSource()?.sourceName?.trim();
    return name ? `${EXPLORE_PAGE_TITLE} · ${name}` : EXPLORE_PAGE_TITLE;
  };

  const dropdownDescription = () => {
    const group = selectedSource()?.sourceGroup?.trim();
    return group ? `来自分组：${group}` : undefined;
  };

  const showSourceDropdown = () => sourceDropdownEnabled() && sources().length > 0;
  const showSourceTabs = () => sourceTabsEnabled() && sources().length > 0;

  function handleSourceChange(source: BookSource) {
    setSelectedSourceUrl(source.sourceUrl);
    setSelectedSection(null);
    setExploreArgsVersion(0);
    setLoadedExploreArgsVersion(-1);
    setListRefreshKey(0);
  }

  async function handleSelectFilterChange(section: ExploreSection, value: string) {
    const s = selectedSource();
    if (!s || !section.paramKey) return;
    updateExploreSourceArgument(s, section.paramKey, value);
    setExploreArgsVersion((v) => v + 1);
    setListRefreshKey((k) => k + 1);
  }

  function handleSectionSelect(section: ExploreSection) {
    if (!shouldOpenExplorePageForSection(section)) return;
    setSelectedSection(section);
    setListRefreshKey(0);
  }

  function handleRefreshList() {
    const s = selectedSource();
    const sec = selectedSection();
    if (!s || !sec?.url?.trim()) return;
    const cacheSourceId = s.sourceId || s.sourceName;
    if (cacheSourceId && typeof cacheSourceId === 'string') {
      pageCacheStore.clearExploreCache(cacheSourceId, sec.url);
    }
    setListRefreshKey((k) => k + 1);
  }

  return (
    <div class={mainShellPageRoot}>
      <PageToolbar
        title={EXPLORE_PAGE_TITLE}
        description={pageDescription()}
        titleSlot={
          showSourceDropdown() ? (
            <ExploreSourceTitleDropdown
              title={dropdownTitle()}
              description={dropdownDescription()}
              sources={sources()}
              currentSourceUrl={selectedSourceUrl()}
              onSourceChange={handleSourceChange}
            />
          ) : undefined
        }
        below={
          showSourceTabs() ? (
            <ExploreSourceNav
              groupStyle="tabs"
              sources={sources()}
              currentSourceUrl={selectedSourceUrl()}
              onSourceChange={handleSourceChange}
            />
          ) : undefined
        }
        belowHorizontalWheel={showSourceTabs()}
      >
        <ExplorePageToolbar
          showRefresh={!!selectedSection()?.url?.trim()}
          refreshDisabled={false}
          onRefresh={handleRefreshList}
          onPaginationPreference={() => props.onPaginationPreferenceDialogChange?.(true)}
        />
      </PageToolbar>

      <ExploreSectionsPanel
        source={selectedSource()}
        sections={sections()}
        loading={sectionsLoading}
        error={sectionsError()}
        selectedSection={selectedSection()}
        onSectionSelect={handleSectionSelect}
        onSelectFilterChange={handleSelectFilterChange}
      />

      <Show when={sectionsLoading()}>
        <div class={cn(mainShellPageScroll, 'pb-4')}>
          <ExploreBookListSkeleton />
        </div>
      </Show>
      <Show
        when={
          !sectionsLoading() &&
          selectedSource() &&
          selectedSection() &&
          selectedSection()!.url?.trim()
        }
      >
        <ExploreSourcePageContent
          source={selectedSource()!}
          section={selectedSection()!}
          refreshKey={listRefreshKey()}
          onOpenBook={props.onOpenBook}
          onOpenBookInfo={props.onOpenBookInfo}
          showPaginationPreferenceDialog={props.showPaginationPreferenceDialog}
          onPaginationPreferenceDialogChange={props.onPaginationPreferenceDialogChange}
        />
      </Show>
      <Show
        when={
          !sectionsLoading() &&
          !(selectedSource() && selectedSection() && selectedSection()!.url?.trim())
        }
      >
        <div
          class={cn(
            mainShellPageScroll,
            'flex items-center justify-center text-sm text-muted-foreground',
          )}
        >
          请选择上方的探索分类
        </div>
      </Show>
    </div>
  );
}

/** @deprecated 使用 ExplorePage */
export const ScoutPage = ExplorePage;
export type ScoutPageProps = ExplorePageProps;
