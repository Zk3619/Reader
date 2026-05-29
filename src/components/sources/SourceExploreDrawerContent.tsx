/**
 * 书源页右侧抽屉：发现分类/排行榜等内容
 */

import { For, Show } from 'solid-js';
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
import { formatExploreSelectOptionLabel } from '@/lib/book-source/explore-nav-items';
import type { ExploreSection } from '@/lib/book-source/explore-sections';
import type { BookSource } from '@/types';

export interface SourceExploreDrawerContentProps {
  source: BookSource;
  sections: () => ExploreSection[];
  loading: () => boolean;
  error: () => boolean;
  errorMessage: () => string | undefined;
  onExploreSectionClick?: (source: BookSource, section: ExploreSection) => void;
  onExploreSelectChange: (source: BookSource, section: ExploreSection, value: string) => void;
}

export function SourceExploreDrawerContent(props: SourceExploreDrawerContentProps) {
  return (
    <div class="min-h-0 flex-1" data-corvu-no-drag>
      <Show when={props.loading()}>
        <ul class="flex flex-wrap justify-center gap-2 py-2">
          <li class="min-w-0 flex-[1_1_100%]">
            <div class="h-9 w-full animate-pulse rounded-lg border border-border/30 bg-muted/60" />
          </li>
          <li class="min-w-0 flex-[1_1_45%]">
            <div class="h-9 w-full animate-pulse rounded-lg border border-border/30 bg-muted/60" />
          </li>
          <li class="min-w-0 flex-[1_1_45%]">
            <div class="h-9 w-full animate-pulse rounded-lg border border-border/30 bg-muted/60" />
          </li>
          <li class="min-w-0 flex-[1_1_25%]">
            <div class="h-9 w-full animate-pulse rounded-lg border border-border/30 bg-muted/60" />
          </li>
          <li class="min-w-0 flex-[1_1_25%]">
            <div class="h-9 w-full animate-pulse rounded-lg border border-border/30 bg-muted/60" />
          </li>
          <li class="min-w-0 flex-[1_1_25%]">
            <div class="h-9 w-full animate-pulse rounded-lg border border-border/30 bg-muted/60" />
          </li>
          <li class="min-w-0 flex-[1_1_25%]">
            <div class="h-9 w-full animate-pulse rounded-lg border border-border/30 bg-muted/60" />
          </li>
        </ul>
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
        <ul class="flex flex-wrap justify-center gap-2">
          <For each={props.sections()}>
            {(section) => {
              const basisPct = section.style?.layout_flexBasisPercent ?? 1;
              const flexClass =
                basisPct <= 0.25
                  ? 'min-w-0 flex-[1_1_25%]'
                  : basisPct <= 0.45
                    ? 'min-w-0 flex-[1_1_45%]'
                    : 'min-w-0 flex-[1_1_100%]';
              const isSelect =
                section.type === 'select' &&
                section.chars &&
                section.chars.length > 0 &&
                section.paramKey;
              const isClickable = !!section.url;
              const selectValue = () => section.default ?? section.chars?.[0] ?? '';
              return (
                <li class={flexClass}>
                  <Show
                    when={isSelect}
                    fallback={
                      <Button
                        variant="outline"
                        class="flex h-auto min-h-9 w-full justify-center rounded-lg border-border/60 bg-background/80 px-3 py-2 text-center text-sm font-medium shadow-sm"
                        disabled={!isClickable}
                        onClick={() => props.onExploreSectionClick?.(props.source, section)}
                      >
                        <span class="min-w-0 truncate">{section.title}</span>
                      </Button>
                    }
                  >
                    <div class="flex w-full items-center gap-2 rounded-lg border border-border/60 bg-background/80 px-2 py-1.5 shadow-sm">
                      <Label class="shrink-0 text-xs text-muted-foreground">{section.title}</Label>
                      <div class="min-w-0 flex-1">
                        <AppSelect
                          value={selectValue()}
                          onChange={(v) => {
                            if (v) {
                              void props.onExploreSelectChange(props.source, section, v);
                            }
                          }}
                          options={[...section.chars!]}
                          itemComponent={(itemProps) => (
                            <AppSelectItem item={itemProps.item}>
                              {formatExploreSelectOptionLabel(
                                String(itemProps.item.rawValue),
                                section.paramKey,
                              )}
                            </AppSelectItem>
                          )}
                        >
                          <AppSelectTrigger layout="compact" aria-label={section.title}>
                            <AppSelectValue<string>>
                              {(state) =>
                                formatExploreSelectOptionLabel(
                                  state.selectedOption() ?? selectValue(),
                                  section.paramKey,
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
                </li>
              );
            }}
          </For>
        </ul>
      </Show>
      <Show when={!props.loading() && !props.error() && props.sections().length === 0}>
        <p class="py-3 text-center text-sm text-muted-foreground">该书源暂无发现内容（分类/排行榜）</p>
      </Show>
    </div>
  );
}
