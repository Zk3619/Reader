/**
 * 书源页右侧抽屉：发现分类/排行榜等内容
 * 布局方案见设置「书源发现抽屉布局」
 */

import { createMemo, createSignal, For, Show } from 'solid-js';
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
import {
  getExploreInfoMap,
  setExploreInfoMapValue,
} from '@/lib/book-source/explore-info-map-store';
import { formatExploreSelectOptionLabel } from '@/lib/book-source/explore-nav-items';
import {
  isExploreDrawerButtonSection,
  getExploreSectionSelectDisplayValue,
  isExploreDrawerSelectSection,
  isExploreDrawerTextSection,
  type ExploreSection,
} from '@/lib/book-source/explore-sections';
import {
  exploreDrawerDefaultItemStyle,
  exploreDrawerRowItemStyle,
  groupExploreSectionsIntoRows,
  type ExploreDrawerLayoutScheme,
} from '@/lib/book-source/legado-flex-child-style';
import { getLegadoSourceKey } from '@/lib/js-engine/legado/source-script-shared';
import { getExploreSourceArgsVersion } from '@/stores/explore-source-args';
import { settingsStore } from '@/stores/settings';
import type { BookSource } from '@/types';

const EXPLORE_SECTION_BUTTON_CLASS =
  'flex h-auto min-h-9 w-full justify-center rounded-lg border-border/60 bg-background/80 px-3 py-2 text-center text-sm font-medium shadow-sm';

const EXPLORE_SECTION_TEXT_SHELL_CLASS =
  'flex w-full min-w-0 items-center rounded-lg border border-border/60 bg-background/80 px-3 py-2 shadow-sm';

const EXPLORE_SECTION_TEXT_INPUT_CLASS =
  'min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground';

const EXPLORE_SECTION_SELECT_SHELL_CLASS =
  'flex w-full items-center gap-2 rounded-lg border border-border/60 bg-background/80 px-2 py-1.5 shadow-sm';

const EXPLORE_KINDS_TRACK_CLASS = 'flex w-full min-w-0 flex-col gap-2 box-border py-2';

const EXPLORE_KINDS_ROW_CLASS = 'flex w-full min-w-0 items-stretch gap-2';

const EXPLORE_KINDS_WRAP_CLASS = 'flex w-full min-w-0 flex-wrap items-stretch gap-2 box-border py-2';

const SKELETON_CHIP_BASE =
  'h-9 animate-pulse rounded-lg border border-border/30 bg-muted/60';

const SKELETON_CHIP_ROW_CLASS = `${SKELETON_CHIP_BASE} min-w-0 flex-1`;

/** Legado 三列网格骨架行数（贴近常见分类/排行榜密度） */
const EXPLORE_DRAWER_SKELETON_LEGADO_ROWS = 5;

const EXPLORE_DRAWER_SKELETON_LEGADO_ROW_INDICES = Array.from(
  { length: EXPLORE_DRAWER_SKELETON_LEGADO_ROWS },
  (_, i) => i,
);

const EXPLORE_DRAWER_SKELETON_LEGADO_COL_INDICES = [0, 1, 2];

/** 默认换行布局：不等宽芯片模拟按钮文案长度 */
const EXPLORE_DRAWER_SKELETON_WRAP_WIDTHS = [
  'w-16',
  'w-20',
  'w-24',
  'w-20',
  'w-28',
  'w-16',
  'w-24',
  'w-20',
  'w-16',
  'w-28',
  'w-24',
  'w-20',
  'w-16',
  'w-28',
  'w-24',
] as const;

export interface SourceExploreDrawerContentProps {
  source: BookSource;
  sections: () => ExploreSection[];
  loading: () => boolean;
  error: () => boolean;
  errorMessage: () => string | undefined;
  onExploreSectionClick?: (source: BookSource, section: ExploreSection) => void;
  onExploreSelectChange: (source: BookSource, section: ExploreSection, value: string) => void;
  onExploreSectionAction?: (source: BookSource, section: ExploreSection) => void | Promise<void>;
}

function drawerLayoutScheme(): ExploreDrawerLayoutScheme {
  return settingsStore.state.app.sourceExploreDrawerLayout ?? 'default';
}

function ExploreSectionItem(props: {
  source: BookSource;
  section: ExploreSection;
  itemStyle: Record<string, string>;
  onExploreSectionClick?: (source: BookSource, section: ExploreSection) => void;
  onExploreSelectChange: (source: BookSource, section: ExploreSection, value: string) => void;
  onExploreSectionAction?: (source: BookSource, section: ExploreSection) => void | Promise<void>;
}) {
  const sourceKey = () => getLegadoSourceKey(props.source);
  const isSelect = () => isExploreDrawerSelectSection(props.section);
  const isText = () => isExploreDrawerTextSection(props.section);
  const isActionButton = () => isExploreDrawerButtonSection(props.section);
  const isClickable = () => !!props.section.url || isActionButton();
  const selectValue = () => {
    void getExploreSourceArgsVersion(sourceKey());
    return getExploreSectionSelectDisplayValue(props.source, props.section);
  };

  const [textValue, setTextValue] = createSignal(
    getExploreInfoMap(sourceKey())[props.section.title] ?? '',
  );

  const handleClick = () => {
    if (isActionButton()) {
      void props.onExploreSectionAction?.(props.source, props.section);
      return;
    }
    props.onExploreSectionClick?.(props.source, props.section);
  };

  return (
    <div class="min-w-0" style={props.itemStyle}>
      <Show
        when={isSelect()}
        fallback={
          <Show
            when={isText()}
            fallback={
              <Button
                variant="outline"
                class={EXPLORE_SECTION_BUTTON_CLASS}
                disabled={!isClickable()}
                onClick={handleClick}
              >
                <span class="min-w-0 truncate">{props.section.title}</span>
              </Button>
            }
          >
            <div class={EXPLORE_SECTION_TEXT_SHELL_CLASS} onClick={(e) => e.stopPropagation()}>
              <input
                type={props.section.type === 'password' ? 'password' : 'text'}
                class={EXPLORE_SECTION_TEXT_INPUT_CLASS}
                placeholder={props.section.title}
                aria-label={props.section.title}
                value={textValue()}
                onInput={(e) => {
                  const v = e.currentTarget.value;
                  setTextValue(v);
                  setExploreInfoMapValue(sourceKey(), props.section.title, v);
                }}
              />
            </div>
          </Show>
        }
      >
        <div class={EXPLORE_SECTION_SELECT_SHELL_CLASS} onClick={(e) => e.stopPropagation()}>
          <Label class="shrink-0 text-xs text-muted-foreground">{props.section.title}</Label>
          <div class="min-w-0 flex-1">
            <AppSelect
              value={selectValue()}
              onChange={(v) => {
                if (v) {
                  void props.onExploreSelectChange(props.source, props.section, v);
                }
              }}
              options={[...props.section.chars!]}
              itemComponent={(itemProps) => (
                <AppSelectItem item={itemProps.item}>
                  {formatExploreSelectOptionLabel(
                    String(itemProps.item.rawValue),
                    props.section.paramKey,
                  )}
                </AppSelectItem>
              )}
            >
              <AppSelectTrigger layout="compact" aria-label={props.section.title}>
                <AppSelectValue<string>>
                  {(state) =>
                    formatExploreSelectOptionLabel(
                      state.selectedOption() ?? selectValue(),
                      props.section.paramKey,
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
      </Show>
    </div>
  );
}

export function SourceExploreDrawerContent(props: SourceExploreDrawerContentProps) {
  const scheme = createMemo(drawerLayoutScheme);
  const sectionRows = createMemo(() =>
    groupExploreSectionsIntoRows(props.sections(), scheme()),
  );

  return (
    /** data-corvu-no-drag 用于禁用抽屉拖拽关闭 */
    <div class="min-h-0 w-full min-w-0 flex-1">
      <Show when={props.loading()}>
        <Show
          when={scheme() === 'legado'}
          fallback={
            <div class={EXPLORE_KINDS_WRAP_CLASS} aria-busy="true">
              <For each={[...EXPLORE_DRAWER_SKELETON_WRAP_WIDTHS]}>
                {(widthClass) => (
                  <div
                    class={`${SKELETON_CHIP_BASE} shrink-0 ${widthClass}`}
                    aria-hidden="true"
                  />
                )}
              </For>
            </div>
          }
        >
          <div class={EXPLORE_KINDS_TRACK_CLASS} aria-busy="true">
            <For each={EXPLORE_DRAWER_SKELETON_LEGADO_ROW_INDICES}>
              {() => (
                <div class={EXPLORE_KINDS_ROW_CLASS}>
                  <For each={EXPLORE_DRAWER_SKELETON_LEGADO_COL_INDICES}>
                    {() => <div class={SKELETON_CHIP_ROW_CLASS} aria-hidden="true" />}
                  </For>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
      <Show when={props.error()}>
        <div class="my-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
          <p class="text-center text-sm text-destructive">
            <span class="font-medium">加载失败：</span>
            <span class="text-xs text-destructive/80">
              {props.errorMessage() ?? '网络请求失败，请检查网络连接'}
            </span>
          </p>
        </div>
      </Show>
      <Show when={!props.loading() && !props.error() && props.sections().length > 0}>
        <Show
          when={scheme() === 'legado'}
          fallback={
            <div class={EXPLORE_KINDS_WRAP_CLASS}>
              <For each={props.sections()}>
                {(section) => (
                  <ExploreSectionItem
                    source={props.source}
                    section={section}
                    itemStyle={exploreDrawerDefaultItemStyle(section)}
                    onExploreSectionClick={props.onExploreSectionClick}
                    onExploreSelectChange={props.onExploreSelectChange}
                    onExploreSectionAction={props.onExploreSectionAction}
                  />
                )}
              </For>
            </div>
          }
        >
          <div class={EXPLORE_KINDS_TRACK_CLASS}>
            <For each={sectionRows()}>
              {(row) => (
                <div class={EXPLORE_KINDS_ROW_CLASS}>
                  <For each={row}>
                    {(section) => (
                      <ExploreSectionItem
                        source={props.source}
                        section={section}
                        itemStyle={exploreDrawerRowItemStyle(section, row, 'legado')}
                        onExploreSectionClick={props.onExploreSectionClick}
                        onExploreSelectChange={props.onExploreSelectChange}
                        onExploreSectionAction={props.onExploreSectionAction}
                      />
                    )}
                  </For>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
      <Show when={!props.loading() && !props.error() && props.sections().length === 0}>
        <p class="py-3 text-center text-sm text-muted-foreground">该书源暂无发现内容（分类/排行榜）</p>
      </Show>
    </div>
  );
}
