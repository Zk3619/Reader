import { For } from 'solid-js';
import { cn } from '@/lib/utils';
import { bookshelfCompactMainClass } from '@/lib/bookshelf/book-group-card-styles';
import { ChevronRightIcon, BookSourceIcon, ListIcon, SearchIcon } from '@/components/shared/icons';
import {
  READING_RULE_NAV_ENTRIES,
  type ReadingRulePageId,
} from '@/lib/settings/reading-rules-nav';

const READING_RULES_SECTION_CARD_CLASS =
  'flex min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-border/50 bg-card';

const ruleIconMap: Record<ReadingRulePageId, typeof BookSourceIcon> = {
  'txt-toc': ListIcon,
  replace: BookSourceIcon,
  dict: SearchIcon,
};

export interface ReadingRulesHubProps {
  onOpen: (page: ReadingRulePageId) => void;
}

export function ReadingRulesHub(props: ReadingRulesHubProps) {
  return (
    <section class={READING_RULES_SECTION_CARD_CLASS}>
      <header class="shrink-0 border-b border-border/40 px-4 py-3">
        <h3 class="text-sm font-semibold text-foreground">阅读规则</h3>
        <p class="text-xs text-muted-foreground">
          TXT 目录、替换净化与字典规则管理
        </p>
      </header>

      <ul class="flex min-h-0 flex-1 flex-col divide-y divide-border/30">
        <For each={READING_RULE_NAV_ENTRIES}>
          {(entry) => {
            const Icon = ruleIconMap[entry.id];
            return (
              <li>
                <button
                  type="button"
                  class={cn(
                    'flex w-full min-w-0 cursor-pointer items-center gap-3 px-4 py-3 text-left',
                    'hover:bg-muted/40',
                  )}
                  onClick={() => props.onOpen(entry.id)}
                >
                  <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Icon class="h-4 w-4" size={16} />
                  </span>
                  <div class={bookshelfCompactMainClass()}>
                    <span class="truncate font-medium text-foreground">{entry.title}</span>
                    <span class="truncate text-xs text-muted-foreground">{entry.description}</span>
                  </div>
                  <span class="flex shrink-0 items-center pr-1 text-muted-foreground">
                    <ChevronRightIcon class="h-4 w-4" />
                  </span>
                </button>
              </li>
            );
          }}
        </For>
      </ul>
    </section>
  );
}
