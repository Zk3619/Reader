/**
 * RSS 收藏页
 */

import { createSignal, For, Show, onMount } from 'solid-js';
import { useBackHandler } from '@/lib/navigation/use-back-handler';
import { PageHeader } from '@/components/shell/PageHeader';
import { TruncatedTooltip } from '@/components/shared/TruncatedTooltip';
import * as rssStarsDb from '@/lib/database/rss-stars';
import * as rssSourcesDb from '@/lib/database/rss-sources';
import type { RssArticle, RssSource, RssStar } from '@/types';
import { Button } from '@/components/ui/button';
import { XIcon } from '@/components/shared/icons';
import { showAppToast } from '@/components/shared/AppToasts';

export interface RssFavoritesPageProps {
  onClose: () => void;
  onOpenArticle: (source: RssSource, article: RssArticle) => void;
}

function starToArticle(star: RssStar): RssArticle {
  return {
    origin: star.origin,
    link: star.link,
    sort: star.sort,
    title: star.title,
    order: 0,
    pubDate: star.pubDate,
    description: star.description,
    content: star.content,
    image: star.image,
    group: star.group,
    read: true,
    type: star.type,
    durPos: star.durPos,
  };
}

export function RssFavoritesPage(props: RssFavoritesPageProps) {
  const [stars, setStars] = createSignal<RssStar[]>([]);
  const [loading, setLoading] = createSignal(true);

  useBackHandler(() => () => {
    props.onClose();
    return true;
  });

  const reload = async () => {
    setLoading(true);
    try {
      setStars(await rssStarsDb.getAllRssStars());
    } finally {
      setLoading(false);
    }
  };

  onMount(() => void reload());

  const openStar = async (star: RssStar) => {
    const source = await rssSourcesDb.getRssSource(star.origin);
    if (!source) {
      showAppToast({ title: '源已不存在', variant: 'destructive' });
      return;
    }
    props.onOpenArticle(source, starToArticle(star));
  };

  const remove = async (star: RssStar) => {
    await rssStarsDb.deleteRssStar(star.origin, star.link);
    await reload();
    showAppToast({ title: '已取消收藏' });
  };

  return (
    <div class="fixed inset-0 z-[105] flex flex-col bg-background">
      <PageHeader title="订阅收藏" onBack={() => props.onClose()} />

      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        <Show when={loading()}>
          <div class="text-center text-muted-foreground py-8">加载中…</div>
        </Show>

        <Show when={!loading() && stars().length === 0}>
          <div class="rounded-2xl border border-border/50 bg-card p-8 text-center text-muted-foreground">
            暂无收藏
          </div>
        </Show>

        <div class="space-y-2">
          <For each={stars()}>
            {(star) => (
              <div class="flex items-center gap-3 rounded-xl border border-border/50 bg-card p-3">
                <div
                  class="min-w-0 flex-1 cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onClick={() => void openStar(star)}
                >
                  <TruncatedTooltip
                    as="div"
                    text={star.title}
                    class="font-medium text-foreground"
                  />
                  <Show when={star.pubDate?.trim()}>
                    <div class="text-xs text-muted-foreground">{star.pubDate}</div>
                  </Show>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  class="shrink-0 text-destructive"
                  onClick={() => void remove(star)}
                >
                  <XIcon class="h-4 w-4" />
                </Button>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}
