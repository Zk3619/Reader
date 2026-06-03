/**
 * 文本阅读器（BookReader）
 * 参考 legado ReadBookActivity：全屏阅读、顶部栏、正文区、目录与设置
 */

import { createSignal, Show, Index, onMount, onCleanup, createEffect, type Accessor } from 'solid-js';
import { useMediaViewerShell } from '@/components/viewer/media-viewer-shell-context';
import { textViewerStore } from '@/stores/viewer';
import { textViewerDualPageActive } from '@/lib/media/text/reader-ui-config';
import { readerThemeClasses } from '@/lib/media/text/reader-theme-classes';
import { Button } from '@/components/ui/button';
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
import { ReaderContent } from '@/components/viewer/text-viewer/ReaderContent';
import { ReaderPagedViewport } from '@/components/viewer/text-viewer/ReaderPagedViewport';
import type { ReaderPagedNavApi } from '@/components/viewer/text-viewer/reader-paged-nav';
import {
  isTextViewerPagedAnim,
  normalizeTextViewerPageAnim,
} from '@/lib/media/text/text-viewer-page-anim';
import { ReaderSettings } from '@/components/viewer/text-viewer/ReaderSettings';
import { ReaderCatalog } from '@/components/viewer/text-viewer/ReaderCatalog';
import { ReaderCommentsDrawer } from '@/components/viewer/text-viewer/ReaderCommentsDrawer';
import { ReaderOfflineCacheDialog } from '@/components/viewer/text-viewer/ReaderOfflineCacheDialog';
import { ReaderMoreMenu } from '@/components/viewer/text-viewer/ReaderMoreMenu';
import { ReaderSearchDrawer } from '@/components/viewer/text-viewer/ReaderSearchDrawer';
import { ReaderBookmarksDrawer } from '@/components/viewer/text-viewer/ReaderBookmarksDrawer';
import { ReaderChangeSourceDialog } from '@/components/viewer/text-viewer/ReaderChangeSourceDialog';
import { ReaderClickRegionalOverlay } from '@/components/viewer/text-viewer/ReaderClickRegionalOverlay';
import { shouldShowClickActionHint } from '@/lib/media/text/reader-click-hint-storage';
import { resolveClickZone } from '@/lib/media/text/reader-click-region';
import { getHttpTTS } from '@/lib/database/http-tts';
import {
  startReadAloud,
  stopReadAloud,
  toggleReadAloudPause,
  getReadAloudState,
  isReadAloudSupported,
} from '@/lib/media/text/read-aloud';
import { type ReaderClickActionId } from '@/lib/media/text/reader-click-actions';
import {
  addReaderBookmark,
  selectionTextFromDocument,
  plainChapterExcerpt,
} from '@/lib/media/text/reader-bookmark';
import type { Bookmark } from '@/types';
import { cn } from '@/lib/utils';
import { isMobile } from '@/lib/platform/detect';
import { isLocalBook } from '@/lib/local-book';
import { showAppToast } from '@/components/shared/AppToasts';
import {
  MediaViewerShell,
  MediaViewerShellMain,
  MediaViewerHeader,
  MediaViewerFooter,
} from '@/components/viewer/MediaViewerShell';
import { MediaViewerChromeSlots } from '@/components/viewer/MediaViewerChromeSlots';
import {
  useMediaViewerMainScrollClass,
  useMediaViewerMainStageClass,
} from '@/lib/viewer/viewer-chrome-layout';
import { TextViewerToolbarHeader } from '@/components/viewer/text-viewer/TextViewerToolbarHeader';
import { TextViewerBottomChrome } from '@/components/viewer/text-viewer/TextViewerBottomChrome';

/** 区分轻点与滑动：移动超过阈值则不触发分区单击 */
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
  /** 导航栈条目是否栈顶可见 */
  entryVisible?: Accessor<boolean>;
}

/** 在 Shell 内挂载，供分区「菜单」动作与 Shell 顶栏显隐同步 */
function BookReaderChromeBridge(props: { onReady: (toggleBars: () => void) => void }) {
  const shell = useMediaViewerShell();
  onMount(() => props.onReady(() => shell.toggleBars()));
  return null;
}

export function BookReader(props: BookReaderProps) {
  let toggleChromeBars: () => void = () => undefined;

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
  const [viewportWidth, setViewportWidth] = createSignal(window.innerWidth);
  const [isWideScreen, setIsWideScreen] = createSignal(window.innerWidth >= 480);
  const [isDark, setIsDark] = createSignal(document.documentElement.classList.contains('dark'));

  let tapStartTime = 0;
  let tapStartX = 0;
  let tapStartY = 0;
  let tapMoved = false;

  const book = () => textViewerStore.state.book;
  const catalogSize = () => textViewerStore.state.catalog.length;
  const canOfflineCache = () => {
    const b = book();
    if (!b || textViewerStore.isGuestReading()) return false;
    return !isLocalBook(b);
  };

  const openOfflineCacheDialog = () => {
    if (!canOfflineCache()) {
      showAppToast({
        title: '无法离线缓存',
        description: textViewerStore.isGuestReading()
          ? '试读书籍请先加入书架'
          : '本地书籍无需缓存',
        variant: 'default',
      });
      return;
    }
    setOfflineCacheDialogOpen(true);
  };
  const catalog = () => textViewerStore.state.catalog;
  const chapterIndex = () => textViewerStore.state.chapterIndex;
  const currentChapter = () => catalog()[chapterIndex()];
  const showContent = () => textViewerStore.state.showContent;
  const content = () => textViewerStore.state.content;
  const chapterPos = () => textViewerStore.state.chapterPos;

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
  const readerTheme = () => textViewerStore.state.config.theme ?? 0;
  const bottomBarThemeClasses = () => {
    if (!isNarrowAndMobile()) return null;
    if (textViewerStore.state.config.statusBarDisplayStyle !== 'always') return null;
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

  const handlePrev = () => void textViewerStore.prevChapter();
  const handleNext = () => void textViewerStore.nextChapter();

  const canUseBookmarks = () => {
    const b = book();
    return !!b && !textViewerStore.isGuestReading();
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
    await textViewerStore.jumpToChapter(bm.chapterIndex);
    textViewerStore.setChapterPos(bm.chapterPos);
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
    const cfg = textViewerStore.state.config;
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

  let pagedNav: ReaderPagedNavApi | undefined;

  const normalizedPageAnim = () =>
    normalizeTextViewerPageAnim(textViewerStore.state.config.pageAnim);
  const isPagedMode = () => isTextViewerPagedAnim(normalizedPageAnim());

  const dualPageActive = () => {
    if (isPagedMode()) return false;
    return textViewerDualPageActive(
      textViewerStore.state.config.dualPage ?? 'auto',
      isWideScreen(),
      viewportWidth(),
    );
  };

  const goNextPage = () => {
    if (isPagedMode() && pagedNav) {
      pagedNav.goNextPage();
      return;
    }
    void handleNext();
  };

  const goPrevPage = () => {
    if (isPagedMode() && pagedNav) {
      pagedNav.goPrevPage();
      return;
    }
    void handlePrev();
  };

  const runClickAction = (action: ReaderClickActionId) => {
    switch (action) {
      case 'menu':
        toggleChromeBars();
        break;
      case 'nextPage':
        goNextPage();
        break;
      case 'prevPage':
        goPrevPage();
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

  const contentTransitionClass = () => {
    if (isPagedMode()) return '';
    const anim = normalizedPageAnim();
    if (anim === 'cover' || anim === 'linkedCover') return 'reader-chapter-enter-cover';
    if (anim === 'slide' || anim === 'simulation') return 'reader-chapter-enter-slide';
    if (anim === 'none') return '';
    return '';
  };

  /** 操作栏进度条：拖动时更新本章进度并同步滚动位置 */
  const handleChapterProgressChange = (values: number[]) => {
    const p = Math.max(0, Math.min(1, values[0] ?? 0));
    textViewerStore.setChapterPos(p);
    if (isPagedMode() && pagedNav) {
      pagedNav.setPageProgress(p);
      return;
    }
    if (scrollContainer) {
      const sh = scrollContainer.scrollHeight;
      const ch = scrollContainer.clientHeight;
      scrollContainer.scrollTop = sh > ch ? p * (sh - ch) : 0;
    }
  };

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

  /** 段评数量：无数据源时恒为 0，不渲染正文内数字气泡；接入后在此返回真实计数 */
  const getSegmentCommentCount = (_chapterIndex: number, _segmentIndex: number) => 0;

  createEffect(() => {
    if (!panelEntering()) return;
    let id: number;
    id = requestAnimationFrame(() => {
      id = requestAnimationFrame(() => setPanelEntering(false));
    });
    return () => cancelAnimationFrame(id);
  });

  onMount(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      setViewportWidth(w);
      setIsWideScreen(w >= 480);
    };
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
        else if (!catalogOpen() && !settingsOpen()) toggleChromeBars();
      }
      if (e.key === 'ArrowLeft') goPrevPage();
      if (e.key === 'ArrowRight') goNextPage();
      if (textViewerStore.state.config.volumeKeyTurnPage) {
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
    if (isPagedMode() || !scrollContainer || isRestoringScroll) return;

    // 计算滚动位置（相对于内容顶部）
    const scrollTop = scrollContainer.scrollTop;
    const scrollHeight = scrollContainer.scrollHeight;
    const clientHeight = scrollContainer.clientHeight;

    // 计算阅读位置（0-1之间的比例）
    const pos = scrollHeight > clientHeight
      ? Math.max(0, Math.min(1, scrollTop / (scrollHeight - clientHeight)))
      : 0;

    // 更新阅读位置
    textViewerStore.setChapterPos(pos);

    // 防抖保存：延迟500ms后保存
    if (scrollSaveTimer !== null) {
      clearTimeout(scrollSaveTimer);
    }
    scrollSaveTimer = window.setTimeout(() => {
      textViewerStore.saveProgress().catch(console.error);
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
      const anim = normalizedPageAnim();
      if (!isTextViewerPagedAnim(anim) && anim !== 'scroll') {
        setContentEnterKey((k) => k + 1);
      }
      if (!isPagedMode()) {
        requestAnimationFrame(() => {
          if (scrollContainer) {
            scrollContainer.scrollTop = 0;
            textViewerStore.setChapterPos(0);
          }
        });
      }
      lastChapterIndex = index;
      return;
    }

    // 更新章节索引记录
    lastChapterIndex = index;

    // 只在首次打开书籍时恢复滚动位置
    if (hasRestoredInitialScroll) return;

    if (isPagedMode()) {
      hasRestoredInitialScroll = true;
      return;
    }

    const pos = textViewerStore.state.chapterPos;

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

  const runRegionalClick = (e: MouseEvent) => {
    const t = scrollContainer;
    if (!t) return;
    const rect = t.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / Math.max(rect.width, 1);
    const yRatio = (e.clientY - rect.top) / Math.max(rect.height, 1);
    const zone = resolveClickZone(xRatio, yRatio, textViewerStore.state.config.clickRegion);
    const actions = textViewerStore.state.config.clickActions;
    const action = actions[zone] ?? 'menu';
    runClickAction(action);
    tapStartTime = 0;
  };

  const contentPrimaryAction = (e: MouseEvent) => {
    if (tapMoved) {
      tapStartTime = 0;
      return;
    }
    runRegionalClick(e);
  };

  const scrollContentClass = useMediaViewerMainScrollClass('reader-text-scroll');
  const stageContentClass = useMediaViewerMainStageClass('reader-text-stage');
  const readerThemeBg = () => readerThemeClasses(textViewerStore.state.config.theme).bg;

  const mainContentClass = () =>
    cn(
      isPagedMode() ? stageContentClass() : scrollContentClass(),
      isPagedMode() && readerThemeBg(),
    );

  const readerContentShared = {
    onOpenComments: openComments,
    getSegmentCommentCount,
    applyReadWidth: () => false as const,
  };

  const renderTextBody = () => (
    <Show
      when={isPagedMode()}
      fallback={
        <Index each={[contentEnterKey()]}>
          {() => (
            <ReaderContent
              class={cn('min-h-full', contentTransitionClass())}
              {...readerContentShared}
              dualPage={dualPageActive()}
            />
          )}
        </Index>
      }
    >
      <ReaderPagedViewport
        pageAnim={normalizedPageAnim}
        class="h-full min-h-full"
        {...readerContentShared}
        onRequestPrevChapter={() => void handlePrev()}
        onRequestNextChapter={() => void handleNext()}
        onRegisterNav={(api) => {
          pagedNav = api;
        }}
      />
    </Show>
  );

  return (
    <>
      <MediaViewerShell
        entryVisible={props.entryVisible}
        tapToToggleBars={false}
        chromePointerInput
        contentPrimaryAction={contentPrimaryAction}
      >
        <BookReaderChromeBridge onReady={(toggle) => {
          toggleChromeBars = toggle;
        }} />
        <MediaViewerShellMain>
          <MediaViewerChromeSlots
            header={
              <MediaViewerHeader>
                <TextViewerToolbarHeader
                  bookName={book()?.name ?? ''}
                  onClose={props.onClose}
                  onOpenBookInfo={props.onOpenBookInfo}
                  isWideScreen={isWideScreen()}
                  readAloudActive={readAloudActive()}
                  isDark={isDark()}
                  onToggleTheme={toggleTheme}
                  onOpenCatalog={() => setCatalogOpen(true)}
                  onReadAloud={handleReadAloud}
                  onOpenSettings={() => setSettingsOpen(true)}
                  onOpenReaderMenu={() => setReaderMenuDrawerOpen(true)}
                  onChangeSource={() => {
                    const b = book();
                    if (!b || textViewerStore.isGuestReading() || isLocalBook(b)) {
                      showAppToast({
                        title: '无法换源',
                        description: textViewerStore.isGuestReading()
                          ? '试读请先加入书架'
                          : '本地书不支持换源',
                      });
                      return;
                    }
                    setChangeSourceOpen(true);
                  }}
                  onRefreshChapter={() => {
                    void textViewerStore.refreshChapter().catch(() => undefined);
                  }}
                  onOpenOfflineCache={openOfflineCacheDialog}
                  onOpenMoreMenu={() => setMoreMenuOpen(true)}
                />
              </MediaViewerHeader>
            }
            footer={
              <MediaViewerFooter>
                <TextViewerBottomChrome
                  isWideScreen={isWideScreen()}
                  bottomBarThemeClasses={bottomBarThemeClasses()}
                  chapterTitle={currentChapter()?.title ?? ''}
                  chapterWordCountText={chapterWordCountText()}
                  chapterProgressPercent={chapterProgressPercent()}
                  bookProgressPercent={bookProgressPercent()}
                  chapterPos={chapterPos()}
                  onChapterProgressChange={handleChapterProgressChange}
                  onPrevChapter={handlePrev}
                  onNextChapter={handleNext}
                  onOpenCatalog={() => setCatalogOpen(true)}
                  onReadAloud={handleReadAloud}
                  readAloudActive={readAloudActive()}
                  onOpenSettings={() => setSettingsOpen(true)}
                  onOpenReaderMenu={() => setReaderMenuDrawerOpen(true)}
                />
              </MediaViewerFooter>
            }
          >
          <Show
            when={isWideScreen() && (commentsOpen() || panelClosing())}
            fallback={
              <div
                ref={(el) => {
                  if (el) scrollContainer = el;
                }}
                class={mainContentClass()}
                onPointerDown={onContentPointerDown}
                onPointerMove={onContentPointerMove}
              >
                {renderTextBody()}
              </div>
            }
          >
            <div class="flex min-h-0 flex-1">
              <div class="relative min-w-0 flex-1 overflow-hidden">
                <div
                  ref={(el) => {
                    if (el) scrollContainer = el;
                  }}
                  class={mainContentClass()}
                  onPointerDown={onContentPointerDown}
                  onPointerMove={onContentPointerMove}
                >
                  {renderTextBody()}
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
          </MediaViewerChromeSlots>
        </MediaViewerShellMain>
      </MediaViewerShell>

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
                    textViewerStore.jumpToChapter(index);
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
          <AppDrawerBody class="px-4 pb-2 pt-1 overflow-y-auto scroll-gutter-stable-both mb-4">
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
          <AppDrawerBody class="gap-1 overflow-y-auto scroll-gutter-stable-both px-2 pb-2 mb-4">
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
                {textViewerStore.state.config.statusBarDisplayStyle === 'follow'
                  ? '跟随操作栏'
                  : textViewerStore.state.config.statusBarDisplayStyle === 'always'
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
          <div class="min-h-0 overflow-y-auto overscroll-contain px-6 pt-4 pb-2 contain-layout mb-4">
            <RadioGroup
              value={textViewerStore.state.config.statusBarDisplayStyle}
              onChange={(value) => {
                textViewerStore.setConfig({ statusBarDisplayStyle: value as 'follow' | 'always' | 'never' });
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
        chapterIndex={textViewerStore.state.chapterIndex}
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
        onJumpToChapter={(index) => void textViewerStore.jumpToChapter(index)}
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
          await textViewerStore.openBook(nextBook);
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

        .reader-paged-page {
          transform-origin: center center;
          will-change: transform, opacity;
        }

        @keyframes reader-paged-cover-out-next {
          from { transform: translateX(0); }
          to { transform: translateX(-100%); }
        }
        @keyframes reader-paged-cover-out-prev {
          from { transform: translateX(0); }
          to { transform: translateX(100%); }
        }
        @keyframes reader-paged-cover-in-next {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes reader-paged-cover-in-prev {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        .reader-paged-turn-cover-out-next {
          animation: reader-paged-cover-out-next 0.32s ease-out forwards;
        }
        .reader-paged-turn-cover-out-prev {
          animation: reader-paged-cover-out-prev 0.32s ease-out forwards;
        }
        .reader-paged-turn-cover-in-next {
          animation: reader-paged-cover-in-next 0.32s ease-out forwards;
        }
        .reader-paged-turn-cover-in-prev {
          animation: reader-paged-cover-in-prev 0.32s ease-out forwards;
        }
        .reader-paged-turn-linked-out-next {
          animation: reader-paged-cover-out-next 0.32s ease-out forwards;
        }
        .reader-paged-turn-linked-out-prev {
          animation: reader-paged-cover-out-prev 0.32s ease-out forwards;
        }

        @keyframes reader-paged-slide-out-next {
          from { transform: translateX(0); }
          to { transform: translateX(-100%); }
        }
        @keyframes reader-paged-slide-out-prev {
          from { transform: translateX(0); }
          to { transform: translateX(100%); }
        }
        @keyframes reader-paged-slide-in-next {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes reader-paged-slide-in-prev {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        .reader-paged-turn-slide-out-next {
          animation: reader-paged-slide-out-next 0.32s ease-out forwards;
        }
        .reader-paged-turn-slide-out-prev {
          animation: reader-paged-slide-out-prev 0.32s ease-out forwards;
        }
        .reader-paged-turn-slide-in-next {
          animation: reader-paged-slide-in-next 0.32s ease-out forwards;
        }
        .reader-paged-turn-slide-in-prev {
          animation: reader-paged-slide-in-prev 0.32s ease-out forwards;
        }

        @keyframes reader-paged-sim-out-next {
          from { transform: perspective(1200px) rotateY(0deg); opacity: 1; }
          to { transform: perspective(1200px) rotateY(-85deg); opacity: 0.2; }
        }
        @keyframes reader-paged-sim-out-prev {
          from { transform: perspective(1200px) rotateY(0deg); opacity: 1; }
          to { transform: perspective(1200px) rotateY(85deg); opacity: 0.2; }
        }
        @keyframes reader-paged-sim-in-next {
          from { transform: perspective(1200px) rotateY(85deg); opacity: 0.2; }
          to { transform: perspective(1200px) rotateY(0deg); opacity: 1; }
        }
        @keyframes reader-paged-sim-in-prev {
          from { transform: perspective(1200px) rotateY(-85deg); opacity: 0.2; }
          to { transform: perspective(1200px) rotateY(0deg); opacity: 1; }
        }
        .reader-paged-turn-sim-out-next {
          animation: reader-paged-sim-out-next 0.32s ease-out forwards;
          transform-origin: left center;
        }
        .reader-paged-turn-sim-out-prev {
          animation: reader-paged-sim-out-prev 0.32s ease-out forwards;
          transform-origin: right center;
        }
        .reader-paged-turn-sim-in-next {
          animation: reader-paged-sim-in-next 0.32s ease-out forwards;
          transform-origin: right center;
        }
        .reader-paged-turn-sim-in-prev {
          animation: reader-paged-sim-in-prev 0.32s ease-out forwards;
          transform-origin: left center;
        }
      `}</style>
    </>
  );
}
