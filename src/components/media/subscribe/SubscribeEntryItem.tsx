/**
 * 订阅条目列表项：按 FeedView 切换文章 / 社交 / 图片 / 视频 / 音频 / 通知风格
 */

import { Show, type JSX } from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  BellIcon,
  GroupAudioIcon,
  PlayIcon,
  RssIcon,
  StarIcon,
} from '@/components/shared/icons';
import { SubscribeSourceLogo } from '@/components/media/subscribe/SubscribeSourceLogo';
import { cn } from '@/lib/utils';
import type { SubscribeFeedViewStored } from '@/lib/subscribe/feed-view';
import { isSubscribeFeedViewGrid } from '@/lib/subscribe/feed-view';

export type SubscribeEntryItemLogo = {
  title?: string | null;
  url?: string | null;
  metaJson?: string | null;
  siteUrl?: string | null;
  iconUrl?: string | null;
};

export type SubscribeEntryItemData = {
  id: string;
  title: string;
  summary?: string;
  publishedLabel?: string;
  read?: boolean;
  starred?: boolean;
  coverUrl?: string | null;
  feedTitle?: string;
  feedLogo?: SubscribeEntryItemLogo;
};

export function subscribeEntryListEstimateSize(view: SubscribeFeedViewStored): number {
  switch (view) {
    case 'social-media':
      return 176;
    case 'audios':
      return 88;
    case 'notifications':
      return 72;
    case 'articles':
    default:
      return 120;
  }
}

export function subscribeEntryGridEstimateRowSize(view: SubscribeFeedViewStored): number {
  return view === 'videos' ? 188 : 200;
}

function CoverImage(props: {
  src?: string | null;
  class?: string;
  fallback?: JSX.Element;
}) {
  return (
    <Show when={props.src} fallback={props.fallback}>
      {(src) => (
        <img
          src={src()}
          alt=""
          class={cn('object-cover', props.class)}
          loading="lazy"
          referrerpolicy="no-referrer"
        />
      )}
    </Show>
  );
}

function MetaRow(props: {
  logo?: SubscribeEntryItemLogo;
  feedTitle?: string;
  publishedLabel?: string;
  starred?: boolean;
  read?: boolean;
  logoRound?: boolean;
}) {
  return (
    <div class="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
      <SubscribeSourceLogo
        source={props.logo ?? { title: props.feedTitle || '订阅' }}
        class={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden bg-muted',
          props.logoRound ? 'rounded-full' : 'rounded',
        )}
        iconClass="h-3 w-3 text-muted-foreground"
      />
      <span class="min-w-0 truncate">{props.feedTitle || '订阅'}</span>
      <Show when={props.publishedLabel}>
        <span>·</span>
        <span class="shrink-0">{props.publishedLabel}</span>
      </Show>
      <Show when={props.starred}>
        <StarIcon class="h-3 w-3 shrink-0 fill-current text-amber-500" />
      </Show>
      <Show when={props.read === false}>
        <span class="ml-auto h-2 w-2 shrink-0 rounded-full bg-red-500" aria-label="未读" />
      </Show>
    </div>
  );
}

function ArticleLikeItem(props: {
  entry: SubscribeEntryItemData;
  active?: boolean;
  onClick?: () => void;
  /** 右侧缩略图：文章 / 音频 */
  variant: 'articles' | 'audios';
}) {
  const e = () => props.entry;
  const cover = () => e().coverUrl;
  const showThumb = () => props.variant === 'audios' || Boolean(cover());
  return (
    <Button
      type="button"
      variant="ghost"
      class={cn(
        'flex h-full w-full items-stretch gap-2.5 rounded-none border-b px-3 py-3 text-left font-normal whitespace-normal hover:bg-muted/40',
        props.active && 'bg-muted/60',
        e().read === false && 'bg-primary/3',
      )}
      onClick={props.onClick}
    >
      <div class="min-w-0 flex-1">
        <MetaRow
          logo={e().feedLogo}
          feedTitle={e().feedTitle}
          publishedLabel={e().publishedLabel}
          starred={e().starred}
          read={e().read}
        />
        <div
          class={cn(
            'line-clamp-2 text-sm leading-snug',
            e().read ? 'font-normal text-foreground/80' : 'font-semibold',
          )}
        >
          {e().title || '无标题'}
        </div>
        <Show when={e().summary}>
          <p class="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {e().summary}
          </p>
        </Show>
      </div>
      <Show when={showThumb()}>
        <div
          class={cn(
            'relative mt-0.5 flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted',
            props.variant === 'audios' && 'rounded-lg',
          )}
        >
          <CoverImage
            src={cover()}
            class="h-full w-full"
            fallback={
              props.variant === 'audios' ? (
                <GroupAudioIcon class="h-6 w-6 text-muted-foreground opacity-60" />
              ) : (
                <RssIcon class="h-5 w-5 text-muted-foreground opacity-40" />
              )
            }
          />
          <Show when={props.variant === 'audios'}>
            <span class="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-background/85 text-foreground shadow-sm">
              <PlayIcon class="h-3 w-3" />
            </span>
          </Show>
        </div>
      </Show>
    </Button>
  );
}

function SocialMediaItem(props: {
  entry: SubscribeEntryItemData;
  active?: boolean;
  onClick?: () => void;
}) {
  const e = () => props.entry;
  return (
    <Button
      type="button"
      variant="ghost"
      class={cn(
        'block h-full w-full rounded-none border-b px-3 py-3 text-left font-normal whitespace-normal hover:bg-muted/40',
        props.active && 'bg-muted/60',
        e().read === false && 'bg-primary/3',
      )}
      onClick={props.onClick}
    >
      <MetaRow
        logo={e().feedLogo}
        feedTitle={e().feedTitle}
        publishedLabel={e().publishedLabel}
        starred={e().starred}
        read={e().read}
        logoRound
      />
      <div
        class={cn(
          'text-sm leading-relaxed',
          e().read ? 'font-normal text-foreground/80' : 'font-medium',
        )}
      >
        <div class="line-clamp-6 whitespace-pre-wrap">
          {e().summary || e().title || '无标题'}
        </div>
      </div>
      <Show when={e().coverUrl}>
        <div class="mt-2 overflow-hidden rounded-lg border">
          <CoverImage src={e().coverUrl} class="aspect-16/10 w-full" />
        </div>
      </Show>
    </Button>
  );
}

function NotificationItem(props: {
  entry: SubscribeEntryItemData;
  active?: boolean;
  onClick?: () => void;
}) {
  const e = () => props.entry;
  return (
    <Button
      type="button"
      variant="ghost"
      class={cn(
        'flex h-full w-full items-start gap-2.5 rounded-none border-b px-3 py-2.5 text-left font-normal whitespace-normal hover:bg-muted/40',
        props.active && 'bg-muted/60',
        e().read === false && 'bg-primary/3',
      )}
      onClick={props.onClick}
    >
      <BellIcon class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span class="min-w-0 truncate font-medium text-foreground/80">
            {e().feedTitle || '订阅'}
          </span>
          <Show when={e().publishedLabel}>
            <span>·</span>
            <span class="shrink-0">{e().publishedLabel}</span>
          </Show>
          <Show when={e().starred}>
            <StarIcon class="h-3 w-3 shrink-0 fill-current text-amber-500" />
          </Show>
          <Show when={e().read === false}>
            <span class="ml-auto h-2 w-2 shrink-0 rounded-full bg-red-500" aria-label="未读" />
          </Show>
        </div>
        <div
          class={cn(
            'mt-0.5 line-clamp-2 text-sm leading-snug',
            e().read ? 'font-normal text-foreground/80' : 'font-semibold',
          )}
        >
          {e().title || '无标题'}
        </div>
      </div>
    </Button>
  );
}

function GridMediaItem(props: {
  entry: SubscribeEntryItemData;
  view: 'pictures' | 'videos';
  active?: boolean;
  onClick?: () => void;
}) {
  const e = () => props.entry;
  return (
    <Button
      type="button"
      variant="ghost"
      class={cn(
        'flex h-full w-full flex-col overflow-hidden rounded-lg border p-0 text-left font-normal whitespace-normal hover:bg-muted/40',
        props.active && 'ring-2 ring-primary/40',
        e().read === false && 'border-primary/25',
      )}
      onClick={props.onClick}
    >
      <div
        class={cn(
          'relative w-full overflow-hidden bg-muted',
          props.view === 'videos' ? 'aspect-video' : 'aspect-square',
        )}
      >
        <CoverImage
          src={e().coverUrl}
          class="h-full w-full"
          fallback={
            <div class="flex h-full w-full items-center justify-center text-muted-foreground">
              {props.view === 'videos' ? (
                <PlayIcon class="h-7 w-7 opacity-40" />
              ) : (
                <RssIcon class="h-6 w-6 opacity-40" />
              )}
            </div>
          }
        />
        <Show when={props.view === 'videos'}>
          <span class="absolute inset-0 flex items-center justify-center">
            <span class="flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white">
              <PlayIcon class="h-4 w-4" />
            </span>
          </span>
        </Show>
        <Show when={e().starred}>
          <StarIcon class="absolute right-1.5 top-1.5 h-3.5 w-3.5 fill-current text-amber-500 drop-shadow" />
        </Show>
        <Show when={e().read === false}>
          <span
            class="absolute left-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-background"
            aria-label="未读"
          />
        </Show>
      </div>
      <div class="w-full px-2 py-1.5">
        <div
          class={cn(
            'line-clamp-2 text-xs leading-snug',
            e().read ? 'font-normal text-foreground/80' : 'font-semibold',
          )}
        >
          {e().title || '无标题'}
        </div>
        <div class="mt-0.5 truncate text-[10px] text-muted-foreground">
          {e().feedTitle || '订阅'}
          <Show when={e().publishedLabel}>
            {' · '}
            {e().publishedLabel}
          </Show>
        </div>
      </div>
    </Button>
  );
}

/** 可点击列表项（首页） */
export function SubscribeEntryItem(props: {
  view: SubscribeFeedViewStored;
  entry: SubscribeEntryItemData;
  active?: boolean;
  onClick?: () => void;
}) {
  const view = () => props.view;
  if (view() === 'social-media') {
    return (
      <SocialMediaItem entry={props.entry} active={props.active} onClick={props.onClick} />
    );
  }
  if (view() === 'notifications') {
    return (
      <NotificationItem entry={props.entry} active={props.active} onClick={props.onClick} />
    );
  }
  if (view() === 'audios') {
    return (
      <ArticleLikeItem
        entry={props.entry}
        active={props.active}
        onClick={props.onClick}
        variant="audios"
      />
    );
  }
  if (view() === 'pictures' || view() === 'videos') {
    return (
      <GridMediaItem
        entry={props.entry}
        view={view() as 'pictures' | 'videos'}
        active={props.active}
        onClick={props.onClick}
      />
    );
  }
  return (
    <ArticleLikeItem
      entry={props.entry}
      active={props.active}
      onClick={props.onClick}
      variant="articles"
    />
  );
}

/** 弹窗预览用：非按钮静态样式，与首页同构 */
export function SubscribeEntryPreviewItem(props: {
  view: SubscribeFeedViewStored;
  entry: SubscribeEntryItemData;
}) {
  const view = () => props.view;
  const e = () => props.entry;

  if (isSubscribeFeedViewGrid(view())) {
    return (
      <div class="overflow-hidden rounded-lg border bg-background">
        <div
          class={cn(
            'relative w-full overflow-hidden bg-muted',
            view() === 'videos' ? 'aspect-video' : 'aspect-square',
          )}
        >
          <CoverImage
            src={e().coverUrl}
            class="h-full w-full"
            fallback={
              <div class="flex h-full w-full items-center justify-center text-muted-foreground">
                {view() === 'videos' ? (
                  <PlayIcon class="h-6 w-6 opacity-40" />
                ) : (
                  <RssIcon class="h-5 w-5 opacity-40" />
                )}
              </div>
            }
          />
          <Show when={view() === 'videos'}>
            <span class="absolute inset-0 flex items-center justify-center">
              <span class="flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white">
                <PlayIcon class="h-3.5 w-3.5" />
              </span>
            </span>
          </Show>
        </div>
        <div class="px-2 py-1.5">
          <div class="line-clamp-2 text-xs font-medium leading-snug">{e().title}</div>
          <div class="mt-0.5 truncate text-[10px] text-muted-foreground">
            {e().feedTitle}
            <Show when={e().publishedLabel}> · {e().publishedLabel}</Show>
          </div>
        </div>
      </div>
    );
  }

  if (view() === 'social-media') {
    return (
      <div class="px-3 py-3">
        <div class="mb-2 flex items-center gap-2 text-[11px] text-muted-foreground">
          <SubscribeSourceLogo
            class="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted"
            source={e().feedLogo ?? { title: e().feedTitle }}
          />
          <span class="min-w-0 truncate font-medium text-foreground/80">{e().feedTitle}</span>
          <Show when={e().publishedLabel}>
            <span class="shrink-0">· {e().publishedLabel}</span>
          </Show>
        </div>
        <div class="line-clamp-5 whitespace-pre-wrap text-sm leading-relaxed">
          {e().summary || e().title}
        </div>
        <Show when={e().coverUrl}>
          <div class="mt-2 overflow-hidden rounded-lg border">
            <CoverImage src={e().coverUrl} class="aspect-16/10 w-full" />
          </div>
        </Show>
      </div>
    );
  }

  if (view() === 'audios') {
    return (
      <div class="flex items-center gap-3 px-3 py-2.5">
        <div class="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
          <CoverImage
            src={e().coverUrl}
            class="h-full w-full"
            fallback={<GroupAudioIcon class="h-5 w-5 text-muted-foreground" />}
          />
          <span class="absolute bottom-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm">
            <PlayIcon class="h-2.5 w-2.5" />
          </span>
        </div>
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-medium">{e().title}</div>
          <div class="mt-0.5 truncate text-[11px] text-muted-foreground">
            {e().feedTitle}
            <Show when={e().publishedLabel}> · {e().publishedLabel}</Show>
          </div>
        </div>
      </div>
    );
  }

  if (view() === 'notifications') {
    return (
      <div class="flex gap-2.5 px-3 py-2">
        <BellIcon class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div class="min-w-0 flex-1">
          <div class="line-clamp-2 text-sm leading-snug">{e().title}</div>
          <div class="mt-0.5 truncate text-[11px] text-muted-foreground">
            {e().feedTitle}
            <Show when={e().publishedLabel}> · {e().publishedLabel}</Show>
          </div>
        </div>
      </div>
    );
  }

  // articles
  return (
    <div class="flex gap-2.5 px-3 py-2.5">
      <div class="min-w-0 flex-1">
        <div class="flex items-baseline gap-2 text-[11px] text-muted-foreground">
          <SubscribeSourceLogo
            class="inline-flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded bg-muted align-middle"
            source={e().feedLogo ?? { title: e().feedTitle }}
          />
          <span class="truncate font-medium text-foreground/80">{e().feedTitle}</span>
          <Show when={e().publishedLabel}>
            <span class="shrink-0 truncate">{e().publishedLabel}</span>
          </Show>
        </div>
        <div class="mt-0.5 line-clamp-2 text-sm font-medium leading-snug">{e().title}</div>
        <Show when={e().summary}>
          <p class="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{e().summary}</p>
        </Show>
      </div>
      <Show when={e().coverUrl}>
        <CoverImage
          src={e().coverUrl}
          class="mt-0.5 h-14 w-14 shrink-0 rounded-md"
        />
      </Show>
    </div>
  );
}
