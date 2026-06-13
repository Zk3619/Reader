import { createEffect, For, onCleanup, Show } from 'solid-js';
import {
  buildChapterPosOffsets,
  findParagraphIndexForPos,
  splitChapterParagraphs,
} from '@/lib/chapter-content';
import { formatPlainText, looksLikeHtml, rewriteContentImages } from '@/lib/content-render';

import type { ReaderSpacing } from '@/lib/reader-theme-config';
import {
  letterSpacingEm,
  lineHeightFromSpacing,
  paragraphSpacingEm,
} from '@/lib/reader-theme-config';

export function ChapterContent(props: {
  raw: string;
  bookUrl: string;
  title?: string;
  readWidth: number;
  fontSize: number;
  fontFamily: string;
  spacing?: Partial<ReaderSpacing>;
  lineHeight?: number;
  restorePos?: number;
  onReadPos?: (pos: number) => void;
}) {
  const lineHeight = () =>
    props.lineHeight ??
    lineHeightFromSpacing(props.spacing);
  const letterSpacing = () => letterSpacingEm(props.spacing);
  const paragraphGap = () => paragraphSpacingEm(props.spacing);

  const paragraphs = () => splitChapterParagraphs(props.raw);
  const offsets = () => buildChapterPosOffsets(paragraphs());
  const lineImgWidth = () => props.fontSize * 2;

  let blockRefs: HTMLElement[] = [];
  let titleRef: HTMLHeadingElement | undefined;
  let observer: IntersectionObserver | undefined;

  function renderBlock(block: string): string {
    const proxied = rewriteContentImages(block, props.bookUrl, lineImgWidth());
    if (looksLikeHtml(proxied)) return proxied;
    return formatPlainText(proxied);
  }

  function isStandaloneImg(block: string): boolean {
    return /^\s*<img[^>]*src[^>]+>\s*$/i.test(block.trim());
  }

  function fullImgHtml(block: string): string {
    return rewriteContentImages(block, props.bookUrl, props.readWidth);
  }

  createEffect(() => {
    paragraphs();
    observer?.disconnect();
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const pos = Number((entry.target as HTMLElement).dataset.chapterpos ?? '0');
          props.onReadPos?.(pos);
        }
      },
      { rootMargin: `0px 0px -${Math.max(24, window.innerHeight - 24)}px 0px` },
    );
    if (titleRef) observer.observe(titleRef);
    blockRefs.forEach((el) => el && observer?.observe(el));
  });

  onCleanup(() => observer?.disconnect());

  createEffect(() => {
    const pos = props.restorePos ?? 0;
    if (pos <= 0) return;
    const idx = findParagraphIndexForPos(offsets(), pos);
    const target = blockRefs[idx];
    if (target) {
      requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: 'auto', block: 'start' });
        props.onReadPos?.(pos);
      });
    }
  });

  return (
    <article
      class="reader-content mx-auto leading-relaxed"
      style={{
        'font-family': props.fontFamily,
        'font-size': `${props.fontSize}px`,
        'max-width': `${props.readWidth}px`,
        'line-height': String(lineHeight()),
        'letter-spacing': letterSpacing(),
        '--reader-paragraph-gap': paragraphGap(),
      }}
    >
      <Show when={props.title}>
        <h2
          ref={titleRef}
          class="reader-chapter-title mb-6 text-center text-xl font-medium opacity-90"
          data-chapterpos="0"
        >
          {props.title}
        </h2>
      </Show>
      <For each={paragraphs()}>
        {(block, i) => (
          <div
            ref={(el) => { blockRefs[i()] = el; }}
            data-chapterpos={String(offsets()[i()] ?? 0)}
            class="reader-paragraph"
          >
            <Show
              when={isStandaloneImg(block)}
              fallback={<div innerHTML={renderBlock(block)} />}
            >
              <div class="reader-full-img" innerHTML={fullImgHtml(block)} />
            </Show>
          </div>
        )}
      </For>
    </article>
  );
}
