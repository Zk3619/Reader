/**
 * RSS 文章列表项（对齐 Legado articleStyle 0–4）
 */

import { For, Show } from 'solid-js';
import type { RssArticle, RssSource } from '@/types';
import { TruncatedTooltip } from '@/components/shared/TruncatedTooltip';
import { RssArticleCoverImg } from '@/components/rss/RssArticleCoverImg';
import { cn } from '@/lib/utils';

export interface RssArticleListItemsProps {
  articles: RssArticle[];
  source: RssSource;
  articleStyle: number;
  onSelect: (article: RssArticle) => void;
}

function ArticleThumb(props: {
  article: RssArticle;
  source: RssSource;
  class?: string;
}) {
  return (
    <Show when={props.article.image?.trim()}>
      <RssArticleCoverImg
        source={props.source}
        url={props.article.image}
        class={props.class}
      />
    </Show>
  );
}

function ArticleMeta(props: { article: RssArticle; class?: string }) {
  return (
    <Show when={props.article.pubDate?.trim()}>
      <div class={cn('text-xs text-muted-foreground', props.class)}>{props.article.pubDate}</div>
    </Show>
  );
}

function ArticleTitle(props: { article: RssArticle; lines?: number }) {
  return (
    <TruncatedTooltip
      as="div"
      text={props.article.title}
      class={cn(
        'font-medium text-foreground',
        props.lines === 2 ? 'line-clamp-2' : 'line-clamp-1',
      )}
    />
  );
}

/** 0 列表：左文右图 */
function StyleList(props: RssArticleListItemsProps) {
  return (
    <div class="space-y-2">
      <For each={props.articles}>
        {(article) => (
          <ArticleRow
            article={article}
            source={props.source}
            class="flex gap-3 p-3"
            imageClass="order-2 h-[4.25rem] w-[4.25rem] shrink-0 rounded object-cover"
            onSelect={props.onSelect}
          />
        )}
      </For>
    </div>
  );
}

/** 1 单列大图 */
function StyleSingle(props: RssArticleListItemsProps) {
  return (
    <div class="space-y-3">
      <For each={props.articles}>
        {(article) => (
          <button
            type="button"
            title={article.title}
            class={cn(
              'w-full overflow-hidden rounded-xl border border-border/50 bg-card text-left transition-colors hover:bg-accent/30',
              article.read && 'opacity-70',
            )}
            onClick={() => props.onSelect(article)}
          >
            <ArticleThumb
              article={article}
              source={props.source}
              class="aspect-[16/10] w-full object-cover"
            />
            <div class="space-y-1 p-3">
              <ArticleTitle article={article} lines={2} />
              <ArticleMeta article={article} />
            </div>
          </button>
        )}
      </For>
    </div>
  );
}

/** 2 双列 / 4 三列 */
function StyleGrid(props: RssArticleListItemsProps & { cols: 2 | 3 }) {
  return (
    <div
      class={cn(
        'grid gap-2',
        props.cols === 2 ? 'grid-cols-2' : 'grid-cols-3',
      )}
    >
      <For each={props.articles}>
        {(article) => (
          <button
            type="button"
            title={article.title}
            class={cn(
              'overflow-hidden rounded-lg border border-border/50 bg-card text-left transition-colors hover:bg-accent/30',
              article.read && 'opacity-70',
            )}
            onClick={() => props.onSelect(article)}
          >
            <ArticleThumb
              article={article}
              source={props.source}
              class={cn(
                'w-full object-cover',
                props.cols === 2 ? 'aspect-[3/4]' : 'aspect-[2/3]',
              )}
            />
            <div class="space-y-0.5 p-2">
              <ArticleTitle article={article} lines={2} />
              <ArticleMeta article={article} />
            </div>
          </button>
        )}
      </For>
    </div>
  );
}

/** 3 瀑布（双列错落卡片） */
function StyleWaterfall(props: RssArticleListItemsProps) {
  return (
    <div class="columns-2 gap-2 space-y-2">
      <For each={props.articles}>
        {(article) => (
          <button
            type="button"
            title={article.title}
            class={cn(
              'mb-2 w-full break-inside-avoid overflow-hidden rounded-xl border border-border/50 bg-card text-left shadow-sm transition-colors hover:bg-accent/30',
              article.read && 'opacity-70',
            )}
            onClick={() => props.onSelect(article)}
          >
            <ArticleThumb
              article={article}
              source={props.source}
              class="w-full object-cover"
            />
            <div class="space-y-1 p-2">
              <ArticleTitle article={article} lines={2} />
              <ArticleMeta article={article} />
            </div>
          </button>
        )}
      </For>
    </div>
  );
}

function ArticleRow(props: {
  article: RssArticle;
  source: RssSource;
  class?: string;
  imageClass?: string;
  onSelect: (article: RssArticle) => void;
}) {
  return (
    <button
      type="button"
      title={props.article.title}
      class={cn(
        'w-full rounded-xl border border-border/50 bg-card text-left transition-colors hover:bg-accent/30',
        props.article.read && 'opacity-70',
        props.class,
      )}
      onClick={() => props.onSelect(props.article)}
    >
      <div class="min-w-0 flex-1">
        <ArticleTitle article={props.article} lines={2} />
        <ArticleMeta article={props.article} class="mt-1" />
      </div>
      <ArticleThumb
        article={props.article}
        source={props.source}
        class={props.imageClass}
      />
    </button>
  );
}

export function RssArticleListItems(props: RssArticleListItemsProps) {
  const style = () => props.articleStyle;
  return (
    <Show when={style() === 1} fallback={
      <Show when={style() === 2} fallback={
        <Show when={style() === 3} fallback={
          <Show when={style() === 4} fallback={<StyleList {...props} />}>
            <StyleGrid {...props} cols={3} />
          </Show>
        }>
          <StyleWaterfall {...props} />
        </Show>
      }>
        <StyleGrid {...props} cols={2} />
      </Show>
    }>
      <StyleSingle {...props} />
    </Show>
  );
}
