/**
 * 音乐设置面板：桌面左侧分区导航 + 右侧内容 + 搜索；移动端卡片 Hub + 子页面
 * 搜索/帮助挂在 MusicHubPageShell 原有页头右侧（不另开工具条区域）
 */

import {
  createMemo,
  createSignal,
  onCleanup,
  For,
  Show,
  type Component,
} from 'solid-js';
import { Dynamic } from 'solid-js/web';
import {
  ChevronRight,
  Palette,
  Radio,
  Play,
  Disc3,
  Captions,
  Search,
  ListMusic,
  Download,
  Keyboard,
  Cloud,
  Database,
} from 'lucide-solid';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { MusicSettingsRouter } from '@/components/media/viewer/audio/music/settings/MusicSettingsRouter';
import {
  MUSIC_SETTINGS_SECTIONS,
  type MusicSettingsSection,
} from '@/components/media/viewer/audio/music/settings/music-settings-sections';
import { musicHubPageContentInsetClass } from '@/lib/media/audio/music-hub-section-meta';
import {
  listVisibleMusicSettingsSections,
  searchMusicSettingsItems,
  type MusicSettingsItemDef,
} from '@/lib/media/audio/music-settings-catalog';
import { settingsStore } from '@/stores/settings';
import { cn } from '@/lib/utils';
import { useShellLayout } from '@/components/shell/ShellLayoutProvider';
import { SettingsPageToolbar, SettingsToolbarLeading } from '@/components/shell/SettingsPageToolbar';
import { SettingsThemedHubCard } from '@/components/theme/SettingsThemedHubCard';
import {
  bookshelfCompactListCardClass,
  bookshelfCompactMainClass,
} from '@/lib/bookshelf/book-group-card-styles';
import { ChevronRightIcon } from '@/components/shared/icons';
import { MusicHubPageShell } from '@/components/media/viewer/audio/music/hub/MusicHubPageShell';

const SECTION_ICONS: Record<MusicSettingsSection, Component<{ class?: string }>> = {
  theme: Palette,
  basic: Radio,
  play: Play,
  playDetail: Disc3,
  desktopLyric: Captions,
  search: Search,
  list: ListMusic,
  download: Download,
  hotKey: Keyboard,
  services: Cloud,
  dataMaintenance: Database,
};

const sectionMap = new Map(MUSIC_SETTINGS_SECTIONS.map((section) => [section.id, section]));

function musicSettingsSection(id: MusicSettingsSection) {
  return sectionMap.get(id)!;
}

function settingsNavButtonClass(active: boolean) {
  return cn(
    'h-9 w-full min-w-0 justify-start rounded-md px-2.5 text-left text-[13px] font-normal',
    'transition-[color,background-color] duration-300 ease-out',
    active
      ? 'bg-primary/10! font-medium text-primary!'
      : 'text-foreground hover:bg-primary/10! hover:text-foreground!',
  );
}

function SettingsActiveIndicator(props: { active: boolean }) {
  const reduceMotion = () => settingsStore.state.app.reduceMotion;
  return (
    <span
      class={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden',
        reduceMotion() ? '' : 'transition-[width,opacity] duration-130 ease-out',
        props.active ? 'mr-0.5 w-[0.9em] opacity-100' : 'w-0 opacity-0',
      )}
      aria-hidden="true"
    >
      <ChevronRight class="h-[0.9em] w-[0.9em] shrink-0" />
    </span>
  );
}

const musicSettingsMobileListCardClass = cn(
  bookshelfCompactListCardClass('h-16 w-full min-w-0'),
  'cursor-pointer items-center text-left',
);

const musicSettingsListClass = 'flex w-full min-w-0 flex-col gap-2';
const musicSettingsListItemClass = 'w-full min-w-0';
const musicSettingsSearchEmptyClass =
  'w-full rounded-xl border border-dashed border-border bg-muted/20 py-12 text-center text-sm text-muted-foreground';

const HIGHLIGHT_DURATION_MS = 2400;

export function MusicSettingsPanel() {
  const shell = useShellLayout();
  const useMobileLayout = () => shell().useMobileShell;

  const [desktopSection, setDesktopSection] = createSignal<MusicSettingsSection>('theme');
  const [mobileSection, setMobileSectionSignal] = createSignal<MusicSettingsSection | null>(null);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [highlightedItemId, setHighlightedItemId] = createSignal<string | null>(null);

  let desktopContentEl: HTMLDivElement | undefined;
  let mobileSubPageEl: HTMLDivElement | undefined;

  const visibleSections = createMemo(() => listVisibleMusicSettingsSections());
  const searchResults = createMemo(() => searchMusicSettingsItems(searchQuery()));
  const isSearching = () => searchQuery().trim().length > 0;

  let highlightTimer: number | undefined;
  function clearHighlightTimer() {
    if (highlightTimer != null) {
      window.clearTimeout(highlightTimer);
      highlightTimer = undefined;
    }
  }
  onCleanup(clearHighlightTimer);

  function flashHighlight(itemId: string) {
    clearHighlightTimer();
    setHighlightedItemId(itemId);
    highlightTimer = window.setTimeout(() => {
      setHighlightedItemId(null);
      highlightTimer = undefined;
    }, HIGHLIGHT_DURATION_MS);
  }

  function scrollToSettingItem(itemId: string, scrollRoot?: HTMLDivElement) {
    const el = document.getElementById(`setting-item-${itemId}`);
    if (!el) return;
    if (scrollRoot) {
      const rootRect = scrollRoot.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const offset = elRect.top - rootRect.top + scrollRoot.scrollTop - 16;
      scrollRoot.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' });
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function setMobileSection(id: MusicSettingsSection | null) {
    setMobileSectionSignal(id);
  }

  function openMobileSection(id: MusicSettingsSection) {
    setMobileSection(id);
    setDesktopSection(id);
  }

  function closeMobileSection() {
    setMobileSection(null);
    setHighlightedItemId(null);
  }

  async function navigateToSettingItem(item: MusicSettingsItemDef) {
    setSearchQuery('');
    if (useMobileLayout()) {
      openMobileSection(item.sectionId);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      scrollToSettingItem(item.id, mobileSubPageEl);
    } else {
      setDesktopSection(item.sectionId);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      scrollToSettingItem(item.id, desktopContentEl);
    }
    flashHighlight(item.id);
  }

  const pageTitle = () => {
    if (isSearching()) return '搜索设置';
    const sub = mobileSection();
    if (useMobileLayout() && sub) return musicSettingsSection(sub).label;
    return undefined;
  };

  const pageDescription = () => {
    if (isSearching()) {
      const count = searchResults().length;
      return count > 0 ? `找到 ${count} 个匹配项` : '未找到匹配的设置项';
    }
    const sub = mobileSection();
    if (useMobileLayout() && sub) return musicSettingsSection(sub).description;
    return undefined;
  };

  const pageLeading = () => {
    if (useMobileLayout() && mobileSection() != null && !isSearching()) {
      return <SettingsToolbarLeading onBack={closeMobileSection} label="返回设置" />;
    }
    return undefined;
  };

  const searchResultsList = () => (
    <div class={cn('min-h-0 flex-1 overflow-y-auto py-2', musicHubPageContentInsetClass)}>
      <Show
        when={searchResults().length > 0}
        fallback={
          <div class={musicSettingsSearchEmptyClass}>
            <p>未找到匹配的设置项</p>
            <p class="mt-1">尝试其他关键词，如「音质」「歌词」「快捷键」或「下载」</p>
          </div>
        }
      >
        <ul class={musicSettingsListClass}>
          <For each={searchResults()}>
            {(item) => {
              const section = () => musicSettingsSection(item.sectionId);
              return (
                <li class={musicSettingsListItemClass}>
                  <SettingsThemedHubCard
                    class={musicSettingsMobileListCardClass}
                    onClick={() => void navigateToSettingItem(item)}
                  >
                    <div class={bookshelfCompactMainClass('px-2')}>
                      <span class="truncate font-medium text-foreground">{item.title}</span>
                      <span class="truncate text-xs text-muted-foreground">
                        {section().label}
                        {item.description ? ` · ${item.description}` : ''}
                      </span>
                    </div>
                    <span class="flex shrink-0 items-center pr-1.5 text-muted-foreground">
                      <ChevronRightIcon class="h-4 w-4" />
                    </span>
                  </SettingsThemedHubCard>
                </li>
              );
            }}
          </For>
        </ul>
      </Show>
    </div>
  );

  const mobileHub = () => (
    <div class={cn('min-h-0 flex-1 overflow-y-auto py-2', musicHubPageContentInsetClass)}>
      <ul class={musicSettingsListClass}>
        <For each={visibleSections()}>
          {(section) => (
            <li class={musicSettingsListItemClass}>
              <SettingsThemedHubCard
                class={musicSettingsMobileListCardClass}
                onClick={() => openMobileSection(section.id)}
              >
                <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Dynamic component={SECTION_ICONS[section.id]} class="h-5 w-5" />
                </span>
                <div class={bookshelfCompactMainClass()}>
                  <span class="truncate font-medium text-foreground">{section.label}</span>
                  <span class="truncate text-xs text-muted-foreground">{section.description}</span>
                </div>
                <span class="flex shrink-0 items-center pr-1.5 text-muted-foreground">
                  <ChevronRightIcon class="h-4 w-4" />
                </span>
              </SettingsThemedHubCard>
            </li>
          )}
        </For>
      </ul>
    </div>
  );

  const mobileSubPage = () => (
    <div
      ref={(el) => {
        mobileSubPageEl = el;
      }}
      class={cn('min-h-0 flex-1 overflow-y-auto pb-4', musicHubPageContentInsetClass)}
    >
      <Show when={mobileSection()}>
        {(id) => <MusicSettingsRouter section={id()} highlightedItemId={highlightedItemId()} />}
      </Show>
    </div>
  );

  const desktopBody = () => (
    <div class={cn('flex min-h-0 flex-1 overflow-hidden', musicHubPageContentInsetClass)}>
      <nav class="w-44 shrink-0 overflow-y-auto border-r border-border/60 p-2 md:w-52">
        <SidebarGroup class="p-0">
          <SidebarGroupContent class="p-0">
            <SidebarMenu class="gap-0.5">
              <For each={visibleSections()}>
                {(section) => (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={desktopSection() === section.id}
                      onClick={() => setDesktopSection(section.id)}
                      class={settingsNavButtonClass(desktopSection() === section.id)}
                    >
                      <SettingsActiveIndicator active={desktopSection() === section.id} />
                      <span class="min-w-0 flex-1 truncate">{section.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </For>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </nav>
      <div
        ref={(el) => {
          desktopContentEl = el;
        }}
        class="min-h-0 flex-1 overflow-y-auto"
      >
        <MusicSettingsRouter section={desktopSection()} highlightedItemId={highlightedItemId()} />
      </div>
    </div>
  );

  return (
    <MusicHubPageShell
      section="settings"
      scrollClass="overflow-hidden"
      title={pageTitle()}
      description={pageDescription()}
      leading={pageLeading()}
      toolbar={
        <SettingsPageToolbar searchQuery={searchQuery()} onSearchQueryChange={setSearchQuery} />
      }
    >
      <Show when={isSearching()}>{searchResultsList()}</Show>
      <Show when={!isSearching()}>
        <Show when={useMobileLayout()} fallback={desktopBody()}>
          <Show when={mobileSection() == null} fallback={mobileSubPage()}>
            {mobileHub()}
          </Show>
        </Show>
      </Show>
    </MusicHubPageShell>
  );
}
