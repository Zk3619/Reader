import { For } from 'solid-js';
import { cn } from '@/lib/utils';
import { bookshelfCompactListCardClass, bookshelfCompactMainClass } from '@/lib/bookshelf/book-group-card-styles';
import { ChevronRightIcon, BookSourceIcon, ListIcon, SearchIcon } from '@/components/shared/icons';
import {
  READING_RULE_NAV_ENTRIES,
  type ReadingRulePageId,
} from '@/lib/settings/reading-rules-nav';

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
    <div class="rounded-2xl border border-border/50 bg-card p-4">
      <div class="mb-3">
        <h3 class="font-semibold text-foreground">阅读规则</h3>
        <p class="text-sm text-muted-foreground">
          TXT 目录、替换净化与字典规则管理
        </p>
      </div>
      <ul class="flex flex-col gap-2">
        <For each={READING_RULE_NAV_ENTRIES}>
          {(entry) => {
            const Icon = ruleIconMap[entry.id];
            return (
              <li>
                <button
                  type="button"
                  class={cn(
                    bookshelfCompactListCardClass('h-14 w-full min-w-0'),
                    'cursor-pointer items-center text-left',
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
                  <span class="flex shrink-0 items-center pr-1.5 text-muted-foreground">
                    <ChevronRightIcon class="h-4 w-4" />
                  </span>
                </button>
              </li>
            );
          }}
        </For>
      </ul>
    </div>
  );
}
