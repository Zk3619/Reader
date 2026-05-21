/**
 * 发现分类固定区（探索页）：弹性排列按钮，不沿用书源展开区的 ul/li 与 flexBasis 布局
 */

import { type Accessor, createMemo, For, Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  AppSelect,
  AppSelectContent,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import type { BookSource } from '@/types';
import type { ExploreSection } from '@/lib/book-source/explore-sections';
import {
  buildExploreSectionNavItems,
  formatExploreSelectOptionLabel,
  getExploreArgumentSelectValue,
  type ExploreSectionNavItem,
} from '@/lib/book-source/explore-nav-items';
import { shouldOpenExplorePageForSection } from '@/lib/book-source/explore-section-action';
import { cn } from '@/lib/utils';

/** 探索页分类区：固定高度、内容宽度、上限宽度 */
const EXPLORE_HUB_CHIP_MAX_W = 'max-w-48';
const EXPLORE_HUB_CHIP_H = 'h-9';
const EXPLORE_HUB_CHIP_BASE =
  'shrink-0 rounded-lg border-border/60 bg-background/80 text-sm font-medium shadow-sm';

const exploreHubItemsTrackClass =
  'flex max-h-36 flex-wrap items-center gap-2 overflow-y-auto scroll-gutter-stable-both overscroll-contain py-1';

const exploreHubButtonClass = (selected: boolean) =>
  cn(
    EXPLORE_HUB_CHIP_BASE,
    EXPLORE_HUB_CHIP_H,
    EXPLORE_HUB_CHIP_MAX_W,
    'justify-center px-3',
    selected && 'border-primary/50 bg-primary/5 ring-1 ring-primary/30',
  );

const exploreHubSelectShellClass = cn(
  EXPLORE_HUB_CHIP_BASE,
  EXPLORE_HUB_CHIP_H,
  'flex max-w-xs items-center gap-2 border px-2',
);

export interface ExploreSectionsPanelProps {
  source: BookSource | null;
  sections: ExploreSection[];
  /** 布尔或 Accessor，传 Accessor 以保证与 createResource 同步更新 */
  loading?: boolean | Accessor<boolean>;
  error?: unknown;
  selectedSection?: ExploreSection | null;
  onSectionSelect: (section: ExploreSection) => void;
  onSelectFilterChange?: (section: ExploreSection, value: string) => void | Promise<void>;
}

function isSectionSelected(a: ExploreSection | null | undefined, b: ExploreSection): boolean {
  if (!a) return false;
  return a.title === b.title && (a.url ?? '') === (b.url ?? '');
}

function SelectNavItem(props: {
  item: Extract<ExploreSectionNavItem, { kind: 'select' }>;
  selectedSection?: ExploreSection | null;
  onSectionSelect: (section: ExploreSection) => void;
  onSelectFilterChange?: (section: ExploreSection, value: string) => void | Promise<void>;
}) {
  const paramKey = () => props.item.filterSection?.paramKey;
  const isArgumentFilter = () => !!paramKey();

  const selectedValue = () =>
    getExploreArgumentSelectValue(props.item, props.selectedSection);

  return (
    <div
      class={exploreHubSelectShellClass}
      onClick={(e) => e.stopPropagation()}
    >
      <Label class="shrink-0 text-xs text-muted-foreground">{props.item.label}</Label>
      <div class="min-w-0 flex-1">
        <AppSelect
          value={selectedValue()}
          onChange={(v) => {
            if (!v) return;
            const opt = props.item.options.find((o) => o.title === v);
            if (!opt) return;
            if (isArgumentFilter() && props.item.filterSection) {
              void props.onSelectFilterChange?.(props.item.filterSection, v);
              return;
            }
            if (shouldOpenExplorePageForSection(opt)) {
              props.onSectionSelect(opt);
            }
          }}
          options={props.item.options.map((o) => o.title)}
          itemComponent={(itemProps) => (
            <AppSelectItem item={itemProps.item}>
              {formatExploreSelectOptionLabel(String(itemProps.item.rawValue), paramKey())}
            </AppSelectItem>
          )}
        >
          <AppSelectTrigger layout="inline" aria-label={props.item.label}>
            <AppSelectValue<string>>
              {(state) =>
                formatExploreSelectOptionLabel(
                  state.selectedOption() ?? selectedValue(),
                  paramKey(),
                )
              }
            </AppSelectValue>
            <AppSelectIcon />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectListbox />
          </AppSelectContent>
        </AppSelect>
      </div>
    </div>
  );
}

function ExploreHubLoadingSkeleton() {
  const widths = ['w-20', 'w-28', 'w-24', 'w-32', 'w-16'] as const;
  const chipClass = cn(
    EXPLORE_HUB_CHIP_H,
    EXPLORE_HUB_CHIP_MAX_W,
    'animate-pulse rounded-lg border border-border/30 bg-muted/60',
  );
  return (
    <div class={exploreHubItemsTrackClass}>
      <For each={widths}>
        {(w) => <div class={cn(chipClass, w)} aria-hidden="true" />}
      </For>
    </div>
  );
}

export function ExploreSectionsPanel(props: ExploreSectionsPanelProps) {
  const isLoading = createMemo(() => {
    const l = props.loading;
    return typeof l === 'function' ? l() : !!l;
  });
  const navItems = () => buildExploreSectionNavItems(props.sections);
  const showNav = () => !isLoading() && !props.error && navItems().length > 0;

  return (
    <div class="shrink-0 border-b border-border/50 bg-muted/10 my-1">
      <Show when={!props.source}>
        <p class="py-2 text-center text-sm text-muted-foreground">请选择书源</p>
      </Show>
      <Show when={props.source}>
        <Show when={isLoading()}>
          <ExploreHubLoadingSkeleton />
        </Show>
        <Show when={props.error}>
          <p class="py-2 text-center text-xs text-destructive">
            {props.error instanceof Error ? props.error.message : '加载分类失败'}
          </p>
        </Show>
        <Show when={!props.error && !isLoading() && navItems().length === 0}>
          <p class="py-2 text-center text-sm text-muted-foreground">该书源暂无可浏览的发现分类</p>
        </Show>
        <Show when={showNav()}>
          <div class={exploreHubItemsTrackClass}>
            <For each={navItems()}>
              {(item) => {
                if (item.kind === 'select') {
                  return (
                    <SelectNavItem
                      item={item}
                      selectedSection={props.selectedSection}
                      onSectionSelect={props.onSectionSelect}
                      onSelectFilterChange={props.onSelectFilterChange}
                    />
                  );
                }
                return (
                  <Button
                    variant="outline"
                    class={exploreHubButtonClass(
                      isSectionSelected(props.selectedSection, item.section),
                    )}
                    onClick={() => props.onSectionSelect(item.section)}
                  >
                    <span class="min-w-0 truncate">{item.section.title}</span>
                  </Button>
                );
              }}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
}
