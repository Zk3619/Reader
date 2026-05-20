/**
 * 阅读器主页面
 * 参考 legado：全屏阅读、顶部栏（返回/书名/目录/设置）、正文区、左右点击上一章/下一章、目录与设置面板
 */

import { createSignal, Show, onMount, onCleanup, createEffect } from 'solid-js';
import { readerStore } from '@/stores/reader';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from '@/components/ui/drawer';
import {
  AppDialog,
  AppDialogContent,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/AppDialog';
import { RadioGroup, RadioGroupItem, RadioGroupItemLabel } from '@/components/ui/radio-group';
import { ReaderContent } from './ReaderContent';
import { ReaderSettings } from './ReaderSettings';
import { ReaderCatalog } from './ReaderCatalog';
import { ReaderCommentsDrawer } from './ReaderCommentsDrawer';
import { cn } from '@/lib/utils';
import { isMobile, isTauri } from '@/lib/platform/detect';
import {
  ChevronLeftIcon,
  ListIcon,
  SettingsIcon,
  ImmersiveIcon,
  RefreshIcon,
  MoreIcon,
  ReplaceIcon,
  DownloadIcon,
  VolumeIcon,
  ThemeLightIcon,
  ThemeDarkIcon,
  XIcon,
} from '@/components/icons';
import { Slider, SliderTrack, SliderFill, SliderThumb } from '@/components/ui/slider';
import { showImmersiveEnterToast, shouldShowImmersiveEnterToast } from '@/components/AppToasts';
import { WindowControlButtons } from '@/components/WindowControlButtons';
import { Separator } from '@/components/ui/separator';

const LONG_PRESS_MS = 400;
const TAP_MOVE_THRESHOLD = 10;

/** 阅读器主题 0–6 的底栏配色（与 ReaderContent 正文一致，窄屏+移动端时使用）；边框与背景对比明显，各主题下都清晰可见 */
const READER_THEME_BAR: Record<number, { bg: string; text: string; border: string }> = {
  0: { bg: 'bg-[#f5f0e6]', text: 'text-[#5b4636]', border: 'border-t-[#9c8b7a]' },
  1: { bg: 'bg-[#e8f5e9]', text: 'text-[#2e7d32]', border: 'border-t-[#43a047]' },
  2: { bg: 'bg-[#f5e6d3]', text: 'text-[#5d4e37]', border: 'border-t-[#a08060]' },
  3: { bg: 'bg-[#e3f2fd]', text: 'text-[#1565c0]', border: 'border-t-[#1976d2]' },
  4: { bg: 'bg-[#f3e5f5]', text: 'text-[#6a1b9a]', border: 'border-t-[#7b1fa2]' },
  5: { bg: 'bg-[#263238]', text: 'text-[#b0bec5]', border: 'border-t-[#546e7a]' },
  6: { bg: 'bg-[#1e1e1e]', text: 'text-[#cfcfcf]', border: 'border-t-[#616161]' },
};

export interface ReaderPageProps {
  onClose: () => void;
  /** 点击顶栏书名时进入书籍信息页（不传则书名不可点） */
  onOpenBookInfo?: () => void;
}

export function ReaderPage(props: ReaderPageProps) {
  const [topBarVisible, setTopBarVisible] = createSignal(true);
  /** 沉浸模式：仅正文，隐藏顶栏/底栏/段评气泡，禁用中间点击 */
  const [immersiveMode, setImmersiveMode] = createSignal(false);
  const [catalogOpen, setCatalogOpen] = createSignal(false);
  /** 目录列表滚动位置缓存（关闭时保存，再次打开时恢复），换书时清零 */
  const [catalogScrollTop, setCatalogScrollTop] = createSignal(0);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  /** 设置抽屉（另外的菜单）：仅窄屏底栏的「设置」打开 */
  const [readerMenuDrawerOpen, setReaderMenuDrawerOpen] = createSignal(false);
  const [statusBarStyleDialogOpen, setStatusBarStyleDialogOpen] = createSignal(false);
  /** 阅读进度状态栏选项行：整行可点触发 radio，仅本弹窗使用 */
  const statusBarOptionRowClass =
    'flex cursor-pointer items-center rounded-md px-2 py-1.5 hover:bg-muted/50 has-[[data-checked]]:bg-accent has-[[data-checked]]:text-accent-foreground'
  const triggerStatusBarOptionRadio = (el: HTMLElement) =>
    el.querySelector<HTMLInputElement>('input[type="radio"]')?.click()
  const [commentsOpen, setCommentsOpen] = createSignal(false);
  const [commentsSegment, setCommentsSegment] = createSignal<{ chapterIndex: number; segmentIndex: number } | null>(null);
  /** 宽屏下段评面板正在播放关闭动画，动画结束后再置为 false 并关闭 */
  const [panelClosing, setPanelClosing] = createSignal(false);
  /** 宽屏下段评面板刚打开，用于进入动画（从右侧滑入） */
  const [panelEntering, setPanelEntering] = createSignal(false);
  const [isWideScreen, setIsWideScreen] = createSignal(window.innerWidth >= 480);
  const [isDark, setIsDark] = createSignal(document.documentElement.classList.contains('dark'));

  let tapStartTime = 0;
  let tapStartX = 0;
  let tapStartY = 0;
  let tapMoved = false;

  const book = () => readerStore.state.book;
  const catalog = () => readerStore.state.catalog;
  const chapterIndex = () => readerStore.state.chapterIndex;
  const currentChapter = () => catalog()[chapterIndex()];
  const showContent = () => readerStore.state.showContent;
  const content = () => readerStore.state.content;
  const chapterPos = () => readerStore.state.chapterPos;

  /** 阅读进度状态栏是否显示（仅控制状态栏，不绑操作栏） */
  const statusBarVisible = () => {
    const style = readerStore.state.config.statusBarDisplayStyle;
    if (style === 'always') return true;
    if (style === 'never') return false;
    return topBarVisible() && !immersiveMode();
  };
  /** 底栏操作栏是否显示（窄屏且顶栏可见且非沉浸） */
  const operationBarVisible = () => !isWideScreen() && topBarVisible() && !immersiveMode();
  /** 底栏：本章字数展示（优先章节 wordCount，否则按正文长度） */
  const chapterWordCountText = () => {
    const ch = currentChapter();
    if (ch?.wordCount) return ch.wordCount;
    const len = content().length;
    if (len >= 10000) return `${(len / 10000).toFixed(1)}万`;
    return len > 0 ? String(len) : '—';
  };
  /** 底栏：本章阅读进度 0–100（chapterPos 存的是 0–1 的滚动比例，非字符偏移） */
  const chapterProgressPercent = () => Math.round(Math.max(0, Math.min(100, chapterPos() * 100)));
  /** 底栏：全书阅读进度 0–100 */
  const bookProgressPercent = () => {
    const total = catalog().length;
    if (total <= 0) return 0;
    return Math.round(((chapterIndex() + 1) / total) * 100);
  };

  /** 窄屏且移动端：底栏仅在「状态栏始终显示」时使用阅读器主题配色，其他情况用应用级主题 */
  const isNarrowAndMobile = () => !isWideScreen() && isMobile();
  const readerTheme = () => readerStore.state.config.theme ?? 0;
  const bottomBarThemeClasses = () => {
    if (!isNarrowAndMobile()) return null;
    if (readerStore.state.config.statusBarDisplayStyle !== 'always') return null;
    const t = READER_THEME_BAR[readerTheme()] ?? READER_THEME_BAR[0];
    return `border-t ${t.border} ${t.bg} ${t.text}`;
  };

  // 监听书籍变化，重置滚动恢复标志与目录滚动缓存
  createEffect(() => {
    const currentBook = book();
    if (!currentBook) {
      hasRestoredInitialScroll = false;
      lastChapterIndex = -1;
      setCatalogScrollTop(0);
    } else {
      hasRestoredInitialScroll = false;
      lastChapterIndex = -1;
      setCatalogScrollTop(0);
    }
  });

  const handlePrev = () => readerStore.prevChapter();
  const handleNext = () => readerStore.nextChapter();

  /** 操作栏进度条：拖动时更新本章进度并同步滚动位置 */
  const handleChapterProgressChange = (values: number[]) => {
    const p = Math.max(0, Math.min(1, values[0] ?? 0));
    readerStore.setChapterPos(p);
    if (scrollContainer) {
      const sh = scrollContainer.scrollHeight;
      const ch = scrollContainer.clientHeight;
      scrollContainer.scrollTop = sh > ch ? p * (sh - ch) : 0;
    }
  };

  const toggleTopBar = () => setTopBarVisible((v) => !v);

  const toggleTheme = (pressed: boolean) => {
    setIsDark(pressed);
    document.documentElement.classList.toggle('dark', pressed);
  };

  const openComments = (chapterIndex: number, segmentIndex: number) => {
    const seg = commentsSegment();
    const open = commentsOpen();
    const wide = isWideScreen();
    const isSameSegment = seg && seg.chapterIndex === chapterIndex && seg.segmentIndex === segmentIndex;
    if (isSameSegment && open) {
      if (wide) setPanelClosing(true);
      else setCommentsOpen(false);
    } else {
      setCommentsSegment({ chapterIndex, segmentIndex });
      setPanelClosing(false);
      if (wide && !open) setPanelEntering(true);
      setCommentsOpen(true);
    }
  };

  const handleCloseComments = () => {
    if (isWideScreen()) setPanelClosing(true);
    else setCommentsOpen(false);
  };

  const handleCommentsPanelTransitionEnd = (e: TransitionEvent) => {
    if (e.target !== e.currentTarget || !panelClosing()) return;
    setCommentsOpen(false);
    setPanelClosing(false);
  };

  /** 段评数量（mock：暂无数据源时按章节/段返回 0；可改为接口） */
  const getSegmentCommentCount = (_chapterIndex: number, segmentIndex: number) => {
    if (segmentIndex <= 1) return 3; // 演示：章节标题与第一段显示气泡
    return 0;
  };

  createEffect(() => {
    if (!panelEntering()) return;
    let id: number;
    id = requestAnimationFrame(() => {
      id = requestAnimationFrame(() => setPanelEntering(false));
    });
    return () => cancelAnimationFrame(id);
  });

  onMount(() => {
    const handleResize = () => setIsWideScreen(window.innerWidth >= 480);
    window.addEventListener('resize', handleResize);
    onCleanup(() => window.removeEventListener('resize', handleResize));
  });

  onMount(() => {
    const checkTheme = () => setIsDark(document.documentElement.classList.contains('dark'));
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    onCleanup(() => observer.disconnect());
  });

  onMount(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCatalogOpen(false);
        setSettingsOpen(false);
        if (immersiveMode()) setImmersiveMode(false);
        else if (commentsOpen()) setPanelClosing(true);
        else if (!catalogOpen() && !settingsOpen()) setTopBarVisible((v) => !v);
      }
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
    };
    window.addEventListener('keydown', handleKey);
    onCleanup(() => window.removeEventListener('keydown', handleKey));
  });

  // 滚动监听：定期保存阅读进度
  let scrollSaveTimer: number | null = null;
  let scrollContainer: HTMLDivElement | null = null;
  // 标记是否已经恢复过初始滚动位置（仅在首次打开书籍时恢复）
  let hasRestoredInitialScroll = false;
  // 标记是否正在恢复滚动位置，避免在恢复过程中触发滚动监听
  let isRestoringScroll = false;
  // 记录上次的章节索引，用于检测章节切换
  let lastChapterIndex = -1;

  const handleScroll = () => {
    if (!scrollContainer || isRestoringScroll) return;
    
    // 计算滚动位置（相对于内容顶部）
    const scrollTop = scrollContainer.scrollTop;
    const scrollHeight = scrollContainer.scrollHeight;
    const clientHeight = scrollContainer.clientHeight;
    
    // 计算阅读位置（0-1之间的比例）
    const pos = scrollHeight > clientHeight 
      ? Math.max(0, Math.min(1, scrollTop / (scrollHeight - clientHeight)))
      : 0;
    
    // 更新阅读位置
    readerStore.setChapterPos(pos);
    
    // 防抖保存：延迟500ms后保存
    if (scrollSaveTimer !== null) {
      clearTimeout(scrollSaveTimer);
    }
    scrollSaveTimer = window.setTimeout(() => {
      readerStore.saveProgress().catch(console.error);
      scrollSaveTimer = null;
    }, 500);
  };

  // 监听章节变化和内容加载完成
  createEffect(() => {
    const index = chapterIndex(); // 监听章节索引变化
    const contentShown = showContent(); // 监听内容显示状态
    
    if (!contentShown) return;
    
    // 检测章节切换：如果章节索引变化了，重置滚动位置到顶部
    if (lastChapterIndex !== -1 && lastChapterIndex !== index) {
      // 章节切换了，重置滚动位置到顶部
      requestAnimationFrame(() => {
        if (scrollContainer) {
          scrollContainer.scrollTop = 0;
          readerStore.setChapterPos(0);
        }
      });
      lastChapterIndex = index;
      return;
    }
    
    // 更新章节索引记录
    lastChapterIndex = index;
    
    // 只在首次打开书籍时恢复滚动位置
    if (hasRestoredInitialScroll) return;
    
    const pos = readerStore.state.chapterPos;
    
    // 延迟恢复滚动位置，确保内容已完全渲染
    // 使用双重 requestAnimationFrame 确保 DOM 完全渲染
    let retryCount = 0;
    const maxRetries = 10; // 最多重试 10 次（约 160ms）
    
    isRestoringScroll = true;
    
    const restoreScroll = () => {
      if (!scrollContainer) {
        // 如果 scrollContainer 还没绑定，再等待一下
        if (retryCount < maxRetries) {
          retryCount++;
          requestAnimationFrame(restoreScroll);
        } else {
          isRestoringScroll = false;
        }
        return;
      }
      
      const scrollHeight = scrollContainer.scrollHeight;
      const clientHeight = scrollContainer.clientHeight;
      
      // 如果内容还没渲染完（scrollHeight 为 0 或很小），再等待一下
      if (scrollHeight <= 0 && retryCount < maxRetries) {
        retryCount++;
        requestAnimationFrame(restoreScroll);
        return;
      }
      
      // 如果内容高度足够，恢复滚动位置
      if (scrollHeight > clientHeight && pos > 0) {
        // pos 是 0-1 之间的比例
        const targetScrollTop = pos * (scrollHeight - clientHeight);
        scrollContainer.scrollTop = Math.max(0, Math.min(targetScrollTop, scrollHeight - clientHeight));
      } else {
        // 如果内容高度不足或没有保存的位置，重置到顶部
        scrollContainer.scrollTop = 0;
      }
      
      // 标记已恢复初始滚动位置（仅恢复一次）
      hasRestoredInitialScroll = true;
      isRestoringScroll = false;
    };
    
    requestAnimationFrame(() => {
      requestAnimationFrame(restoreScroll);
    });
  });

  // 绑定滚动监听
  onMount(() => {
    // 等待DOM渲染完成后绑定
    requestAnimationFrame(() => {
      if (scrollContainer) {
        scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
      }
    });
  });

  onCleanup(() => {
    // 清理定时器和监听器
    if (scrollSaveTimer !== null) {
      clearTimeout(scrollSaveTimer);
    }
    if (scrollContainer) {
      scrollContainer.removeEventListener('scroll', handleScroll);
    }
  });

  const onContentPointerDown = (e: MouseEvent | TouchEvent) => {
    const x = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const y = 'touches' in e ? e.touches[0].clientY : e.clientY;
    if ('button' in e && e.button !== 0) return;
    tapStartTime = Date.now();
    tapStartX = x;
    tapStartY = y;
    tapMoved = false;
  };

  const onContentPointerMove = (e: MouseEvent | TouchEvent) => {
    const x = 'touches' in e ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
    const y = 'touches' in e ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;
    if (tapStartTime && (Math.abs(x - tapStartX) > TAP_MOVE_THRESHOLD || Math.abs(y - tapStartY) > TAP_MOVE_THRESHOLD)) {
      tapMoved = true;
    }
  };

  const onContentClick = (e: MouseEvent) => {
    const t = e.currentTarget as HTMLElement;
    const rect = t.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const w = rect.width;
    if (x < w * 0.2) handlePrev();
    else if (x > w * 0.8) handleNext();
    else {
      if (immersiveMode()) {
        tapStartTime = 0;
        return;
      }
      const wasLongPress = tapStartTime && Date.now() - tapStartTime >= LONG_PRESS_MS;
      if (!tapMoved && !wasLongPress) toggleTopBar();
    }
    tapStartTime = 0;
  };

  return (
    <div class="fixed inset-0 flex flex-col bg-background">
      {/* 正文区域：占满视口，顶/底栏浮于其上，显隐不引起正文上下移动 */}
      <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <Show
          when={isWideScreen() && (commentsOpen() || panelClosing())}
          fallback={
            <div
              ref={(el) => {
                if (el) scrollContainer = el;
              }}
              class="absolute inset-0 overflow-y-auto scroll-gutter-stable-both"
              onPointerDown={onContentPointerDown}
              onPointerMove={onContentPointerMove}
              onClick={onContentClick}
            >
              <ReaderContent
                class="min-h-full"
                onOpenComments={openComments}
                getSegmentCommentCount={getSegmentCommentCount}
                hideCommentBubbles={immersiveMode()}
                applyReadWidth={() => isWideScreen() || !isMobile()}
              />
            </div>
          }
        >
          <div class="flex min-h-0 flex-1">
            <div class="relative min-w-0 flex-1 overflow-hidden">
              <div
                ref={(el) => {
                  if (el) scrollContainer = el;
                }}
                class="absolute inset-0 overflow-y-auto scroll-gutter-stable-both"
                onPointerDown={onContentPointerDown}
                onPointerMove={onContentPointerMove}
                onClick={onContentClick}
              >
                <ReaderContent
                  class="min-h-full"
                  onOpenComments={openComments}
                  getSegmentCommentCount={getSegmentCommentCount}
                  hideCommentBubbles={immersiveMode()}
                  applyReadWidth={() => isWideScreen() || !isMobile()}
                />
              </div>
            </div>
            <div
              class={cn(
                'reader-comments-panel flex shrink-0 flex-col overflow-hidden border-l border-border/50 bg-background transition-[width] duration-300 ease-out',
                (panelEntering() || panelClosing()) ? 'w-0 border-l-0' : 'w-80'
              )}
              onTransitionEnd={handleCommentsPanelTransitionEnd}
            >
              <div class="flex h-full min-w-80 flex-col">
                <ReaderCommentsDrawer
                  segment={commentsSegment()}
                  onClose={handleCloseComments}
                  embedded
                />
              </div>
            </div>
          </div>
        </Show>
      </div>

      {/* 顶栏：绝对定位浮于正文之上，显隐不占流式布局 */}
      <header
        class={cn(
          'reader-top-bar absolute left-0 right-0 top-0 z-10 flex h-14 items-center gap-2 border-b border-border/50 bg-background/95 px-4 backdrop-blur',
          'safe-area-inset-top',
          (!topBarVisible() || immersiveMode()) && 'reader-bar-hidden'
        )}
        data-tauri-drag-region
      >
        <Tooltip>
          <TooltipTrigger as={Button}
            variant="ghost"
            size="icon"
            class="no-drag"
            onClick={props.onClose}
            aria-label="关闭阅读器"
          >
            <ChevronLeftIcon class="size-5" />
          </TooltipTrigger>
          <TooltipContent>关闭阅读器</TooltipContent>
        </Tooltip>
        <Show
          when={props.onOpenBookInfo}
          fallback={
            <h1 class="min-w-0 max-w-[40%] truncate text-sm font-medium text-foreground" data-tauri-drag-region>
              {book()?.name ?? '—'}
            </h1>
          }
        >
          <button
            type="button"
            class="min-w-0 max-w-[40%] truncate text-left text-sm font-medium text-foreground transition-colors cursor-pointer hover:text-primary no-drag"
            onClick={() => props.onOpenBookInfo!()}
            aria-label="进入书籍信息页"
            title="书籍信息"
          >
            {book()?.name ?? '—'}
          </button>
        </Show>
        <div class="min-w-0 flex-1" data-tauri-drag-region />
        {/* 宽屏时显示：换源/刷新/缓存/更多在沉浸左侧，整体右对齐 */}
        <Show when={isWideScreen()}>
          <Tooltip>
            <TooltipTrigger as={Button} variant="ghost" size="icon" class="no-drag" onClick={() => {}} aria-label="换源">
              <ReplaceIcon class="size-5" />
            </TooltipTrigger>
            <TooltipContent>换源（敬请期待）</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger as={Button}
              variant="ghost"
              size="icon"
              class="no-drag"
              onClick={async () => {
                try {
                  await readerStore.loadChapter(readerStore.state.chapterIndex);
                } catch {
                  // 失败时 loadChapter 已设置错误内容
                }
              }}
              aria-label="刷新当前章节"
            >
              <RefreshIcon class="size-5" />
            </TooltipTrigger>
            <TooltipContent>刷新</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger as={Button} variant="ghost" size="icon" class="no-drag" onClick={() => {}} aria-label="缓存">
              <DownloadIcon class="size-5" />
            </TooltipTrigger>
            <TooltipContent>缓存（敬请期待）</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger as={Button} variant="ghost" size="icon" class="no-drag" onClick={() => {}} aria-label="更多">
              <MoreIcon class="size-5" />
            </TooltipTrigger>
            <TooltipContent>更多（敬请期待）</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger as={Button}
              variant="ghost"
              size="icon"
              class={cn('no-drag', immersiveMode() && 'text-primary')}
              onClick={() => {
                const next = !immersiveMode();
                setImmersiveMode(next);
                if (next) {
                  if (commentsOpen()) {
                    setPanelClosing(true);
                    setCommentsOpen(false);
                  }
                  if (shouldShowImmersiveEnterToast()) {
                    showImmersiveEnterToast();
                  }
                }
              }}
              aria-label={immersiveMode() ? '退出沉浸阅读' : '进入沉浸阅读'}
            >
              <ImmersiveIcon class="size-5" />
            </TooltipTrigger>
            <TooltipContent>{immersiveMode() ? '退出沉浸阅读' : '沉浸'}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger as={Button}
              variant="ghost"
              size="icon"
              class="no-drag"
              onClick={(e) => {
                e.stopPropagation();
                setCatalogOpen(true);
              }}
              aria-label="目录"
            >
              <ListIcon class="size-5" />
            </TooltipTrigger>
            <TooltipContent>目录</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger as={Button}
              variant="ghost"
              size="icon"
              class="no-drag"
              onClick={() => {}}
              aria-label="朗读"
            >
              <VolumeIcon class="size-5" size={20} />
            </TooltipTrigger>
            <TooltipContent>朗读（敬请期待）</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger as={Button}
              variant="ghost"
              size="icon"
              class="no-drag"
              onClick={() => setSettingsOpen(true)}
              aria-label="界面（字号、间距、配色）"
            >
              <span class="text-base font-normal leading-none" aria-hidden="true">Aa</span>
            </TooltipTrigger>
            <TooltipContent>界面</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger as={Button}
              variant="ghost"
              size="icon"
              class="no-drag"
              onClick={() => setReaderMenuDrawerOpen(true)}
              aria-label="设置"
            >
              <SettingsIcon class="size-5" />
            </TooltipTrigger>
            <TooltipContent>设置</TooltipContent>
          </Tooltip>
        </Show>
        {/* 窗口控制左侧分割线：仅桌面端（Tauri 且非移动端）显示 */}
        <Show when={isTauri() && !isMobile()}>
          <Separator orientation="vertical" class="mx-2 h-6 no-drag" />
        </Show>
        <div class="flex items-center gap-2 no-drag">
          <Tooltip>
            <TooltipTrigger as="div">
              <Toggle
                pressed={isDark()}
                onChange={toggleTheme}
                variant="default"
                size="default"
                class="h-9 w-9 rounded-md hover:bg-muted transition-colors p-0"
              >
            <Show
              when={isDark()}
              fallback={<ThemeLightIcon class="h-4 w-4" size={16} />}
            >
              <ThemeDarkIcon class="h-4 w-4" size={16} />
            </Show>
            <span class="sr-only">{isDark() ? '切换到浅色模式' : '切换到深色模式'}</span>
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>{isDark() ? '切换到浅色模式' : '切换到深色模式'}</TooltipContent>
          </Tooltip>
          <WindowControlButtons />
        </div>
      </header>

      {/* 底栏：状态栏与操作栏分别控制显隐；整栏在两者都隐藏时收起 */}
      <div
        class={cn(
          'reader-footer absolute bottom-0 left-0 right-0 z-10 flex flex-col',
          !statusBarVisible() && !operationBarVisible() && 'reader-bar-hidden'
        )}
      >
        {/* 阅读进度状态栏：仅此项受「阅读进度状态栏的显示风格」控制 */}
        <div
          class={cn(
            'reader-bottom-bar flex h-9 shrink-0 items-center justify-between gap-3 px-4 text-xs',
            isWideScreen() && 'safe-area-inset-bottom',
            bottomBarThemeClasses() ?? 'border-t border-border/50 bg-background/95 text-muted-foreground backdrop-blur',
            !statusBarVisible() && 'reader-bar-hidden'
          )}
        >
          <span class="min-w-0 flex-1 truncate text-left" title={currentChapter()?.title}>
            {currentChapter()?.title ?? '—'}
          </span>
          <div class="flex shrink-0 items-center gap-3">
            <span>{chapterWordCountText() === '—' ? '—' : `${chapterWordCountText()}字`}</span>
            <span>本章 {chapterProgressPercent()}%</span>
            <span>全书 {bookProgressPercent()}%</span>
          </div>
        </div>
        {/* 底部操作栏：仅窄屏存在 DOM，显隐随顶栏/沉浸并用过渡收起 */}
        <Show when={!isWideScreen()}>
          <div
            class={cn(
              'reader-control-bar flex shrink-0 flex-col border-t border-border/50 bg-background/95 px-3 py-2 text-muted-foreground backdrop-blur safe-area-inset-bottom',
              !operationBarVisible() && 'reader-bar-hidden'
            )}
          >
          <div class="flex items-center gap-2">
            <Button variant="ghost" size="sm" class="shrink-0 text-xs no-drag" onClick={handlePrev} aria-label="上一章">
              上一章
            </Button>
            <div class="min-w-0 flex-1 px-1">
              <Slider
                value={[chapterPos()]}
                minValue={0}
                maxValue={1}
                step={0.01}
                onChange={handleChapterProgressChange}
                class="py-2"
              >
                <SliderTrack>
                  <SliderFill />
                  <SliderThumb />
                </SliderTrack>
              </Slider>
            </div>
            <Button variant="ghost" size="sm" class="shrink-0 text-xs no-drag" onClick={handleNext} aria-label="下一章">
              下一章
            </Button>
          </div>
          <div class="flex items-center justify-around pt-1">
            <Button
              variant="ghost"
              size="sm"
              class="flex flex-col items-center gap-0.5 rounded-md px-3 py-1.5 text-xs no-drag"
              onClick={() => setCatalogOpen(true)}
              aria-label="目录"
            >
              <ListIcon class="h-4 w-4" />
              <span>目录</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class="flex flex-col items-center gap-0.5 rounded-md px-3 py-1.5 text-xs no-drag"
              onClick={() => {}}
              aria-label="朗读"
              title="敬请期待"
            >
              <VolumeIcon class="h-4 w-4" size={16} />
              <span>朗读</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class="flex flex-col items-center gap-0.5 rounded-md px-3 py-1.5 text-xs no-drag"
              onClick={() => setSettingsOpen(true)}
              aria-label="界面（字号、间距、配色）"
            >
              <span class="text-sm font-normal leading-none" aria-hidden="true">Aa</span>
              <span>界面</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class="flex flex-col items-center gap-0.5 rounded-md px-3 py-1.5 text-xs no-drag"
              onClick={() => setReaderMenuDrawerOpen(true)}
              aria-label="设置"
            >
              <SettingsIcon class="h-4 w-4" />
              <span>设置</span>
            </Button>
          </div>
        </div>
        </Show>
      </div>

      {/* 窄屏段评 Drawer */}
      <Show when={!isWideScreen()}>
        <ReaderCommentsDrawer
          segment={commentsSegment()}
          open={commentsOpen()}
          onOpenChange={setCommentsOpen}
          onClose={() => setCommentsOpen(false)}
        />
      </Show>

      {/* 目录 Drawer：左侧滑出，向左拖动整块收起（与底部 Drawer 一致） */}
      <Show when={book()}>
        <Drawer
          open={catalogOpen()}
          onOpenChange={setCatalogOpen}
          side="left"
          snapPoints={[0, 1]}
          defaultSnapPoint={1}
        >
          <DrawerContent class="z-100 flex h-full w-full max-w-sm flex-col" overlayClass="z-100">
            <DrawerHeader class="flex flex-row items-center justify-between gap-2 pb-2">
              <DrawerTitle>目录</DrawerTitle>
              <DrawerClose
                as="button"
                class="h-8 w-8 shrink-0 rounded-md p-0 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="关闭"
              >
                <XIcon class="h-4 w-4" size={16} />
              </DrawerClose>
            </DrawerHeader>
            <div class="flex min-h-0 flex-1 flex-col overflow-hidden" data-corvu-no-drag>
              <ReaderCatalog
                open={catalogOpen()}
                initialScrollTop={catalogScrollTop()}
                onScrollTop={setCatalogScrollTop}
                onSelectChapter={(index: number) => {
                  readerStore.jumpToChapter(index);
                  setCatalogOpen(false);
                }}
                onClose={() => setCatalogOpen(false)}
              />
            </div>
          </DrawerContent>
        </Drawer>
      </Show>

      {/* 阅读设置 Drawer（仅关闭/全开两档，保证可滚动区高度固定、滚动正常） */}
      <Drawer open={settingsOpen()} onOpenChange={setSettingsOpen} snapPoints={[0, 1]} defaultSnapPoint={1}>
        <DrawerContent class="z-100 h-[75dvh] max-h-[75dvh] flex flex-col" overlayClass="z-100">
          <DrawerHeader class="flex flex-row items-center justify-between gap-2 pb-2">
            <DrawerTitle>阅读设置</DrawerTitle>
            <DrawerClose as="button" class="h-8 w-8 shrink-0 rounded-md p-0 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="关闭">
              <XIcon class="h-4 w-4" size={16} />
            </DrawerClose>
          </DrawerHeader>
          <div
            class="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-6 pt-1"
            data-corvu-no-drag
          >
            <ReaderSettings onClose={() => setSettingsOpen(false)} showReadWidth={() => isWideScreen() || !isMobile()} />
          </div>
        </DrawerContent>
      </Drawer>

      {/* 设置抽屉：仅关闭/全开两档，保证可滚动区高度固定、滚动正常。从本抽屉内打开「阅读进度状态栏」对话框时禁止因焦点/点击移出而关闭，避免抽屉被误关、对话框随之关闭并触发设置按钮 tooltip */}
      <Drawer
        open={readerMenuDrawerOpen()}
        onOpenChange={setReaderMenuDrawerOpen}
        snapPoints={[0, 1]}
        defaultSnapPoint={1}
        closeOnOutsideFocus={!statusBarStyleDialogOpen()}
        closeOnOutsidePointer={!statusBarStyleDialogOpen()}
      >
        <DrawerContent class="z-100 h-[75dvh] max-h-[75dvh] flex flex-col" overlayClass="z-100">
          <DrawerHeader class="flex flex-row items-center justify-between gap-2 pb-2">
            <DrawerTitle>设置</DrawerTitle>
            <DrawerClose as="button" class="h-8 w-8 shrink-0 rounded-md p-0 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="关闭">
              <XIcon class="h-4 w-4" size={16} />
            </DrawerClose>
          </DrawerHeader>
          <div
            class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto scroll-gutter-stable-both px-2 pb-6"
            data-corvu-no-drag
          >
            {/* 阅读进度状态栏的显示风格 */}
            <div class="flex items-center justify-between gap-3 py-2">
              <span class="text-sm text-foreground">阅读进度状态栏的显示风格</span>
              <button
                type="button"
                class="rounded-lg bg-muted px-3 py-1.5 text-sm text-foreground hover:bg-muted/80"
                onClick={() => setStatusBarStyleDialogOpen(true)}
              >
                {readerStore.state.config.statusBarDisplayStyle === 'follow'
                  ? '跟随操作栏'
                  : readerStore.state.config.statusBarDisplayStyle === 'always'
                    ? '始终显示'
                    : '始终隐藏'}
              </button>
            </div>
            <DrawerClose as="button" class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-muted">
              关闭
            </DrawerClose>
          </div>
        </DrawerContent>
      </Drawer>

      {/* 阅读进度状态栏显示风格选项弹窗：盖过设置抽屉(z-100)；窄屏下限制宽度并留边距；非模态避免关闭后影响阅读器操作 */}
      <AppDialog open={statusBarStyleDialogOpen()} onOpenChange={setStatusBarStyleDialogOpen} modal={false}>
        <AppDialogContent
          class={cn('w-[calc(100dvw-2rem)] max-w-[20rem]')}
          portalZClass="z-[110]"
          overlayClass="bg-black/80"
        >
          <AppDialogHeader>
            <AppDialogTitle>阅读进度状态栏的显示风格</AppDialogTitle>
          </AppDialogHeader>
          <div class="min-h-0 overflow-y-auto overscroll-contain px-6 py-4 contain-layout">
          <RadioGroup
            value={readerStore.state.config.statusBarDisplayStyle}
            onChange={(value) => {
              readerStore.setConfig({ statusBarDisplayStyle: value as 'follow' | 'always' | 'never' });
              setStatusBarStyleDialogOpen(false);
            }}
            class="flex flex-col gap-2"
          >
            <div
              class={statusBarOptionRowClass}
              role="button"
              tabIndex={0}
              onClick={(e) => triggerStatusBarOptionRadio(e.currentTarget)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  triggerStatusBarOptionRadio(e.currentTarget)
                }
              }}
            >
              <RadioGroupItem value="follow" class="w-full">
                <RadioGroupItemLabel>跟随操作栏</RadioGroupItemLabel>
              </RadioGroupItem>
            </div>
            <div
              class={statusBarOptionRowClass}
              role="button"
              tabIndex={0}
              onClick={(e) => triggerStatusBarOptionRadio(e.currentTarget)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  triggerStatusBarOptionRadio(e.currentTarget)
                }
              }}
            >
              <RadioGroupItem value="always" class="w-full">
                <RadioGroupItemLabel>始终显示</RadioGroupItemLabel>
              </RadioGroupItem>
            </div>
            <div
              class={statusBarOptionRowClass}
              role="button"
              tabIndex={0}
              onClick={(e) => triggerStatusBarOptionRadio(e.currentTarget)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  triggerStatusBarOptionRadio(e.currentTarget)
                }
              }}
            >
              <RadioGroupItem value="never" class="w-full">
                <RadioGroupItemLabel>始终隐藏</RadioGroupItemLabel>
              </RadioGroupItem>
            </div>
          </RadioGroup>
          </div>
        </AppDialogContent>
      </AppDialog>
    </div>
  );
}
