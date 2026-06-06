/**
 * 阅读器正文内容区
 * 参考 legado 阅读界面：应用阅读配置（主题、字体、间距），支持正文选中、段评气泡
 */

import { Show, For, createMemo, createSignal, createEffect } from 'solid-js';
import { textViewerStore } from '@/stores/viewer';
import {
  buildReaderDisplayBlocks,
  applyReaderImageStyle,
  parseImgRefsFromHtml,
  paragraphHasLegadoCommentImg,
  splitRawIntoParagraphSegments,
  type ReaderDisplayBlock,
  type ReaderParagraphPart,
} from '@/lib/media/text/reader-content-blocks';
import { openParagraphReviewFromClick } from '@/lib/book-source/legado-paragraph-review';
import { ReaderInlineImg } from '@/components/viewer/text-viewer/ReaderInlineImg';
import { ReaderContentSkeleton } from '@/components/viewer/text-viewer/ReaderContentSkeleton';
import { getSource } from '@/lib/database/sources';
import type { BookSource } from '@/types';

type ReaderDisplayBlockLocal = ReaderDisplayBlock;

function expandParagraphBlocks(
  blocks: ReaderDisplayBlockLocal[],
  chapterTitle: string | undefined,
): ReaderDisplayBlockLocal[] {
  const out: ReaderDisplayBlockLocal[] = [];
  for (const block of blocks) {
    if (block.type === 'figure') {
      out.push(block);
      continue;
    }
    const hasInlineImg = block.parts.some((p) => p.kind === 'img');
    if (hasInlineImg) {
      out.push(block);
      continue;
    }
    const fullText = block.parts
      .filter((p): p is Extract<ReaderParagraphPart, { kind: 'text' }> => p.kind === 'text')
      .map((p) => p.text)
      .join('');

    const legadoLines = splitRawIntoParagraphSegments(fullText);
    if (legadoLines.length > 1) {
      for (const text of legadoLines) {
        out.push({ type: 'paragraph', parts: [{ kind: 'text', text }] });
      }
      continue;
    }

    for (const text of getParagraphs(fullText, chapterTitle)) {
      out.push({ type: 'paragraph', parts: [{ kind: 'text', text }] });
    }
  }
  return out;
}

function toDisplayBlocks(
  raw: string,
  chapterTitle: string | undefined,
  bookImageStyle: string | undefined,
): ReaderDisplayBlockLocal[] {
  const built = buildReaderDisplayBlocks(raw, bookImageStyle);
  return expandParagraphBlocks(built, chapterTitle);
}
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { READER_THEME_CLASSES as themeClasses } from '@/lib/media/text/reader-theme-classes';

export interface ReaderContentProps {
  class?: string;
  /** 点击 Legado 段评 SVG（showCmt）→ 打开真实段评 API 页 */
  onLegadoCommentClick?: (click: string) => void;
  /** 点击段评气泡时打开段评面板，segmentIndex：0=章节标题，1起=段落 */
  onOpenComments?: (chapterIndex: number, segmentIndex: number) => void;
  /** 某段段评数量，为 0 时不显示气泡 */
  getSegmentCommentCount?: (chapterIndex: number, segmentIndex: number) => number;
  /** 沉浸模式下隐藏段评气泡 */
  hideCommentBubbles?: boolean;
  /** 是否应用阅读宽度限制；窄屏+移动端应为 false（正文占满宽度） */
  applyReadWidth?: () => boolean;
  /** 双页分栏（宽屏） */
  dualPage?: boolean;
  /** 仅渲染指定块索引（分页模式） */
  visibleBlockIndices?: number[];
  /** 为分页测量高度：块级节点带 data-reader-measure-block */
  measureBlocks?: boolean;
  /** 按页阅读：与测量层相同排版，避免 py 导致页高不一致 */
  pagedLayout?: boolean;
  /** 四边 inset 已由外层 content-slot 管理（滚动 / 按页） */
  insetManagedBySlot?: boolean;
  /**
   * 跨章翻页 staging：渲染相邻章正文，不切换 store（动画完成后再切章）
   */
  stagedChapter?: {
    chapterIndex: number;
    content: string;
    chapterTitle?: string;
  };
}

export function ReaderContent(props: ReaderContentProps) {
  const config = () => textViewerStore.state.config;
  const isStaged = () => props.stagedChapter != null;
  const content = () =>
    props.stagedChapter?.content ?? textViewerStore.state.content;
  const book = () => textViewerStore.state.book;
  const [bookSource, setBookSource] = createSignal<BookSource | null>(null);

  createEffect(() => {
    const origin = book()?.origin;
    if (!origin || origin === 'local') {
      setBookSource(null);
      return;
    }
    let cancelled = false;
    void getSource(origin).then((s) => {
      if (!cancelled) setBookSource(s ?? null);
    });
    return () => {
      cancelled = true;
    };
  });
  const contentLoading = () => textViewerStore.state.contentLoading;
  const contentFetching = () => textViewerStore.state.contentFetching;
  const contentBootstrapping = () => textViewerStore.state.contentBootstrapping;
  const showReaderSkeleton = () => {
    if (isStaged()) return false;
    return (
      contentFetching() ||
      contentBootstrapping() ||
      (contentLoading() && !showContent())
    );
  };
  const showContent = () =>
    isStaged()
      ? Boolean(props.stagedChapter?.content?.trim())
      : textViewerStore.state.showContent;
  const catalog = () => textViewerStore.state.catalog;
  const chapterIndex = () =>
    props.stagedChapter?.chapterIndex ?? textViewerStore.state.chapterIndex;
  const currentChapter = () => {
    const staged = props.stagedChapter;
    if (staged) {
      return (
        catalog()[staged.chapterIndex] ??
        (staged.chapterTitle ? { title: staged.chapterTitle } : undefined)
      );
    }
    return catalog()[chapterIndex()];
  };
  const chapterPageReferer = () => {
    const ch = currentChapter();
    const u = ch?.url ?? ch?.baseUrl ?? book()?.origin;
    return typeof u === 'string' && /^https?:\/\//i.test(u) ? u : undefined;
  };
  
  const errorDetail = () => {
    const c = content()?.trim() ?? '';
    if (!c) return null;
    if (c.startsWith('加载失败')) return c;
    if (c.startsWith('书源不存在')) return c;
    return null;
  };

  const isErrorContent = () => {
    if (isStaged()) return false;
    if (contentLoading() || !showContent()) return false;
    const c = content()?.trim() ?? '';
    if (!c) return true;
    return errorDetail() != null;
  };

  const contentInset = () => config().contentInset ?? {
    left: 16,
    right: 16,
    center: 32,
    top: 32,
    bottom: 32,
  };
  const fontSizePx = () => config().fontSize;

  const insetOnSlot = () => Boolean(props.insetManagedBySlot || props.pagedLayout);

  const themeStyle = () => {
    const c = config();
    const fontFamily = c.font === 0 || !c.customFontName
      ? 'var(--font-sans, ui-sans-serif, system-ui, sans-serif)'
      : c.customFontName;
    const useReadWidth = (props.applyReadWidth?.() !== false) && c.readWidth;
    return {
      'font-size': `${c.fontSize}px`,
      'line-height': c.spacing.line + 1,
      'letter-spacing': c.spacing.letter ? `${c.spacing.letter}em` : undefined,
      'font-family': fontFamily,
      'max-width': useReadWidth ? `${c.readWidth}px` : undefined,
    } as Record<string, string | number | undefined>;
  };

  const bodyStyle = () => {
    const inset = contentInset();
    const style: Record<string, string | undefined> = {};
    if (props.dualPage) {
      const gap = inset.center > 0 ? inset.center : 32;
      style['column-count'] = '2';
      style['column-gap'] = `${gap}px`;
      style['column-fill'] = 'balance';
      style['width'] = '100%';
    }
    return style;
  };

  const paragraphStyle = () => {
    const p = config().spacing.paragraph;
    // paragraphStyle 应用在 reader-body 上，用于设置段落间距
    // 但实际段落间距由每个 <p> 标签的 mb-4 和 paragraphStyle 共同决定
    return { 'margin-bottom': p ? `${p}em` : undefined };
  };

  const imageStyleKey = () => config().imageStyle;

  const contentBlocks = createMemo(() =>
    toDisplayBlocks(content() ?? '', currentChapter()?.title, imageStyleKey()),
  );

  const blockEntries = createMemo(() => {
    const all = contentBlocks();
    const indices = props.visibleBlockIndices;
    if (!indices?.length) {
      return all.map((block, blockIndex) => ({ block, blockIndex }));
    }
    return indices
      .filter((i) => i >= 0 && i < all.length)
      .map((blockIndex) => ({ block: all[blockIndex]!, blockIndex }));
  });

  const getCount = (segmentIndex: number) =>
    (props.getSegmentCommentCount ?? (() => 0))(
      chapterIndex(),
      segmentIndex
    );

  const handleLegadoCommentClick = (click: string) => {
    console.log('[ReaderContent] legado comment click', click?.slice(0, 200));
    if (props.onLegadoCommentClick) {
      props.onLegadoCommentClick(click);
      return;
    }
    const src = bookSource();
    if (src) {
      void openParagraphReviewFromClick(click, src);
    } else {
      console.warn('[ReaderContent] legado comment click: bookSource not loaded');
    }
  };

  return (
    <div
      class={cn(
        'reader-content min-h-full w-full px-0 selection:bg-primary/20',
        insetOnSlot() ? 'min-h-full py-0' : 'py-8',
        themeClasses[config().theme]?.bg ?? themeClasses[0].bg,
        themeClasses[config().theme]?.text ?? themeClasses[0].text,
        props.class
      )}
      data-reader-content="true"
      style={themeStyle()}
    >
      <Show when={showReaderSkeleton()}>
        <div class="reader-skeleton-wrapper">
          <ReaderContentSkeleton />
        </div>
      </Show>

      <Show when={!showReaderSkeleton() && !contentLoading() && showContent()}>
        <Show
          when={!isErrorContent()}
          fallback={
            <div class="flex flex-col items-center justify-center min-h-[200px] px-4 py-8">
              <div class="rounded-xl border border-destructive/50 bg-destructive/10 px-6 py-8 max-w-md w-full">
                <div class="mb-4 text-center text-sm text-destructive">
                  <p class="font-medium mb-2 text-base">内容加载失败</p>
                  <Show when={errorDetail()}>
                    <p class="text-xs text-destructive/80 wrap-break-word">{errorDetail()}</p>
                  </Show>
                </div>
                <div class="flex justify-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => textViewerStore.refreshChapter(chapterIndex())}>
                    重试
                  </Button>
                </div>
              </div>
            </div>
          }
        >
          <div
            class={cn(
              'wrap-break-word reader-body',
              props.dualPage && 'reader-dual-page columns-2',
              props.pagedLayout && config().textFullJustify && 'reader-paged-justify',
              props.pagedLayout && config().textBottomJustify && 'reader-paged-bottom-justify',
            )}
            style={bodyStyle()}
          >
            {/* 章节标题 + 段评气泡（segmentIndex=0）；沉浸模式下不显示气泡 */}
            <Show when={currentChapter()?.title}>
              <div
                class="mb-4 flex items-center justify-center gap-2"
                data-reader-measure-block={props.measureBlocks ? '' : undefined}
              >
                <h2 class="text-center text-lg font-semibold">
                  {currentChapter()!.title}
                </h2>
                <Show when={!props.hideCommentBubbles && (getCount(0) ?? 0) > 0}>
                  <button
                    type="button"
                    class="reader-comment-bubble inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded border border-border bg-muted/60 px-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground no-drag"
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onOpenComments?.(chapterIndex(), 0);
                    }}
                    aria-label={`本章节 ${getCount(0)} 条段评`}
                  >
                    {getCount(0)}
                  </button>
                </Show>
              </div>
            </Show>
          {/* 段落 / 插图块 + 段评气泡 */}
          <div class="prose prose-p:mb-4 max-w-none">
            <For each={blockEntries()}>
              {(entry) => (
                <div data-reader-measure-block={props.measureBlocks ? '' : undefined}>
                <ReaderBlockItem
                  block={entry.block}
                  blockIndex={entry.blockIndex}
                  paragraphStyle={paragraphStyle()}
                  getCount={getCount}
                  hideBubbles={props.hideCommentBubbles}
                  chapterIndex={chapterIndex()}
                  onOpenComments={props.onOpenComments}
                  onLegadoCommentClick={handleLegadoCommentClick}
                  fontSizePx={fontSizePx()}
                  imageStyle={imageStyleKey()}
                  referer={chapterPageReferer()}
                  source={bookSource()}
                />
                </div>
              )}
            </For>
          </div>
          </div>
        </Show>
      </Show>
    </div>
  );
}

function ReaderBlockItem(props: {
  block: ReaderDisplayBlockLocal;
  blockIndex: number;
  paragraphStyle: Record<string, string | number | undefined>;
  getCount: (segmentIndex: number) => number;
  hideBubbles?: boolean;
  chapterIndex: number;
  onOpenComments?: (chapterIndex: number, segmentIndex: number) => void;
  onLegadoCommentClick?: (click: string) => void;
  fontSizePx?: number;
  imageStyle?: string;
  referer?: string;
  source?: BookSource | null;
}) {
  if (props.block.type === 'figure') {
    const refs = props.block.refs.map((ref) => {
      const styled = applyReaderImageStyle(
        `<img src="${ref.url.replace(/"/g, '&quot;')}">`,
        props.imageStyle,
      );
      return parseImgRefsFromHtml(styled, props.imageStyle)[0] ?? ref;
    });
    const isSingle = refs.some((r) => r.layout === 'SINGLE') || props.imageStyle === 'SINGLE';
    return (
      <figure
        class={cn(
          'my-4 flex flex-col items-center gap-2 break-inside-avoid',
          isSingle && 'min-h-[75vh] justify-center py-8',
        )}
      >
        <For each={refs}>
          {(ref) => (
            <ReaderInlineImg
              src={ref.url}
              legadoImageHeaders={ref.legadoHeaders}
              legadoClick={ref.legadoClick}
              layout={ref.layout}
              referer={props.referer}
              source={props.source}
              imageStyle={props.imageStyle}
              fontSizePx={props.fontSizePx}
              onLegadoCommentClick={props.onLegadoCommentClick}
            />
          )}
        </For>
      </figure>
    );
  }

  const hasInlineImg = props.block.parts.some((p) => p.kind === 'img');
  if (hasInlineImg) {
    return (
      <ParagraphWithParts
        parts={props.block.parts}
        segmentIndex={props.blockIndex + 1}
        paragraphStyle={props.paragraphStyle}
        getCount={props.getCount}
        hideBubbles={props.hideBubbles}
        chapterIndex={props.chapterIndex}
        onOpenComments={props.onOpenComments}
        onLegadoCommentClick={props.onLegadoCommentClick}
        fontSizePx={props.fontSizePx}
        imageStyle={props.imageStyle}
        referer={props.referer}
        source={props.source}
      />
    );
  }

  const text = props.block.parts
    .filter((p): p is Extract<ReaderParagraphPart, { kind: 'text' }> => p.kind === 'text')
    .map((p) => p.text)
    .join('');
  return (
    <ParagraphBlock
      raw={text}
      segmentIndex={props.blockIndex + 1}
      paragraphStyle={props.paragraphStyle}
      getCount={props.getCount}
      hideBubbles={props.hideBubbles}
      chapterIndex={props.chapterIndex}
      onOpenComments={props.onOpenComments}
    />
  );
}

function ParagraphWithParts(props: {
  parts: ReaderParagraphPart[];
  segmentIndex: number;
  paragraphStyle: Record<string, string | number | undefined>;
  getCount: (segmentIndex: number) => number;
  hideBubbles?: boolean;
  chapterIndex: number;
  onOpenComments?: (chapterIndex: number, segmentIndex: number) => void;
  onLegadoCommentClick?: (click: string) => void;
  fontSizePx?: number;
  imageStyle?: string;
  referer?: string;
  source?: BookSource | null;
}) {
  const count = () => props.getCount(props.segmentIndex) ?? 0;
  const hideMockBubble = () => paragraphHasLegadoCommentImg(props.parts);
  return (
    <p class="reader-p break-inside-avoid" style={props.paragraphStyle}>
      <For each={props.parts}>
        {(part) =>
          part.kind === 'text' ? (
            <span innerHTML={paragraphToHtml(part.text)} />
          ) : (
            <ReaderInlineImg
              src={part.ref.url}
              legadoImageHeaders={part.ref.legadoHeaders}
              legadoClick={part.ref.legadoClick}
              layout={part.ref.layout}
              referer={props.referer}
              source={props.source}
              imageStyle={props.imageStyle}
              fontSizePx={props.fontSizePx}
              onLegadoCommentClick={props.onLegadoCommentClick}
            />
          )
        }
      </For>
      <Show when={!props.hideBubbles && !hideMockBubble() && count() > 0}>
        <span class="inline align-baseline whitespace-nowrap ml-1">
          <button
            type="button"
            class="reader-comment-bubble inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded border border-border bg-muted/60 px-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground no-drag"
            onClick={(e) => {
              e.stopPropagation();
              props.onOpenComments?.(props.chapterIndex, props.segmentIndex);
            }}
            aria-label={`本段 ${count()} 条段评`}
          >
            {count()}
          </button>
        </span>
      </Show>
    </p>
  );
}

function ParagraphBlock(props: {
  raw: string;
  segmentIndex: number;
  paragraphStyle: Record<string, string | number | undefined>;
  getCount: (segmentIndex: number) => number;
  hideBubbles?: boolean;
  chapterIndex: number;
  onOpenComments?: (chapterIndex: number, segmentIndex: number) => void;
}) {
  const count = () => props.getCount(props.segmentIndex) ?? 0;
  const html = () => paragraphToHtml(props.raw);
  return (
    <p class="reader-p break-inside-avoid" style={props.paragraphStyle}>
      <span innerHTML={html()} />
      <Show when={!props.hideBubbles && count() > 0}>
        <span class="inline align-baseline whitespace-nowrap ml-1">
          <button
            type="button"
            class="reader-comment-bubble inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded border border-border bg-muted/60 px-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground no-drag"
            onClick={(e) => {
              e.stopPropagation();
              props.onOpenComments?.(props.chapterIndex, props.segmentIndex);
            }}
            aria-label={`本段 ${count()} 条段评`}
          >
            {count()}
          </button>
        </span>
      </Show>
    </p>
  );
}

/** 将纯文本拆成段落数组：保留首行缩进；反复去掉与章节名相同的段首行避免重复 */
function getParagraphs(text: string, chapterTitle?: string): string[] {
  if (!text?.trim()) return [];
  
  // 先按双换行符分割段落（标准做法：双换行符表示段落分隔）
  // 分割后，每个段落可能包含前导或尾随的换行符，需要清理
  let paragraphs = text.split(/\n\n+/);
  
  // 清理每个段落的前导和尾随换行符，但保留段首空格
  paragraphs = paragraphs.map((p) => {
    // 移除前导换行符（但保留段首空格）
    let cleaned = p.replace(/^\n+/, '');
    // 移除尾随换行符和空白
    cleaned = cleaned.replace(/\n+\s*$/, '');
    return cleaned;
  });
  
  // 如果按双换行符分割后只有一个段落，且段落内有多行，检查是否需要进一步分割
  // 这种情况出现在像《悟空传》这样段落之间只有单换行符的书籍
  if (paragraphs.length === 1 && paragraphs[0].includes('\n')) {
    const single = paragraphs[0];
    let newParagraphs: string[] = [];

    // 优先：按「换行+全角空格」分段（与 content.ts cleanContent 的 legado 风格一致）
    const byFullWidthIndent = single.split(/\n(?=[\u3000])/).map((p) => p.replace(/^\s+/, '').replace(/\s+$/, '')).filter((p) => p.length > 0);
    if (byFullWidthIndent.length > 1) {
      newParagraphs = byFullWidthIndent;
    } else {
      const lines = single.split('\n');
      let currentParagraph = '';

    // 检查是否所有非空行都以全角空格开头
    // 如果是，则每行都应该是一个独立的段落
    const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
    const allStartWithFullWidthSpace = nonEmptyLines.length > 0 && 
      nonEmptyLines.every((line) => /^[\u3000]+/.test(line));
    
    if (allStartWithFullWidthSpace) {
      // 所有行都以全角空格开头，每行作为一个独立段落
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();
        
        // 跳过空行
        if (trimmedLine.length === 0) {
          continue;
        }
        
        // 每行作为一个独立段落
        newParagraphs.push(line.replace(/\s+$/, ''));
      }
    } else {
      // 不是所有行都以全角空格开头，使用智能分割逻辑
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();
        
        // 跳过空行
        if (trimmedLine.length === 0) {
          // 如果当前段落不为空，空行表示段落结束
          if (currentParagraph.trim().length > 0) {
            newParagraphs.push(currentParagraph.replace(/\s+$/, ''));
            currentParagraph = '';
          }
          continue;
        }
        
        // 检查是否是以全角空格开头的行（可能是新段落的开始）
        const startsWithFullWidthSpace = /^[\u3000]+/.test(line);
        
        // 如果当前段落不为空，且当前行以全角空格开头
        // 检查前一行是否也以全角空格开头，如果不是，则这是新段落
        if (startsWithFullWidthSpace && currentParagraph.trim().length > 0) {
          const prevLine = currentParagraph.split('\n').pop() || '';
          const prevStartsWithFullWidthSpace = /^[\u3000]+/.test(prevLine);
          
          // 如果前一行不以全角空格开头，那么当前行是新段落的开始
          if (!prevStartsWithFullWidthSpace) {
            newParagraphs.push(currentParagraph.replace(/\s+$/, ''));
            currentParagraph = line;
          } else {
            // 前一行也以全角空格开头，可能是段落内的换行（比如对话），继续当前段落
            currentParagraph += '\n' + line;
          }
        } else {
          // 继续当前段落
          if (currentParagraph) {
            currentParagraph += '\n' + line;
          } else {
            currentParagraph = line;
          }
        }
      }
      
      // 添加最后一个段落
      if (currentParagraph.trim().length > 0) {
        newParagraphs.push(currentParagraph.replace(/\s+$/, ''));
      }
    }
    }

    // 如果成功分割出多个段落，使用新的段落数组
    if (newParagraphs.length > 1) {
      paragraphs = newParagraphs;
    }
  }
  
  // 处理每个段落：移除段落内的空行，但保留段首空格和行首空格
  paragraphs = paragraphs
    .map((p) => {
      // 移除段落内的空行（只包含空白字符的行）
      // 但保留段首空格和行首空格
      const lines = p.split('\n');
      const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
      
      // 如果段落内没有非空行，返回空字符串（后续会被过滤掉）
      if (nonEmptyLines.length === 0) {
        return '';
      }
      
      // 重新组合段落，移除末尾空白
      return nonEmptyLines.join('\n').replace(/\s+$/, '');
    })
    .filter((p) => p.length > 0);
  
  // 移除与章节标题相同的段首行，但保留后续内容的缩进
  while (chapterTitle && paragraphs.length > 0 && paragraphs[0]) {
    const first = paragraphs[0];
    const lines = first.split('\n');
    const firstLine = lines[0]?.trim() ?? '';
    
    if (firstLine !== chapterTitle) break;
    
    // 移除章节标题行，保留后续所有行（包括它们的缩进）
    // 重要：使用 slice(1) 保留所有后续行，包括首段的缩进
    let rest = lines.slice(1).join('\n');
    
    // 移除开头的换行符（但保留段首空格）
    // 关键：只移除开头的换行符，不移除段首的空格
    while (rest.startsWith('\n')) {
      rest = rest.slice(1);
    }
    
    // 只移除末尾空白，保留段首和行首空格
    const trimmedRest = rest.replace(/\s+$/, '');
    
    // 调试：检查移除章节标题后的首段
    // if (trimmedRest.length > 0) {
    //   const firstCharAfterTitle = trimmedRest.charCodeAt(0);
    //   const hasSpaceAfterTitle = firstCharAfterTitle === 0x20 || firstCharAfterTitle === 0x3000;
    //   console.log('[段落分割] 移除章节标题后:', {
    //     hasSpace: hasSpaceAfterTitle,
    //     firstChar: firstCharAfterTitle,
    //     charCode: firstCharAfterTitle,
    //     preview: trimmedRest.substring(0, 50),
    //     rawPreview: Array.from(trimmedRest.substring(0, 10)).map(c => ({
    //       char: c,
    //       code: c.charCodeAt(0),
    //     })),
    //   });
    // } else {
    //   console.warn('[段落分割] 警告：移除章节标题后，首段为空！', {
    //     originalFirst: first.substring(0, 50),
    //     rest: rest.substring(0, 50),
    //   });
    // }
    
    if (trimmedRest.trim().length > 0) {
      // 确保首段有内容，保留其段首缩进
      paragraphs[0] = trimmedRest;
      
      // 如果移除章节标题后，首段仍然包含多行，需要检查是否需要进一步分割
      if (paragraphs[0].includes('\n')) {
        const lines = paragraphs[0].split('\n');
        const newParagraphs: string[] = [];
        
        // 检查是否所有非空行都以全角空格开头
        const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
        const allStartWithFullWidthSpace = nonEmptyLines.length > 1 && 
          nonEmptyLines.every((line) => /^[\u3000]+/.test(line));
        
        if (allStartWithFullWidthSpace) {
          // 所有行都以全角空格开头，每行作为一个独立段落
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();
            
            // 跳过空行
            if (trimmedLine.length === 0) {
              continue;
            }
            
            // 每行作为一个独立段落
            newParagraphs.push(line.replace(/\s+$/, ''));
          }
          
          // 如果成功分割出多个段落，替换原来的首段
          if (newParagraphs.length > 1) {
            paragraphs = [...newParagraphs, ...paragraphs.slice(1)];
          }
        } else {
          // 不是所有行都以全角空格开头，使用智能分割逻辑
          let currentParagraph = '';
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();
            
            // 跳过空行
            if (trimmedLine.length === 0) {
              // 如果当前段落不为空，空行表示段落结束
              if (currentParagraph.trim().length > 0) {
                newParagraphs.push(currentParagraph.replace(/\s+$/, ''));
                currentParagraph = '';
              }
              continue;
            }
            
            // 检查是否是以全角空格开头的行（可能是新段落的开始）
            const startsWithFullWidthSpace = /^[\u3000]+/.test(line);
            
            // 如果当前段落不为空，且当前行以全角空格开头
            // 检查前一行是否也以全角空格开头，如果不是，则这是新段落
            if (startsWithFullWidthSpace && currentParagraph.trim().length > 0) {
              const prevLine = currentParagraph.split('\n').pop() || '';
              const prevStartsWithFullWidthSpace = /^[\u3000]+/.test(prevLine);
              
              // 如果前一行不以全角空格开头，那么当前行是新段落的开始
              if (!prevStartsWithFullWidthSpace) {
                newParagraphs.push(currentParagraph.replace(/\s+$/, ''));
                currentParagraph = line;
              } else {
                // 前一行也以全角空格开头，可能是段落内的换行（比如对话），继续当前段落
                currentParagraph += '\n' + line;
              }
            } else {
              // 继续当前段落
              if (currentParagraph) {
                currentParagraph += '\n' + line;
              } else {
                currentParagraph = line;
              }
            }
          }
          
          // 添加最后一个段落
          if (currentParagraph.trim().length > 0) {
            newParagraphs.push(currentParagraph.replace(/\s+$/, ''));
          }
        }
        
        // 如果成功分割出多个段落，替换原来的首段
        if (newParagraphs.length > 1) {
          paragraphs = [...newParagraphs, ...paragraphs.slice(1)];
        }
      }
    } else {
      paragraphs = paragraphs.slice(1);
    }
  }
  
  return paragraphs;
}

/** 单段纯文本转 HTML：转义、中文引号空格、换行，保留段首缩进 */
function paragraphToHtml(p: string): string {
  // 先检查段首是否有空格（用于调试）
  // const hasLeadingSpace = /^[ \u3000]+/.test(p);
  // if (hasLeadingSpace) {
  //   const leadingMatch = p.match(/^([ \u3000]+)/);
  //   console.log('[段落HTML] 原始段首空格:', {
  //     count: leadingMatch?.[1].length ?? 0,
  //     chars: leadingMatch?.[1],
  //     firstChar: p.charCodeAt(0),
  //     preview: p.substring(0, 30),
  //   });
  // }
  
  // 先处理段首缩进，再处理转义和引号，避免引号处理影响段首空格
  // 匹配段首（整个段落开头）的半角空格或全角空格
  // 支持半角空格（U+0020）和全角空格（U+3000）
  let withIndent = p;
  const paragraphStartMatch = withIndent.match(/^([ \u3000]+)/);
  if (paragraphStartMatch) {
    const leadingSpaces = paragraphStartMatch[1];
    const halfWidthCount = (leadingSpaces.match(/ /g) || []).length;
    const fullWidthCount = (leadingSpaces.match(/\u3000/g) || []).length;
    const totalHalfWidthEquivalent = halfWidthCount + fullWidthCount * 2;
    
    // 中文排版标准：段首缩进为两个全角空格（两个汉字宽度）
    // 如果原文件有4个半角空格，转换为2个全角空格
    // 如果原文件有2个半角空格，转换为1个全角空格
    // 如果原文件已经有全角空格，保持原样
    let fullWidthIndent: string;
    if (fullWidthCount > 0) {
      // 如果已经有全角空格，保持原样（但确保至少2个）
      fullWidthIndent = '\u3000'.repeat(Math.max(2, fullWidthCount));
    } else {
      // 将半角空格转换为全角空格
      // 标准：4个半角空格 = 2个全角空格
      const fullWidthSpaceCount = Math.max(2, Math.ceil(totalHalfWidthEquivalent / 2));
      fullWidthIndent = '\u3000'.repeat(fullWidthSpaceCount);
    }
    
    // console.log('[段落HTML] 转换缩进:', {
    //   original: { halfWidthCount, fullWidthCount, totalHalfWidthEquivalent },
    //   converted: fullWidthIndent.length,
    // });
    
    withIndent = withIndent.replace(/^([ \u3000]+)/, fullWidthIndent);
    
    // 验证替换后的结果
    // const finalMatch = withIndent.match(/^([ \u3000]+)/);
    // console.log('[段落HTML] 最终段首空格:', {
    //   count: finalMatch?.[1].length ?? 0,
    //   chars: finalMatch?.[1],
    //   preview: withIndent.substring(0, 30),
    // });
  } else {
    // 参考 legado：对所有段落统一添加段首缩进（两个全角空格 = 两个汉字宽度）
    // 即使原文件没有段首空格，也添加标准中文排版缩进
    withIndent = '\u3000\u3000' + withIndent;
  }
  
  // 匹配每行开头的空格（换行后的行首，不包括段首）
  // 这些行首空格也转换为全角空格
  withIndent = withIndent.replace(/\n([ \u3000]+)/g, (_match, spaces) => {
    const halfWidthCount = (spaces.match(/ /g) || []).length;
    const fullWidthCount = (spaces.match(/\u3000/g) || []).length;
    const totalHalfWidthEquivalent = halfWidthCount + fullWidthCount * 2;
    const fullWidthSpaceCount = Math.max(1, Math.ceil(totalHalfWidthEquivalent / 2));
    const fullWidthIndent = '\u3000'.repeat(fullWidthSpaceCount);
    return '\n' + fullWidthIndent;
  });
  
  // 现在处理转义和中文引号空格（在段首缩进处理之后）
  // 重要：先转义，再处理引号，确保段首空格不被影响
  const escaped = escapeHtmlForReader(withIndent);
  
  // 检查转义后的段首空格（已注释调试代码）
  // const hasLeadingSpace = /^[ \u3000]+/.test(p);
  // const hasLeadingSpaceAfterEscape = /^[\u3000]+/.test(escaped);
  // if (hasLeadingSpaceAfterEscape) {
  //   const leadingMatchAfterEscape = escaped.match(/^([\u3000]+)/);
  //   console.log('[段落HTML] 转义后段首空格:', {
  //     count: leadingMatchAfterEscape?.[1].length ?? 0,
  //     chars: leadingMatchAfterEscape?.[1],
  //     preview: escaped.substring(0, 30),
  //   });
  // } else if (hasLeadingSpace) {
  //   console.warn('[段落HTML] 警告：段首空格在转义过程中丢失！', {
  //     original: p.substring(0, 30),
  //     afterEscape: escaped.substring(0, 30),
  //     withIndent: withIndent.substring(0, 30),
  //   });
  // }
  
  const spaced = spacingAroundChineseQuotes(escaped);
  
  // 检查引号处理后的段首空格
  // const hasLeadingSpaceAfterQuote = /^[\u3000]+/.test(spaced);
  // if (hasLeadingSpaceAfterQuote) {
  //   const leadingMatchAfterQuote = spaced.match(/^([\u3000]+)/);
  //   console.log('[段落HTML] 引号处理后段首空格:', {
  //     count: leadingMatchAfterQuote?.[1].length ?? 0,
  //     chars: leadingMatchAfterQuote?.[1],
  //     preview: spaced.substring(0, 30),
  //   });
  // } else if (hasLeadingSpaceAfterEscape) {
  //   console.warn('[段落HTML] 警告：段首空格在引号处理过程中丢失！', {
  //     afterEscape: escaped.substring(0, 30),
  //     afterQuote: spaced.substring(0, 30),
  //   });
  // }
  
  return spaced.replace(/\n/g, '<br/>');
}

/** 仅转义 & < >，不转义引号，避免中文引号「」"" 显示异常 */
function escapeHtmlForReader(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 左引号前、右引号后遇非空字符时加空格；左引号前若已是标点则不加空格（「」『』""） */
/** 左引号前若为该类标点，则不插入空格 */
const PUNCT_BEFORE_LEFT_QUOTE = /[，。、；：？！…—·）】》」』\u201D]/;

function spacingAroundChineseQuotes(s: string): string {
  return s
    .replace(/([^\s])([「『\u201C])/g, (_, prev, q) =>
      PUNCT_BEFORE_LEFT_QUOTE.test(prev) ? prev + q : prev + ' ' + q
    )
    .replace(/([」』\u201D])([^\s])/g, '$1 $2');
}
