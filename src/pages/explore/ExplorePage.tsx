/**
 * 探索页：书源切换 + 分类固定区 + 书籍列表（导航独立入口）
 */

import {
  type Accessor,
  type Component,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  onMount,
  Show,
  untrack,
} from 'solid-js';
import { readShellPageActive } from '@/lib/ui/shell-page-active';
import * as sourcesDb from '@/lib/database/sources';
import type { BookSource } from '@/types';
import type { Book, SearchBook } from '@/types';
import type { ExploreSection } from '@/lib/book-source/explore-sections';
import {
  clearExploreSectionsCache,
  getExploreSections,
  getExploreSectionsAsync,
  isExploreUrlScript,
  resolveExploreSectionsFromResource,
  resolveExploreSectionsResourceError,
  isExploreSectionsAbortError,
  shouldShowExploreSectionsSkeleton,
  updateExploreSourceArgument,
} from '@/lib/book-source/explore-sections';
import { getPageNavigationRevision } from '@/lib/navigation/page-navigation-scope';
import { applyExploreSelectChange } from '@/lib/book-source/explore-select-change';
import { getExploreSourceArgsVersion } from '@/stores/explore-source-args';
import { getLegadoSourceKey } from '@/lib/js-engine/legado/source-script-shared';
import { ExploreBookListSkeleton } from '@/components/explore/ExploreBookCardSkeleton';
import {
  isExploreSectionInNav,
  resolveDefaultExploreNavSelection,
} from '@/lib/book-source/explore-nav-items';
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
  ExploreSourceTitlePicker,
} from '@/components/explore/ExploreSourceNav';
import { ExplorePageToolbar } from '@/components/explore/ExplorePageToolbar';
import { exploreTabBarShellClass } from '@/components/explore/ExploreScrollTabsBar';
import { ExploreSectionsPanel } from '@/components/explore/ExploreSectionsPanel';
import { ExploreSourcePageContent } from '@/components/explore/ExploreSourcePageContent';
import { formatSourceScope } from '@/lib/book-source/search-scope';

const EXPLORE_PAGE_TITLE = '探索';

export interface ExplorePageProps {
  /** 为 false 时保留 UI 状态但不拉取发现分类/书籍列表（侧边栏隐藏态） */
  active?: boolean | Accessor<boolean>;
  onOpenBook: (book: Book) => void;
  onOpenBookInfo?: (source: BookSource, book: SearchBook) => void;
  /** 进入搜索页，scope 为当前选中书源范围（name::url） */
  onOpenBookSearch?: (scope: string) => void;
}

function sourceHasExplore(source: BookSource): boolean {
  if (source.enableExplore === false) return false;
  return !!(source.exploreUrl?.trim() || source.ruleExplore);
}

function exploreSourceListUnchanged(prev: BookSource[], next: BookSource[]): boolean {
  if (prev.length !== next.length) return false;
  return prev.every((s, i) => s.sourceUrl === next[i].sourceUrl);
}

export const ExplorePage: Component<ExplorePageProps> = (props) => {
  const isActive = createMemo(() => readShellPageActive(props.active));
  const [sources, setSources] = createSignal<BookSource[]>([]);
  /** 首次激活后只拉取一次；空列表时避免 setSources([]) 触发 effect 无限重载 */
  const [sourcesInitialLoadDone, setSourcesInitialLoadDone] = createSignal(false);
  const [selectedSourceUrl, setSelectedSourceUrl] = createSignal<string | null>(null);
  const [selectedSection, setSelectedSection] = createSignal<ExploreSection | null>(null);
  const exploreArgsVersion = () => {
    const s = selectedSource();
    return s ? getExploreSourceArgsVersion(getLegadoSourceKey(s)) : 0;
  };
  /** 与 dynamicSections 最后一次 ready 对齐的 args 版本（用于筛选变更后立即骨架屏） */
  const [loadedExploreArgsVersion, setLoadedExploreArgsVersion] = createSignal(-1);
  const [listRefreshKey, setListRefreshKey] = createSignal(0);
  /** 脚本分类重载期间保留上一份列表，避免切回探索页时整页骨架屏 */
  const [sectionsSnapshot, setSectionsSnapshot] = createSignal<{
    key: string;
    sections: ExploreSection[];
  } | null>(null);

  const sourceNavStyle = () => explorePageLayoutStore.settings.sourceNavStyle;

  const selectedSource = createMemo(() => {
    const url = selectedSourceUrl();
    if (!url) return null;
    return sources().find((s) => s.sourceUrl === url) ?? null;
  });

  const [dynamicSections, { refetch: refetchExploreSections }] = createResource(
    () => {
      if (!isActive()) return null;
      const s = selectedSource();
      const v = exploreArgsVersion();
      if (!s) return null;
      if (isExploreUrlScript(s.exploreUrl)) {
        return { source: s, argsVersion: v, navRevision: getPageNavigationRevision() };
      }
      return null;
    },
    (ctx) => getExploreSectionsAsync(ctx!.source, ctx!.argsVersion),
  );

  const usesScriptExplore = createMemo(() => isExploreUrlScript(selectedSource()?.exploreUrl));

  const sectionsSnapshotKey = () => {
    const s = selectedSource();
    if (!s) return '';
    return `${s.sourceUrl}\0${exploreArgsVersion()}`;
  };

  const sectionsLoading = createMemo(() => {
    if (!isActive() || !usesScriptExplore()) return false;
    if (
      shouldShowExploreSectionsSkeleton(
        true,
        exploreArgsVersion(),
        loadedExploreArgsVersion(),
        dynamicSections,
      )
    ) {
      return true;
    }
    return false;
  });

  const sections = createMemo((): ExploreSection[] => {
    const s = selectedSource();
    if (!s) return [];
    if (isExploreUrlScript(s.exploreUrl)) {
      if (sectionsLoading()) {
        const snap = sectionsSnapshot();
        if (snap && snap.key === sectionsSnapshotKey()) return snap.sections;
        return [];
      }
      return resolveExploreSectionsFromResource(dynamicSections);
    }
    return getExploreSections(s);
  });

  const showSectionsSkeleton = () => sectionsLoading() && sections().length === 0;

  createEffect(() => {
    if (!usesScriptExplore()) return;
    if (dynamicSections.state !== 'ready' || dynamicSections.loading) return;
    const resolved = resolveExploreSectionsFromResource(dynamicSections);
    setSectionsSnapshot({ key: sectionsSnapshotKey(), sections: resolved });
  });

  const showBookList = () => {
    const sec = selectedSection();
    return !!(selectedSource() && sec?.url?.trim());
  };

  const sectionsError = () => {
    if (!isExploreUrlScript(selectedSource()?.exploreUrl)) return undefined;
    return resolveExploreSectionsResourceError(dynamicSections);
  };

  async function loadSources() {
    try {
      const all = await sourcesDb.getAllSources();
      const list = all.filter(sourceHasExplore).sort((a, b) => a.customOrder - b.customOrder);
      setSources((prev) => (exploreSourceListUnchanged(prev, list) ? prev : list));
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
      setSources((prev) => (prev.length === 0 ? prev : []));
    }
  }

  let layoutSettingsInitialized = false;
  createEffect(() => {
    if (!isActive() || layoutSettingsInitialized) return;
    layoutSettingsInitialized = true;
    void initExplorePageLayoutSettings();
  });

  createEffect(() => {
    if (!isActive() || sourcesInitialLoadDone()) return;
    void loadSources().finally(() => setSourcesInitialLoadDone(true));
  });

  /** 切页中止后重新进入：若 resource 仍停在 AbortError，主动重拉 */
  let exploreWasActive = false;
  createEffect(() => {
    const active = isActive();
    if (active && !exploreWasActive && usesScriptExplore() && isExploreSectionsAbortError(dynamicSections)) {
      void refetchExploreSections();
    }
    exploreWasActive = active;
  });

  onMount(() => {
    const onSourcesRefresh = () => {
      void loadSources();
    };
    window.addEventListener('sources-refresh', onSourcesRefresh);
    onCleanup(() => window.removeEventListener('sources-refresh', onSourcesRefresh));
  });

  createEffect(() => {
    if (!isActive()) return;
    if (!usesScriptExplore()) {
      setLoadedExploreArgsVersion(exploreArgsVersion());
      return;
    }
    if (dynamicSections.state === 'ready' && !dynamicSections.loading) {
      setLoadedExploreArgsVersion(exploreArgsVersion());
    }
  });

  const applyAutoSelectedSection = (section: ExploreSection | null) => {
    if (!section) return;
    setSelectedSection(section);
    if (section.url?.trim()) {
      setListRefreshKey((k) => k + 1);
    }
  };

  createEffect(() => {
    if (!isActive()) return;
    const s = selectedSource();
    const secs = sections();
    if (!s || secs.length === 0 || sectionsLoading()) return;
    const sel = untrack(selectedSection);
    if (isExploreSectionInNav(secs, sel)) return;

    const { section: next, argumentUpdate } = resolveDefaultExploreNavSelection(secs, sel, s);
    if (argumentUpdate) {
      updateExploreSourceArgument(s, argumentUpdate.paramKey, argumentUpdate.value);
      applyAutoSelectedSection(next);
      return;
    }
    applyAutoSelectedSection(next);
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

  const showSourceDropdown = () => sourceNavStyle() === 'dropdown' && sources().length > 0;
  const showSourceTabs = () => sourceNavStyle() === 'tabs' && sources().length > 0;
  const showSourceDialog = () => sourceNavStyle() === 'dialog' && sources().length > 0;

  const dialogTitle = () => {
    const name = selectedSource()?.sourceName?.trim();
    return name ? `${EXPLORE_PAGE_TITLE} · ${name}` : EXPLORE_PAGE_TITLE;
  };

  const dialogDescription = () => {
    const group = selectedSource()?.sourceGroup?.trim();
    return group ? `来自分组：${group}` : pageDescription();
  };

  function handleSourceChange(source: BookSource) {
    setSelectedSourceUrl(source.sourceUrl);
    setSelectedSection(null);
    setLoadedExploreArgsVersion(-1);
    setListRefreshKey(0);
    setSectionsSnapshot(null);
  }

  async function handleSelectFilterChange(section: ExploreSection, value: string) {
    const s = selectedSource();
    if (!s) return;
    setLoadedExploreArgsVersion(-1);
    await applyExploreSelectChange(s, section, value, {
      onRefreshExplore: async () => {
        clearExploreSectionsCache(getLegadoSourceKey(s));
        await refetchExploreSections();
      },
    });
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

  async function handleRefreshCategories() {
    const s = selectedSource();
    if (!s) return;
    clearExploreSectionsCache(getLegadoSourceKey(s));
    setSectionsSnapshot(null);
    setLoadedExploreArgsVersion(-1);
    await loadSources();
    if (isExploreUrlScript(s.exploreUrl)) {
      await refetchExploreSections();
    }
  }

  async function handleRefreshPage() {
    const s = selectedSource();
    const secUrl = selectedSection()?.url?.trim();
    if (!s) return;
    await handleRefreshCategories();
    const cacheSourceId = s.sourceId || s.sourceName;
    if (cacheSourceId && typeof cacheSourceId === 'string' && secUrl) {
      pageCacheStore.clearExploreCache(cacheSourceId, secUrl);
    }
    setListRefreshKey((k) => k + 1);
  }

  function handleOpenSearch() {
    const s = selectedSource();
    if (!s) return;
    props.onOpenBookSearch?.(formatSourceScope(s));
  }

  return (
    <div class={mainShellPageRoot}>
      <PageToolbar
        title={EXPLORE_PAGE_TITLE}
        description={pageDescription()}
        titleSlot={
          <Show
            when={showSourceDialog()}
            fallback={
              <ExploreSourceTitleDropdown
                title={showSourceDropdown() ? dropdownTitle() : EXPLORE_PAGE_TITLE}
                description={showSourceDropdown() ? dropdownDescription() : pageDescription()}
                dropdownEnabled={showSourceDropdown()}
                sources={sources()}
                currentSourceUrl={selectedSourceUrl()}
                onSourceChange={handleSourceChange}
              />
            }
          >
            <ExploreSourceTitlePicker
              title={dialogTitle()}
              description={dialogDescription()}
              pickerEnabled={showSourceDialog()}
              sources={sources()}
              currentSourceUrl={selectedSourceUrl()}
              onSourceChange={handleSourceChange}
            />
          </Show>
        }
        below={
          showSourceTabs() ? (
            <div class={cn(exploreTabBarShellClass)}>
              <ExploreSourceNav
                groupStyle="tabs"
                sources={sources()}
                currentSourceUrl={selectedSourceUrl()}
                onSourceChange={handleSourceChange}
              />
            </div>
          ) : undefined
        }
        belowHorizontalWheel={showSourceTabs()}
      >
        <ExplorePageToolbar
          showRefresh={!!selectedSource()}
          refreshListDisabled={!selectedSection()?.url?.trim()}
          onRefreshList={handleRefreshList}
          refreshCategoriesDisabled={!selectedSource()}
          onRefreshCategories={() => void handleRefreshCategories()}
          refreshPageDisabled={!selectedSource()}
          onRefreshPage={() => void handleRefreshPage()}
          searchDisabled={!selectedSource()}
          onSearch={handleOpenSearch}
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

      <Show when={showSectionsSkeleton()}>
        <div class={cn(mainShellPageScroll, 'flex-1 min-h-0')}>
          <ExploreBookListSkeleton />
        </div>
      </Show>
      <Show when={showBookList()}>
        <div
          class={cn(
            'flex-1 min-h-0 overflow-hidden',
            (!isActive() || showSectionsSkeleton()) && 'hidden',
          )}
        >
          <ExploreSourcePageContent
            source={selectedSource()!}
            section={selectedSection()!}
            refreshKey={listRefreshKey()}
            onOpenBook={props.onOpenBook}
            onOpenBookInfo={props.onOpenBookInfo}
          />
        </div>
      </Show>
      <Show
        when={
          !showSectionsSkeleton() &&
          !showBookList()
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
};

