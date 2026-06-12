/*
 * 订阅主页订阅源项：列表 / 网格 + 右键菜单
 */

import { Show, type JSX } from 'solid-js';
import type { RssSource } from '@/types';
import { getSourceDomain } from '@/lib/sources/source-sort';
import { cn } from '@/lib/utils';
import { TruncatedTooltip } from '@/components/shared/TruncatedTooltip';
import { RssPageSourceCover } from '@/components/rss/RssPageSourceCover';
import {
  AppContextMenu,
  AppContextMenuContent,
  AppContextMenuItem,
  AppContextMenuTrigger,
} from '@/components/shared/AppContextMenu';

export interface RssPageSourceItemActions {
  onOpen: (source: RssSource) => void;
  onEdit?: (source: RssSource) => void;
  onLogin?: (source: RssSource) => void;
  hasLogin?: (source: RssSource) => boolean;
  onPinTop: (source: RssSource) => void;
  onPinBottom: (source: RssSource) => void;
  onToggleEnable: (source: RssSource) => void;
  onClearCookieCf?: (source: RssSource) => void;
  onDelete: (source: RssSource) => void;
}

const LIST_CARD_CLASS =
  'flex h-14 cursor-pointer items-center gap-3 rounded-xl border border-border/50 bg-card px-4 text-sm transition-colors hover:bg-accent/30';

const GRID_CARD_CLASS =
  'flex w-[5.5rem] shrink-0 cursor-pointer flex-col gap-1 rounded-xl border border-border/50 bg-card p-1.5 text-sm transition-colors hover:bg-accent/30';

function RssPageSourceContextMenu(props: {
  source: RssSource;
  actions: RssPageSourceItemActions;
  children: JSX.Element;
}) {
  return (
    <AppContextMenu>
      <AppContextMenuTrigger as="div" class="outline-none">
        {props.children}
      </AppContextMenuTrigger>
      <AppContextMenuContent layout="compact">
        <AppContextMenuItem onSelect={() => props.actions.onEdit?.(props.source)}>
          编辑
        </AppContextMenuItem>
        <Show when={props.actions.hasLogin?.(props.source)}>
          <AppContextMenuItem onSelect={() => props.actions.onLogin?.(props.source)}>
            登录
          </AppContextMenuItem>
        </Show>
        <AppContextMenuItem onSelect={() => props.actions.onPinTop(props.source)}>
          置顶
        </AppContextMenuItem>
        <AppContextMenuItem onSelect={() => props.actions.onPinBottom(props.source)}>
          置底
        </AppContextMenuItem>
        <AppContextMenuItem onSelect={() => props.actions.onToggleEnable(props.source)}>
          {props.source.enabled ? '禁用' : '启用'}
        </AppContextMenuItem>
        <AppContextMenuItem onSelect={() => props.actions.onClearCookieCf?.(props.source)}>
          清除 Cookie/CF 记录
        </AppContextMenuItem>
        <AppContextMenuItem
          class="text-destructive focus:text-destructive"
          onSelect={() => props.actions.onDelete(props.source)}
        >
          删除
        </AppContextMenuItem>
      </AppContextMenuContent>
    </AppContextMenu>
  );
}

function openSourceKeyHandler(
  source: RssSource,
  onOpen: (source: RssSource) => void,
): (e: KeyboardEvent) => void {
  return (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen(source);
    }
  };
}

export function RssPageSourceListItem(props: {
  source: RssSource;
  actions: RssPageSourceItemActions;
}) {
  const domain = () => getSourceDomain(props.source.sourceUrl);

  return (
    <RssPageSourceContextMenu source={props.source} actions={props.actions}>
      <div
        class={LIST_CARD_CLASS}
        role="button"
        tabIndex={0}
        onClick={() => props.actions.onOpen(props.source)}
        onKeyDown={openSourceKeyHandler(props.source, props.actions.onOpen)}
      >
        <div class="h-9 w-9 shrink-0 overflow-hidden rounded-lg">
          <RssPageSourceCover iconUrl={props.source.sourceIcon} iconClass="h-5 w-5" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex min-w-0 items-center gap-2">
            <TruncatedTooltip
              as="span"
              text={props.source.sourceName}
              class="min-w-0 shrink font-medium text-foreground"
            />
            <Show when={props.source.sourceGroup?.trim()}>
              <TruncatedTooltip
                as="span"
                text={props.source.sourceGroup!}
                class="min-w-0 shrink-2 rounded bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground"
              />
            </Show>
          </div>
          <TruncatedTooltip
            as="div"
            text={domain()}
            class="text-xs text-muted-foreground"
          />
        </div>
      </div>
    </RssPageSourceContextMenu>
  );
}

export function RssPageSourceGridItem(props: {
  source: RssSource;
  actions: RssPageSourceItemActions;
}) {
  return (
    <RssPageSourceContextMenu source={props.source} actions={props.actions}>
      <div
        class={GRID_CARD_CLASS}
        role="button"
        tabIndex={0}
        onClick={() => props.actions.onOpen(props.source)}
        onKeyDown={openSourceKeyHandler(props.source, props.actions.onOpen)}
      >
        <div class="aspect-square w-full overflow-hidden rounded-lg">
          <RssPageSourceCover iconUrl={props.source.sourceIcon} iconClass="h-6 w-6" />
        </div>
        <div
          class="flex h-8 shrink-0 items-center justify-center overflow-hidden"
          title={props.source.sourceName}
        >
          <p
            class={cn(
              'line-clamp-2 w-full wrap-break-word text-center text-xs font-medium leading-4 text-foreground',
            )}
          >
            {props.source.sourceName}
          </p>
        </div>
      </div>
    </RssPageSourceContextMenu>
  );
}
