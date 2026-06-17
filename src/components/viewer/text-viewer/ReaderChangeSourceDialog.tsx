/**
 * 换源对话框（对齐 Legado ChangeBookSourceDialog / ChangeChapterSourceDialog）
 */

import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  Show,
} from 'solid-js';
import { Dynamic } from 'solid-js/web';
import type { Book, BookChapter, SearchBook } from '@/types';
import { Button } from '@/components/ui/button';
import { TextField, TextFieldInput } from '@/components/ui/text-field';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem, RadioGroupItemLabel } from '@/components/ui/radio-group';
import {
  AppDropdownMenu,
  AppDropdownMenuCheckboxItem,
  AppDropdownMenuContent,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogDescription,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
  ViewerAppDropdownMenuContent,
} from '@/components/viewer/viewer-app-overlay';
import { MoreIcon, RefreshIcon } from '@/components/shared/icons';
import { DialogScrollViewport } from '@/components/shared/DialogScrollViewport';
import {
  dialogVirtualListPanelHeight,
  dialogVirtualListPanelWidth,
  dialogVirtualListScroll,
  maxHDialog,
  popperNestedListScroll,
  scrollEdgeInset,
} from '@/lib/ui/viewport-classes';
import { cn } from '@/lib/utils';
import { showAppToast } from '@/components/shared/AppToasts';
import {
  applyChangeSource,
  ChangeSourceSearchSession,
  fetchChapterContentForChangeSource,
  loadChangeSourcePrefs,
  loadChangeSourceToc,
  matchChapterIndexForChangeSource,
  saveChangeSourcePrefs,
  type ChangeSourcePrefs,
} from '@/lib/media/text/change-source';
import * as sourcesDb from '@/lib/database/sources';
import { getAllSourceGroups } from '@/lib/database/sources';
import { isLocalBook } from '@/lib/local-book';
import { textViewerStore } from '@/stores/viewer';

export type ChangeSourceMode = 'book' | 'chapter';

export interface ReaderChangeSourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 初始换源模式（阅读器弹窗内可切换） */
  defaultMode?: ChangeSourceMode;
  book: Book | null;
  chapterIndex?: number;
  chapterTitle?: string;
  /** viewer：阅读器叠层；app：书籍信息页等常规页面 */
  presentation?: 'viewer' | 'app';
  /** 是否显示整书/单章换源单选（书籍详情固定整书，不显示） */
  showModePicker?: boolean;
  applyBook?: (book: Book, item: SearchBook) => Promise<Book>;
  onBookChanged: (book: Book) => void;
  onChapterReplaced?: () => void;
}

function formatRespondTime(ms: number): string {
  if (ms < 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ReaderChangeSourceDialog(props: ReaderChangeSourceDialogProps) {
  const showModePicker = () =>
    props.showModePicker ?? (props.presentation ?? 'viewer') !== 'app';
  const [mode, setMode] = createSignal<ChangeSourceMode>(props.defaultMode ?? 'book');
  const modeOptionRowClass =
    'flex cursor-pointer items-center rounded-md px-2 py-1.5 hover:bg-muted/50 has-[[data-checked]]:bg-accent has-[[data-checked]]:text-accent-foreground';
  const triggerModeOptionRadio = (el: HTMLElement) =>
    el.querySelector<HTMLInputElement>('input[type="radio"]')?.click();

  const effectiveMode = (): ChangeSourceMode => (showModePicker() ? mode() : 'book');

  const [prefs, setPrefs] = createSignal<ChangeSourcePrefs>(loadChangeSourcePrefs());
  const [results, setResults] = createSignal<SearchBook[]>([]);
  const [searching, setSearching] = createSignal(false);
  const [progress, setProgress] = createSignal({ done: 0, total: 0, name: '' });
  const [screenKey, setScreenKey] = createSignal('');
  const [applying, setApplying] = createSignal(false);
  const [groups, setGroups] = createSignal<string[]>([]);
  const [tocOpen, setTocOpen] = createSignal(false);
  const [tocLoading, setTocLoading] = createSignal(false);
  const [tocChapters, setTocChapters] = createSignal<BookChapter[]>([]);
  const [pickedSearchBook, setPickedSearchBook] = createSignal<SearchBook | null>(null);
  const [optionsOpen, setOptionsOpen] = createSignal(false);

  let session: ChangeSourceSearchSession | null = null;
  let listEl: HTMLDivElement | undefined;

  const title = () => {
    if (effectiveMode() === 'chapter') {
      return props.chapterTitle || '单章换源';
    }
    const b = props.book;
    if (!b) return '整书换源';
    return b.name;
  };

  const subtitle = () => {
    if (effectiveMode() === 'chapter') return props.book?.name ?? '';
    return props.book?.author ?? '';
  };

  const currentOriginName = () => props.book?.originName ?? '—';

  const isCurrentSource = (item: SearchBook) => item.bookUrl === props.book?.bookUrl;

  const startSearch = async (fresh = false) => {
    const book = props.book;
    if (!book || isLocalBook(book)) return;

    session?.close();
    session = new ChangeSourceSearchSession();
    session.setCallbacks({
      onResults: (books) => setResults(books),
      onProgress: (done, total, name) => setProgress({ done, total, name }),
      onFinish: (empty) => {
        setSearching(false);
        if (empty) {
          showAppToast({
            title: '未找到可换源',
            description: '其他书源中未搜索到匹配结果',
          });
        }
      },
      onError: (msg) => {
        setSearching(false);
        showAppToast({ title: '搜索失败', description: msg, variant: 'destructive' });
      },
    });

    setSearching(true);
    if (!fresh) {
      const cached = await session.loadCached(book, prefs(), screenKey());
      if (cached.length > 0) {
        setSearching(false);
        return;
      }
    }
    await session.startSearch(book, prefs(), screenKey());
    setSearching(false);
  };

  const handleOpenChange = (open: boolean) => {
    props.onOpenChange(open);
    if (!open) {
      session?.close();
      session = null;
      setTocOpen(false);
      setPickedSearchBook(null);
      setTocChapters([]);
    }
  };

  const resetModePickerState = () => {
    setMode(props.defaultMode ?? 'book');
    setTocOpen(false);
    setPickedSearchBook(null);
    setTocChapters([]);
  };

  const handleModeChange = (next: ChangeSourceMode) => {
    if (next === mode()) return;
    setMode(next);
    setTocOpen(false);
    setPickedSearchBook(null);
    setTocChapters([]);
  };

  createEffect(() => {
    if (!props.open || !props.book) return;
    resetModePickerState();
    setPrefs(loadChangeSourcePrefs());
    void getAllSourceGroups().then(setGroups);
    void startSearch();
  });

  onCleanup(() => session?.close());

  const updatePrefs = (patch: Partial<ChangeSourcePrefs>) => {
    const next = saveChangeSourcePrefs(patch);
    setPrefs(next);
    if (props.open && props.book) {
      void startSearch(true);
    }
  };

  const applyBook = async (item: SearchBook) => {
    const book = props.book;
    if (!book || applying()) return;
    setApplying(true);
    try {
      const apply = props.applyBook ?? applyChangeSource;
      const next = await apply(book, item);
      showAppToast({ title: '换源成功', description: item.originName });
      props.onBookChanged(next);
      handleOpenChange(false);
    } catch (e) {
      showAppToast({
        title: '换源失败',
        description: e instanceof Error ? e.message : '未知错误',
        variant: 'destructive',
      });
    } finally {
      setApplying(false);
    }
  };

  const openTocForChapter = async (item: SearchBook) => {
    const book = props.book;
    if (!book || effectiveMode() !== 'chapter') return;
    const source = await sourcesDb.getSource(item.origin);
    if (!source) {
      showAppToast({ title: '书源不存在', variant: 'destructive' });
      return;
    }
    setPickedSearchBook(item);
    setTocOpen(true);
    setTocLoading(true);
    setTocChapters([]);
    try {
      const toc = await loadChangeSourceToc(book, item, source);
      setTocChapters(toc);
    } catch (e) {
      setTocOpen(false);
      showAppToast({
        title: '获取目录失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
    } finally {
      setTocLoading(false);
    }
  };

  const pickTocChapter = async (chapter: BookChapter, chapterIdx: number) => {
    const book = props.book;
    const item = pickedSearchBook();
    if (!book || !item || applying()) return;
    const source = await sourcesDb.getSource(item.origin);
    if (!source) return;

    const toc = tocChapters();
    const nextUrl = toc[chapterIdx + 1]?.url;
    setApplying(true);
    try {
      const raw = await fetchChapterContentForChangeSource(
        book,
        source,
        item,
        chapter,
        nextUrl,
      );
      const idx = props.chapterIndex ?? textViewerStore.state.chapterIndex;
      await textViewerStore.replaceChapterContent(raw, idx);
      showAppToast({ title: '单章换源成功', description: item.originName });
      props.onChapterReplaced?.();
      handleOpenChange(false);
    } catch (e) {
      showAppToast({
        title: '单章换源失败',
        description: e instanceof Error ? e.message : '未知错误',
        variant: 'destructive',
      });
    } finally {
      setApplying(false);
    }
  };

  const handleItemClick = (item: SearchBook) => {
    if (effectiveMode() === 'book') {
      void applyBook(item);
      return;
    }
    void openTocForChapter(item);
  };

  const scrollList = (toEnd: boolean) => {
    const el = listEl;
    if (!el) return;
    el.scrollTo({ top: toEnd ? el.scrollHeight : 0, behavior: 'smooth' });
  };

  const scrollToCurrentSource = () => {
    const el = listEl;
    const url = props.book?.bookUrl;
    if (!el || !url) return;
    const row = el.querySelector(`[data-book-url="${CSS.escape(url)}"]`);
    row?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  const matchedTocIndex = createMemo(() => {
    if (!tocOpen()) return 0;
    const toc = tocChapters();
    if (toc.length === 0) return 0;
    return matchChapterIndexForChangeSource(
      props.chapterIndex ?? 0,
      props.chapterTitle ?? '',
      toc,
    );
  });

  createEffect(() => {
    if (!tocOpen() || tocLoading()) return;
    const idx = matchedTocIndex();
    requestAnimationFrame(() => {
      const el = document.getElementById(`change-source-toc-${idx}`);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  });

  const progressText = () => {
    const p = progress();
    if (!searching()) return `共 ${results().length} 条`;
    if (p.total <= 0) return '正在搜索…';
    return `搜索中 ${p.done}/${p.total}${p.name ? ` · ${p.name}` : ''}`;
  };

  const dialogShell = createMemo(() =>
    (props.presentation ?? 'viewer') === 'app'
      ? {
          Root: AppDialog,
          Content: AppDialogContent,
          Header: AppDialogHeader,
          Title: AppDialogTitle,
          Description: AppDialogDescription,
          MenuContent: AppDropdownMenuContent,
        }
      : {
          Root: ViewerAppDialog,
          Content: ViewerAppDialogContent,
          Header: ViewerAppDialogHeader,
          Title: ViewerAppDialogTitle,
          Description: ViewerAppDialogDescription,
          MenuContent: ViewerAppDropdownMenuContent,
        },
  );

  return (
    <Dynamic
      component={dialogShell().Root}
      open={props.open}
      onOpenChange={handleOpenChange}
    >
      <Dynamic
        component={dialogShell().Content}
        class={cn(dialogVirtualListPanelWidth, maxHDialog)}
      >
        <Dynamic component={dialogShell().Header} class="px-6 pt-6 pb-2">
          <Dynamic component={dialogShell().Title} class="truncate text-left">
            {title()}
          </Dynamic>
          <Show when={subtitle()}>
            <Dynamic component={dialogShell().Description} class="truncate text-left">
              {subtitle()}
            </Dynamic>
          </Show>
        </Dynamic>

        <Show when={showModePicker()}>
          <div class="flex shrink-0 items-center gap-3 px-6 pb-2">
            <span class="shrink-0 text-xs text-muted-foreground">换源目标</span>
            <RadioGroup
              value={mode()}
              onChange={(value) => handleModeChange(value as ChangeSourceMode)}
              class="flex min-w-0 flex-1 flex-row gap-2"
            >
              <div
                class={cn(modeOptionRowClass, 'min-w-0 flex-1')}
                role="button"
                tabIndex={0}
                onClick={(e) => triggerModeOptionRadio(e.currentTarget)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    triggerModeOptionRadio(e.currentTarget);
                  }
                }}
              >
                <RadioGroupItem value="book" class="w-full">
                  <RadioGroupItemLabel>整书换源</RadioGroupItemLabel>
                </RadioGroupItem>
              </div>
              <div
                class={cn(modeOptionRowClass, 'min-w-0 flex-1')}
                role="button"
                tabIndex={0}
                onClick={(e) => triggerModeOptionRadio(e.currentTarget)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    triggerModeOptionRadio(e.currentTarget);
                  }
                }}
              >
                <RadioGroupItem value="chapter" class="w-full">
                  <RadioGroupItemLabel>单章换源</RadioGroupItemLabel>
                </RadioGroupItem>
              </div>
            </RadioGroup>
          </div>
        </Show>

        <div class="relative flex min-h-0 flex-1 flex-col gap-2 px-6 pb-4">
          <div class="flex shrink-0 items-center gap-2">
            <form
              class="flex min-w-0 flex-1 gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void session?.loadCached(props.book!, prefs(), screenKey());
              }}
            >
              <TextField class="min-w-0 flex-1">
                <TextFieldInput
                  value={screenKey()}
                  onInput={(e) => setScreenKey(e.currentTarget.value)}
                  placeholder="筛选书源或章节"
                />
              </TextField>
            </form>
            <Button
              variant="outline"
              size="icon"
              disabled={searching()}
              aria-label={searching() ? '停止搜索' : '重新搜索'}
              onClick={() => {
                if (searching()) {
                  session?.stop();
                  setSearching(false);
                  return;
                }
                void startSearch(true);
              }}
            >
              <RefreshIcon class={cn('size-5', searching() && 'animate-spin')} />
            </Button>
            <AppDropdownMenu open={optionsOpen()} onOpenChange={setOptionsOpen}>
              <AppDropdownMenuTrigger
                as={Button}
                variant="outline"
                size="icon"
                aria-label="换源选项"
              >
                <MoreIcon class="size-5" />
              </AppDropdownMenuTrigger>
              <Dynamic component={dialogShell().MenuContent} layout="min" align="end">
                <AppDropdownMenuCheckboxItem
                  checked={prefs().checkAuthor}
                  onChange={(checked) => updatePrefs({ checkAuthor: checked })}
                >
                  校验作者
                </AppDropdownMenuCheckboxItem>
                <AppDropdownMenuCheckboxItem
                  checked={prefs().loadWordCount}
                  onChange={(checked) => updatePrefs({ loadWordCount: checked })}
                >
                  加载字数
                </AppDropdownMenuCheckboxItem>
                <div class="px-2 py-1.5">
                  <div class="mb-1 px-2 text-xs text-muted-foreground">书源分组</div>
                  <div class={cn(popperNestedListScroll, 'max-h-40 space-y-1')}>
                    <button
                      type="button"
                      class={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent',
                        !prefs().searchGroup && 'bg-accent/60',
                      )}
                      onClick={() => updatePrefs({ searchGroup: '' })}
                    >
                      <Checkbox checked={!prefs().searchGroup} />
                      全部分组
                    </button>
                    <For each={groups()}>
                      {(group) => (
                        <button
                          type="button"
                          class={cn(
                            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent',
                            prefs().searchGroup === group && 'bg-accent/60',
                          )}
                          onClick={() => updatePrefs({ searchGroup: group })}
                        >
                          <Checkbox checked={prefs().searchGroup === group} />
                          <span class="truncate">{group}</span>
                        </button>
                      )}
                    </For>
                  </div>
                </div>
              </Dynamic>
            </AppDropdownMenu>
          </div>

          <p class="shrink-0 text-xs text-muted-foreground">{progressText()}</p>

          <DialogScrollViewport
            class={cn(dialogVirtualListPanelHeight, dialogVirtualListScroll)}
            trackRef={(el) => {
              listEl = el;
            }}
          >
            <ul class="space-y-2">
              <For each={results()}>
                {(item) => (
                  <li>
                    <button
                      type="button"
                      data-book-url={item.bookUrl}
                      class={cn(
                        'w-full rounded-lg border border-border/60 p-3 text-left transition-colors hover:bg-accent/40',
                        isCurrentSource(item) && 'border-primary/50 bg-primary/5',
                      )}
                      disabled={applying()}
                      onClick={() => handleItemClick(item)}
                    >
                      <div class="flex items-start justify-between gap-2">
                        <div class="min-w-0 flex-1">
                          <div class="font-medium">{item.originName}</div>
                          <div class="mt-0.5 truncate text-xs text-muted-foreground">
                            {item.latestChapterTitle || item.bookUrl}
                          </div>
                          <Show when={item.chapterWordCountText}>
                            <div class="mt-1 text-xs text-muted-foreground">
                              {item.chapterWordCountText}
                            </div>
                          </Show>
                        </div>
                        <div class="shrink-0 text-right text-xs text-muted-foreground">
                          <div>{formatRespondTime(item.respondTime)}</div>
                          <Show when={isCurrentSource(item)}>
                            <div class="mt-1 text-primary">当前</div>
                          </Show>
                        </div>
                      </div>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </DialogScrollViewport>

          <div class="flex shrink-0 items-center gap-2 border-t border-border/50 pt-2 text-xs">
            <button
              type="button"
              class="min-w-0 flex-1 truncate text-left text-muted-foreground hover:text-foreground"
              onClick={scrollToCurrentSource}
            >
              当前：{currentOriginName()}
            </button>
            <Button variant="ghost" size="sm" onClick={() => scrollList(false)}>
              顶部
            </Button>
            <Button variant="ghost" size="sm" onClick={() => scrollList(true)}>
              底部
            </Button>
          </div>

          <Show when={tocOpen()}>
            <div class="absolute inset-0 z-10 flex flex-col rounded-lg bg-background">
              <header class="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
                <Button variant="ghost" size="sm" onClick={() => setTocOpen(false)}>
                  返回
                </Button>
                <div class="min-w-0 flex-1">
                  <div class="truncate text-sm font-medium">
                    {pickedSearchBook()?.originName ?? '选择章节'}
                  </div>
                  <div class="truncate text-xs text-muted-foreground">选择对应章节获取正文</div>
                </div>
              </header>
              <div class={cn('min-h-0 flex-1 overflow-y-auto px-2', scrollEdgeInset)}>
                <Show when={tocLoading()}>
                  <p class="p-4 text-sm text-muted-foreground">加载目录…</p>
                </Show>
                <ul class="space-y-0.5">
                  <For each={tocChapters()}>
                    {(ch, idx) => (
                      <li>
                        <button
                          type="button"
                          id={`change-source-toc-${idx()}`}
                          class={cn(
                            'w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent',
                            idx() === matchedTocIndex() && 'bg-primary/10 text-primary',
                            ch.isVolume && 'font-medium text-muted-foreground',
                          )}
                          disabled={ch.isVolume || applying()}
                          onClick={() => void pickTocChapter(ch, idx())}
                        >
                          {ch.title}
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            </div>
          </Show>
        </div>
      </Dynamic>
    </Dynamic>
  );
}
