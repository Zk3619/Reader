/**
 * 文本阅读器顶栏下方：章节名 + 源地址（InnerWeb）、书源操作菜单（对齐 Legado ReadMenu title_bar_addition）
 */

import { createEffect, createSignal, Show } from 'solid-js';
import type { Book, BookChapter, BookSource } from '@/types';
import { cn } from '@/lib/utils';
import { isLocalBook } from '@/lib/local-book';
import { getSource, enableSource } from '@/lib/database/sources';
import { resolveUrl } from '@/lib/book-source/utils';
import { buildSourceRequestHeaders } from '@/lib/book-source/source-http';
import { shouldUseInnerWebDocumentProxy } from '@/lib/http/inner-web-proxy-session';
import { openInnerWeb } from '@/lib/platform/inner-web';
import { getStoredSourceCookiesForUrl } from '@/lib/js-engine';
import { showAppToast } from '@/components/shared/AppToasts';
import {
  AppDropdownMenu,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import { ViewerAppDropdownMenuContent } from '@/components/viewer/viewer-app-overlay';
import { mediaViewerChromeHitTargetClass } from '@/components/viewer/viewer-chrome';
import { useMediaViewerChromeFloating } from '@/lib/viewer/viewer-chrome-layout';
import { ChevronDownIcon } from '@/components/shared/icons';

export interface TextViewerChapterSourceBarProps {
  book: Book | null | undefined;
  chapter: BookChapter | undefined;
  chapterTitle: string;
  onSourceEdit?: (source: BookSource) => void;
  onSourceLogin?: (source: BookSource) => void;
  onSourceVariables?: (source: BookSource) => void;
}

function sourceHasLogin(source: BookSource): boolean {
  return !!(source.loginUrl?.trim() || source.loginCheckJs?.trim());
}

function resolveChapterDisplayUrl(chapter: BookChapter, book: Book, source: BookSource | null): string {
  const base = chapter.baseUrl || book.origin || source?.sourceUrl || '';
  return resolveUrl(base, chapter.url).split(',{')[0]?.trim() ?? '';
}

function openChapterUrlInInnerWeb(
  title: string,
  rawUrl: string,
  source: BookSource,
): void {
  const url = rawUrl.split(',{')[0]?.trim() ?? '';
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) {
    showAppToast({
      title: '无法在网页中打开',
      description: '当前章节地址不是可浏览的 http(s) 链接',
      variant: 'default',
    });
    return;
  }
  const cookies = getStoredSourceCookiesForUrl(source, url);
  const headers = buildSourceRequestHeaders(source, url);
  const useProxyDocument = shouldUseInnerWebDocumentProxy(url);
  const opened = openInnerWeb({
    title: title || '章节',
    url,
    cookieSyncUrl: url,
    initialCookies: cookies || undefined,
    bookSourceUrl: source.bookSourceUrl,
    useProxyDocument,
    proxyForwardHeaders: useProxyDocument ? headers : undefined,
  });
  if (!opened) {
    showAppToast({ title: '打开网页失败', variant: 'destructive' });
  }
}

export function TextViewerChapterSourceBar(props: TextViewerChapterSourceBarProps) {
  const floating = useMediaViewerChromeFloating();
  const [source, setSource] = createSignal<BookSource | null>(null);
  const [menuOpen, setMenuOpen] = createSignal(false);

  const visible = () => {
    const book = props.book;
    if (!book || isLocalBook(book) || textViewerGuestOrNoOrigin(book)) return false;
    return !!props.chapter;
  };

  createEffect(() => {
    const book = props.book;
    if (!book || isLocalBook(book) || !book.origin || book.origin === 'local') {
      setSource(null);
      return;
    }
    let cancelled = false;
    void getSource(book.origin).then((s) => {
      if (!cancelled) setSource(s);
    });
    return () => {
      cancelled = true;
    };
  });

  const chapterUrl = () => {
    const book = props.book;
    const chapter = props.chapter;
    if (!book || !chapter) return '';
    return resolveChapterDisplayUrl(chapter, book, source());
  };

  const handleOpenChapterUrl = () => {
    const src = source();
    const book = props.book;
    if (!src || !book || isLocalBook(book)) return;
    openChapterUrlInInnerWeb(props.chapterTitle || props.chapter?.title || '章节', chapterUrl(), src);
  };

  const handleToggleSourceEnabled = async () => {
    const src = source();
    if (!src) return;
    const nextEnabled = !src.enabled;
    try {
      await enableSource(src.sourceUrl, nextEnabled);
      setSource({ ...src, enabled: nextEnabled });
      showAppToast({
        title: nextEnabled ? '已启用书源' : '已禁用书源',
        description: `「${src.sourceName}」已${nextEnabled ? '启用' : '禁用'}`,
      });
    } catch (e) {
      showAppToast({
        title: nextEnabled ? '启用书源失败' : '禁用书源失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
    }
  };

  const hitTarget = () =>
    cn('no-drag', floating.isFloating() ? mediaViewerChromeHitTargetClass : undefined);

  return (
    <Show when={visible()}>
      <div
        class={cn(
          'flex w-full min-w-0 items-stretch gap-2 border-t border-border/40 px-4 py-1.5',
          floating.isFloating() && 'pointer-events-none px-3',
        )}
        data-media-viewer-interactive-zone
      >
        <button
          type="button"
          class={cn(
            hitTarget(),
            'min-w-0 flex-1 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-accent/40',
          )}
          onClick={handleOpenChapterUrl}
          aria-label="在应用内打开章节网页"
        >
          <div class="truncate text-sm font-medium text-foreground">{props.chapterTitle || '—'}</div>
          <Show when={chapterUrl()}>
            <div class="truncate text-xs text-muted-foreground">{chapterUrl()}</div>
          </Show>
        </button>

        <Show when={source()}>
          {(src) => (
            <AppDropdownMenu open={menuOpen()} onOpenChange={setMenuOpen}>
              <AppDropdownMenuTrigger
                as="button"
                type="button"
                class={cn(
                  hitTarget(),
                  'inline-flex max-w-30 shrink-0 items-center gap-0.5 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/15',
                )}
                aria-label="书源操作"
              >
                <span class="min-w-0 truncate">{src().sourceName || '书源'}</span>
                <ChevronDownIcon class="size-3.5 shrink-0 opacity-70" />
              </AppDropdownMenuTrigger>
              <ViewerAppDropdownMenuContent layout="min" align="end">
                <Show when={sourceHasLogin(src())}>
                  <AppDropdownMenuItem onSelect={() => props.onSourceLogin?.(src())}>
                    登录
                  </AppDropdownMenuItem>
                </Show>
                <AppDropdownMenuItem onSelect={() => props.onSourceVariables?.(src())}>
                  设置源变量
                </AppDropdownMenuItem>
                <AppDropdownMenuItem onSelect={() => props.onSourceEdit?.(src())}>
                  编辑书源
                </AppDropdownMenuItem>
                <AppDropdownMenuItem
                  deferOnSelect={false}
                  class={src().enabled ? 'text-destructive focus:text-destructive' : undefined}
                  onSelect={() => void handleToggleSourceEnabled()}
                >
                  {src().enabled ? '禁用书源' : '启用书源'}
                </AppDropdownMenuItem>
              </ViewerAppDropdownMenuContent>
            </AppDropdownMenu>
          )}
        </Show>
      </div>
    </Show>
  );
}

function textViewerGuestOrNoOrigin(book: Book): boolean {
  return !book.origin || book.origin === 'local';
}
