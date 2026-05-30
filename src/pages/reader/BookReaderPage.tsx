/**
 * 文本阅读器（BookReader）
 * 参考 legado ReadBookActivity：全屏阅读、顶部栏、正文区、目录与设置
 */

import { createSignal, Show, Index, onMount, onCleanup, createEffect } from 'solid-js';
import { readerStore } from '@/stores/reader';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AppDrawer,
  AppDrawerBody,
  AppDrawerClose,
  AppDrawerContent,
  AppDrawerHeader,
} from '@/components/shared/AppDrawer';
import { hDrawerPanel } from '@/lib/ui/viewport-classes';
import {
  AppDialog,
  AppDialogContent,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { RadioGroup, RadioGroupItem, RadioGroupItemLabel } from '@/components/ui/radio-group';
import { ReaderContent } from '@/pages/reader/ReaderContent';
import { ReaderSettings } from '@/pages/reader/ReaderSettings';
import { ReaderCatalog } from '@/pages/reader/ReaderCatalog';
import { ReaderCommentsDrawer } from '@/pages/reader/ReaderCommentsDrawer';
import { ReaderOfflineCacheDialog } from '@/components/reader/ReaderOfflineCacheDialog';
import { ReaderMoreMenu } from '@/components/reader/ReaderMoreMenu';
import { ReaderSearchDrawer } from '@/components/reader/ReaderSearchDrawer';
import { ReaderBookmarksDrawer } from '@/components/reader/ReaderBookmarksDrawer';
import { ReaderChangeSourceDialog } from '@/components/reader/ReaderChangeSourceDialog';
import { ReaderClickRegionalOverlay } from '@/components/reader/ReaderClickRegionalOverlay';
import { shouldShowClickActionHint } from '@/lib/reader/reader-click-hint-storage';
import { resolveClickZone } from '@/lib/reader/reader-click-region';
import { getHttpTTS } from '@/lib/database/http-tts';
import {
  startReadAloud,
  stopReadAloud,
  toggleReadAloudPause,
  getReadAloudState,
  isReadAloudSupported,
} from '@/lib/reader/read-aloud';
import { type ReaderClickActionId } from '@/lib/reader/reader-click-actions';
import {
  addReaderBookmark,
  selectionTextFromDocument,
  plainChapterExcerpt,
} from '@/lib/reader/reader-bookmark';
import type { Bookmark } from '@/types';
import { cn } from '@/lib/utils';
import { isMobile, isTauri } from '@/lib/platform/detect';
import { isLocalBook } from '@/lib/local-book';
import {
  ChevronLeftIcon,
  ListIcon,
  SettingsIcon,
  RefreshIcon,
  MoreIcon,
  ReplaceIcon,
  DownloadIcon,
  VolumeOnIcon,
  VolumeOffIcon,
  ThemeLightIcon,
  ThemeDarkIcon,
} from '@/components/shared/icons';
import { Slider, SliderTrack, SliderFill, SliderThumb } from '@/components/ui/slider';
import { showAppToast } from '@/components/shared/AppToasts';
import { WindowControlButtons } from '@/components/shell/WindowControlButtons';
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

export interface BookReaderProps {
  onClose: () => void;
  /** 点击顶栏书名时进入书籍信息页（不传则书名不可点） */
  onOpenBookInfo?: () => void;
}

/** @deprecated 使用 BookReader */
export type ReaderPageProps = BookReaderProps;

export function BookReader(props: BookReaderProps) {
  const [topBarVisible, setTopBarVisible] = createSignal(true);
  const [catalogOpen, setCatalogOpen] = createSignal(false);
  /** 目录列表滚动位置缓存（关闭时保存，再次打开时恢复），换书时清零 */
  const [catalogScrollTop, setCatalogScrollTop] = createSignal(0);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  /** 设置抽屉（另外的菜单）：仅窄屏底栏的「设置」打开 */
  const [readerMenuDrawerOpen, setReaderMenuDrawerOpen] = createSignal(false);
  const [statusBarStyleDialogOpen, setStatusBarStyleDialogOpen] = createSignal(false);
  const [offlineCacheDialogOpen, setOfflineCacheDialogOpen] = createSignal(false);
  const [moreMenuOpen, setMoreMenuOpen] = createSignal(false);
  const [searchOpen, setSearchOpen] = createSignal(false);
  const [bookmarksOpen, setBookmarksOpen] = createSignal(false);
  const [contentEnterKey, setContentEnterKey] = createSignal(0);
  const [changeSourceOpen, setChangeSourceOpen] = createSignal(false);
  const [clickRegionalOpen, setClickRegionalOpen] = createSignal(false);
  const [clickRegionalMarkHint, setClickRegionalMarkHint] = createSignal(false);
  const [readAloudActive, setReadAloudActive] = createSignal(false);
  const [clickActionPickerOpen, setClickActionPickerOpen] = createSignal(false);
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
  const catalogSize = () => readerStore.state.catalog.length;
  const canOfflineCache = () => {
    const b = book();
    if (!b || readerStore.isGuestReading()) return false;
    return !isLocalBook(b);
  };

  const openOfflineCacheDialog = () => {
    if (!canOfflineCache()) {
      showAppToast({
        title: '无法离线缓存',
        description: readerStore.isGuestReading()
          ? '试读书籍请先加入书架'
          : '本地书籍无需缓存',
        variant: 'default',
      });
      return;
    }
    setOfflineCacheDialogOpen(true);
  };
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
    return topBarVisible();
  };
  /** 底栏操作栏是否显示（窄屏且顶栏可见） */
  const operationBarVisible = () => !isWideScreen() && topBarVisible();
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

  const handlePrev = () => void readerStore.prevChapter();
  const handleNext = () => void readerStore.nextChapter();

  const canUseBookmarks = () => {
    const b = book();
    return !!b && !readerStore.isGuestReading();
  };

  const handleAddBookmark = async () => {
    const b = book();
    const ch = currentChapter();
    if (!b || !ch) return;
    try {
      const selected = selectionTextFromDocument();
      await addReaderBookmark({
        book: b,
        chapterIndex: chapterIndex(),
        chapterPos: chapterPos(),
        chapterTitle: ch.title,
        selectedText: selected || plainChapterExcerpt(content()),
      });
      showAppToast({ title: '已添加书签' });
    } catch (e) {
      showAppToast({
        title: '添加书签失败',
        description: e instanceof Error ? e.message : '未知错误',
        variant: 'destructive',
      });
    }
  };

  const handleJumpBookmark = async (bm: Bookmark) => {
    await readerStore.jumpToChapter(bm.chapterIndex);
    readerStore.setChapterPos(bm.chapterPos);
    requestAnimationFrame(() => {
      if (scrollContainer) {
        const sh = scrollContainer.scrollHeight;
        const ch = scrollContainer.clientHeight;
        scrollContainer.scrollTop =
          sh > ch ? bm.chapterPos * (sh - ch) : 0;
      }
    });
  };

  const syncReadAloudActive = () => {
    const st = getReadAloudState();
    setReadAloudActive(st === 'playing' || st === 'paused');
  };

  const handleReadAloud = async () => {
    const st = getReadAloudState();
    if (st === 'playing' || st === 'paused') {
      toggleReadAloudPause();
      syncReadAloudActive();
      showAppToast({
        title: st === 'playing' ? '已暂停朗读' : '继续朗读',
      });
      return;
    }
    const cfg = readerStore.state.config;
    const httpTts =
      cfg.aloudEngine === 'httpTts' && cfg.httpTtsId != null
        ? await getHttpTTS(cfg.httpTtsId)
        : null;
    if (cfg.aloudEngine === 'httpTts' && !httpTts) {
      showAppToast({
        title: '未配置 HttpTTS',
        description: '请在设置 → 朗读引擎中选择在线朗读源',
        variant: 'destructive',
      });
      return;
    }
    if (cfg.aloudEngine !== 'httpTts' && !isReadAloudSupported()) {
      showAppToast({
        title: '不支持朗读',
        description: '当前环境无法使用语音合成',
      });
      return;
    }
    const ok = await startReadAloud(content(), {
      engine: cfg.aloudEngine,
      httpTts,
      speakSpeed: cfg.speakSpeed,
      onEnd: () => {
        setReadAloudActive(false);
        showAppToast({ title: '朗读结束' });
      },
      onError: (msg) => {
        setReadAloudActive(false);
        showAppToast({ title: '朗读失败', description: msg, variant: 'destructive' });
      },
    });
    if (ok) {
      setReadAloudActive(true);
      showAppToast({ title: '开始朗读' });
    }
  };

  const dualPageActive = () => {
    const mode = readerStore.state.config.dualPage ?? 'auto';
    if (mode === 'off') return false;
    if (mode === 'always') return isWideScreen();
    return isWideScreen() && window.innerWidth >= 900;
  };

  const runClickAction = (action: ReaderClickActionId) => {
    switch (action) {
      case 'menu':
        toggleTopBar();
        break;
      case 'nextPage':
        handleNext();
        break;
      case 'prevPage':
        handlePrev();
        break;
      case 'nextChapter':
        void handleNext();
        break;
      case 'prevChapter':
        void handlePrev();
        break;
      default:
        break;
    }
  };

  const pageAnim = () => readerStore.state.config.pageAnim ?? 'scroll';
  const contentTransitionClass = () => {
    const anim = pageAnim();
    if (anim === 'cover') return 'reader-chapter-enter-cover';
    if (anim === 'slide') return 'reader-chapter-enter-slide';
    if (anim === 'none') return '';
    return '';
  };

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

  const dismissClickRegional = () => {
    setClickRegionalOpen(false);
    setClickRegionalMarkHint(false);
  };

  const openClickRegionalConfig = (fromFirstHint = false) => {
    setClickRegionalMarkHint(fromFirstHint);
    setClickRegionalOpen(true);
  };

  onMount(() => {
    void shouldShowClickActionHint().then((show) => {
      if (show) openClickRegionalConfig(true);
    });
  });

  onMount(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (clickRegionalOpen()) {
          if (clickActionPickerOpen()) return;
          dismissClickRegional();
          return;
        }
        setCatalogOpen(false);
        setSettingsOpen(false);
        if (commentsOpen()) setPanelClosing(true);
        else if (!catalogOpen() && !settingsOpen()) setTopBarVisible((v) => !v);
      }
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
      if (readerStore.state.config.volumeKeyTurnPage) {
        if (e.key === 'ArrowUp' || e.code === 'AudioVolumeUp') {
          e.preventDefault();
          handlePrev();
        }
        if (e.key === 'ArrowDown' || e.code === 'AudioVolumeDown') {
          e.preventDefault();
          handleNext();
        }
      }
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
      const anim = readerStore.state.config.pageAnim ?? 'scroll';
      if (anim !== 'scroll') {
        setContentEnterKey((k) => k + 1);
      }
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
    stopReadAloud();
    setReadAloudActive(false);
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
    const xRatio = (e.clientX - rect.left) / Math.max(rect.width, 1);
    const yRatio = (e.clientY - rect.top) / Math.max(rect.height, 1);
    const zone = resolveClickZone(xRatio, yRatio, readerStore.state.config.clickRegion);
    const actions = readerStore.state.config.clickActions;
    const action = actions[zone] ?? 'menu';
    const wasLongPress = tapStartTime && Date.now() - tapStartTime >= LONG_PRESS_MS;
    if (tapMoved || wasLongPress) {
      tapStartTime = 0;
      return;
    }
    runClickAction(action);
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
              class="reader-text-scroll absolute inset-0 overflow-y-auto"
              onPointerDown={onContentPointerDown}
              onPointerMove={onContentPointerMove}
              onClick={onContentClick}
            >
              <Index each={[contentEnterKey()]}>
                {() => (
                  <ReaderContent
                    class={cn('min-h-full', contentTransitionClass())}
                    onOpenComments={openComments}
                    getSegmentCommentCount={getSegmentCommentCount}
                    applyReadWidth={() => false}
                    dualPage={dualPageActive()}
                  />
                )}
              </Index>
            </div>
          }
        >
          <div class="flex min-h-0 flex-1">
            <div class="relative min-w-0 flex-1 overflow-hidden">
              <div
                ref={(el) => {
                  if (el) scrollContainer = el;
                }}
                class="reader-text-scroll absolute inset-0 overflow-y-auto"
                onPointerDown={onContentPointerDown}
                onPointerMove={onContentPointerMove}
                onClick={onContentClick}
              >
                <Index each={[contentEnterKey()]}>
                  {() => (
                    <ReaderContent
                      class={cn('min-h-full', contentTransitionClass())}
                      onOpenComments={openComments}
                      getSegmentCommentCount={getSegmentCommentCount}
                      applyReadWidth={() => false}
                      dualPage={dualPageActive()}
                    />
                  )}
                </Index>
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
          !topBarVisible() && 'reader-bar-hidden'
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
          <Tooltip>
            <TooltipTrigger
              as="button"
              type="button"
              class="min-w-0 max-w-[40%] truncate text-left text-sm font-medium text-foreground transition-colors cursor-pointer hover:text-primary no-drag"
              onClick={() => props.onOpenBookInfo!()}
              aria-label="进入书籍信息页"
            >
              {book()?.name ?? '—'}
            </TooltipTrigger>
            <TooltipContent>书籍信息</TooltipContent>
          </Tooltip>
        </Show>
        <div class="min-w-0 flex-1" data-tauri-drag-region />
        <Show when={isWideScreen()}>
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
              onClick={handleReadAloud}
              aria-label="朗读"
            >
              {readAloudActive() ? (
                <VolumeOffIcon class="size-5" size={20} />
              ) : (
                <VolumeOnIcon class="size-5" size={20} />
              )}
            </TooltipTrigger>
            <TooltipContent>朗读</TooltipContent>
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
        <div class="flex shrink-0 items-center gap-0.5 no-drag">
          <Tooltip>
            <TooltipTrigger
              as={Button}
              variant="ghost"
              size="icon"
              class="no-drag"
              onClick={() => {
                const b = book();
                if (!b || readerStore.isGuestReading() || isLocalBook(b)) {
                  showAppToast({
                    title: '无法换源',
                    description: readerStore.isGuestReading()
                      ? '试读请先加入书架'
                      : '本地书不支持换源',
                  });
                  return;
                }
                setChangeSourceOpen(true);
              }}
              aria-label="换源"
            >
              <ReplaceIcon class="size-5" />
            </TooltipTrigger>
            <TooltipContent>换源</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              as={Button}
              variant="ghost"
              size="icon"
              class="no-drag"
              onClick={async () => {
                try {
                  await readerStore.refreshChapter();
                } catch {
                  // 失败时 refreshChapter → loadChapter 已设置错误内容
                }
              }}
              aria-label="刷新当前章节"
            >
              <RefreshIcon class="size-5" />
            </TooltipTrigger>
            <TooltipContent>刷新</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              as={Button}
              variant="ghost"
              size="icon"
              class="no-drag"
              onClick={openOfflineCacheDialog}
              aria-label="离线缓存"
            >
              <DownloadIcon class="size-5" />
            </TooltipTrigger>
            <TooltipContent>离线缓存</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              as={Button}
              variant="ghost"
              size="icon"
              class="no-drag"
              onClick={() => setMoreMenuOpen(true)}
              aria-label="更多"
            >
              <MoreIcon class="size-5" />
            </TooltipTrigger>
            <TooltipContent>更多</TooltipContent>
          </Tooltip>
        </div>
        {/* 主题切换左侧分割线：仅桌面端（Tauri 且非移动端）显示 */}
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
          <Tooltip>
            <TooltipTrigger as="span" class="min-w-0 flex-1 truncate text-left">
              {currentChapter()?.title ?? '—'}
            </TooltipTrigger>
            <TooltipContent>{currentChapter()?.title ?? '—'}</TooltipContent>
          </Tooltip>
          <div class="flex shrink-0 items-center gap-3">
            <span>{chapterWordCountText() === '—' ? '—' : `${chapterWordCountText()}字`}</span>
            <span>本章 {chapterProgressPercent()}%</span>
            <span>全书 {bookProgressPercent()}%</span>
          </div>
        </div>
        {/* 底部操作栏：仅窄屏存在 DOM，显隐随顶栏过渡收起 */}
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
              <Tooltip>
                <TooltipTrigger
                  as={Button}
                  variant="ghost"
                  size="sm"
                  class="flex flex-col items-center gap-0.5 rounded-md px-3 py-1.5 text-xs no-drag"
                  onClick={handleReadAloud}
                  aria-label="朗读"
                >
                  {readAloudActive() ? (
                    <VolumeOffIcon class="h-4 w-4" size={16} />
                  ) : (
                    <VolumeOnIcon class="h-4 w-4" size={16} />
                  )}
                  <span>朗读</span>
                </TooltipTrigger>
                <TooltipContent>朗读</TooltipContent>
              </Tooltip>
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
        <AppDrawer
          open={catalogOpen()}
          onOpenChange={setCatalogOpen}
          side="left"
          snapPoints={[0, 1]}
          defaultSnapPoint={1}
        >
          <AppDrawerContent
            class="z-100 flex h-full w-full max-w-sm flex-col"
            overlayClass="z-100"
            showNativeDragHandle={false}
          >
            <AppDrawerHeader title="目录" />
            <AppDrawerBody>
              <Show when={catalogOpen()}>
                <ReaderCatalog
                  open
                  initialScrollTop={catalogScrollTop()}
                  onScrollTop={setCatalogScrollTop}
                  onSelectChapter={(index: number) => {
                    readerStore.jumpToChapter(index);
                    setCatalogOpen(false);
                  }}
                  onClose={() => setCatalogOpen(false)}
                />
              </Show>
            </AppDrawerBody>
          </AppDrawerContent>
        </AppDrawer>
      </Show>

      {/* 阅读设置 Drawer（仅关闭/全开两档，保证可滚动区高度固定、滚动正常） */}
      <AppDrawer open={settingsOpen()} onOpenChange={setSettingsOpen} snapPoints={[0, 1]} defaultSnapPoint={1}>
        <AppDrawerContent
          class={cn('z-100 flex flex-col', hDrawerPanel, `max-h-[75dvh]`)}
          overlayClass="z-100"
          showNativeDragHandle={false}
        >
          <AppDrawerHeader title="阅读设置" />
          <AppDrawerBody class="px-4 pb-6 pt-1 overflow-y-auto scroll-gutter-stable-both">
            <ReaderSettings
              onClose={() => setSettingsOpen(false)}
              showReadWidth={() => isWideScreen() || !isMobile()}
              onOpenClickRegionalConfig={() => openClickRegionalConfig(false)}
            />
          </AppDrawerBody>
        </AppDrawerContent>
      </AppDrawer>

      {/* 设置抽屉：仅关闭/全开两档，保证可滚动区高度固定、滚动正常。从本抽屉内打开「阅读进度状态栏」对话框时禁止因焦点/点击移出而关闭，避免抽屉被误关、对话框随之关闭并触发设置按钮 tooltip */}
      <AppDrawer
        open={readerMenuDrawerOpen()}
        onOpenChange={setReaderMenuDrawerOpen}
        snapPoints={[0, 1]}
        defaultSnapPoint={1}
        closeOnOutsideFocus={!statusBarStyleDialogOpen()}
        closeOnOutsidePointer={!statusBarStyleDialogOpen()}
      >
        <AppDrawerContent
          class={cn('z-100 flex flex-col', hDrawerPanel, `max-h-[75dvh]`)}
          overlayClass="z-100"
          showNativeDragHandle={false}
        >
          <AppDrawerHeader title="设置" />
          {/* 阻止内部拖拽使用 data-corvu-no-drag 或 disableDragClose */}
          <AppDrawerBody class="gap-1 overflow-y-auto scroll-gutter-stable-both px-2 pb-6">
            <Button
              variant="ghost"
              class="w-full justify-start"
              onClick={() => {
                setReaderMenuDrawerOpen(false);
                setSearchOpen(true);
              }}
            >
              全书搜索
            </Button>
            <Show when={canUseBookmarks()}>
              <Button
                variant="ghost"
                class="w-full justify-start"
                onClick={() => {
                  setReaderMenuDrawerOpen(false);
                  void handleAddBookmark();
                }}
              >
                添加书签
              </Button>
              <Button
                variant="ghost"
                class="w-full justify-start"
                onClick={() => {
                  setReaderMenuDrawerOpen(false);
                  setBookmarksOpen(true);
                }}
              >
                本书书签
              </Button>
            </Show>
            <Button
              variant="ghost"
              class="w-full justify-start"
              onClick={() => {
                setReaderMenuDrawerOpen(false);
                setMoreMenuOpen(true);
              }}
            >
              更多选项
            </Button>
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
            <AppDrawerClose as="button" class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-muted">
              关闭
            </AppDrawerClose>
          </AppDrawerBody>
        </AppDrawerContent>
      </AppDrawer>

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

      <ReaderOfflineCacheDialog
        open={offlineCacheDialogOpen()}
        onOpenChange={setOfflineCacheDialogOpen}
        book={book() ?? null}
        chapterIndex={readerStore.state.chapterIndex}
        catalogSize={catalogSize()}
      />

      <ReaderMoreMenu
        open={moreMenuOpen()}
        onOpenChange={setMoreMenuOpen}
        canBookmark={canUseBookmarks()}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenBookmarks={() => setBookmarksOpen(true)}
        onAddBookmark={() => void handleAddBookmark()}
      />

      <ReaderSearchDrawer
        open={searchOpen()}
        onOpenChange={setSearchOpen}
        onJumpToChapter={(index) => void readerStore.jumpToChapter(index)}
      />

      <ReaderBookmarksDrawer
        open={bookmarksOpen()}
        onOpenChange={setBookmarksOpen}
        book={book() ?? null}
        onJump={(bm) => void handleJumpBookmark(bm)}
      />

      <ReaderChangeSourceDialog
        open={changeSourceOpen()}
        onOpenChange={setChangeSourceOpen}
        book={book() ?? null}
        onChanged={async (nextBook) => {
          await readerStore.openBook(nextBook);
        }}
      />

      <ReaderClickRegionalOverlay
        open={clickRegionalOpen()}
        markHintSeenOnClose={clickRegionalMarkHint()}
        onClose={dismissClickRegional}
        onPickerOpenChange={setClickActionPickerOpen}
      />

      <style>{`
        @keyframes reader-cover-in {
          from { opacity: 0.35; }
          to { opacity: 1; }
        }
        @keyframes reader-slide-in {
          from { opacity: 0.6; transform: translateX(12px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .reader-chapter-enter-cover {
          animation: reader-cover-in 0.28s ease-out;
        }
        .reader-chapter-enter-slide {
          animation: reader-slide-in 0.32s ease-out;
        }
      `}</style>
    </div>
  );
}

/** @deprecated 使用 BookReader */
export const ReaderPage = BookReader;
