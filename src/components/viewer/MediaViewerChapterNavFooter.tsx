import { splitProps } from 'solid-js';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MediaViewerBottomChromeContent } from '@/components/viewer/MediaViewerBottomChromeContent';
import { mediaViewerChromeBottomRowClass } from '@/components/viewer/viewer-chrome';
import { useMediaViewerChromeFloating } from '@/lib/viewer/viewer-chrome-layout';

export interface MediaViewerChapterNavFooterProps {
  chapterIndex: number;
  catalogLength: number;
  loading?: boolean;
  /** 中间附加信息（如漫画页码）*/
  center?: import('solid-js').JSX.Element;
  /** @deprecated 显隐由 MediaViewerOverlayBottomChrome 控制 */
  visible?: boolean;
  onPrev: () => void;
  onNext: () => void;
}

/** 媒体阅读器章节底栏内容（壳层见 MediaViewerFooter → MediaViewerOverlayBottomChrome） */
export function MediaViewerChapterNavFooter(props: MediaViewerChapterNavFooterProps) {
  const [local] = splitProps(props, [
    'chapterIndex',
    'catalogLength',
    'loading',
    'center',
    'visible',
    'onPrev',
    'onNext',
  ]);

  const floating = useMediaViewerChromeFloating();
  const navBtn = () =>
    cn(
      floating.isFloating() && floating.pillClass(),
      floating.isFloating() && 'shadow-sm',
    );
  const centerWrap = () =>
    cn(
      'flex min-w-0 flex-col items-center gap-0.5 text-center',
      floating.isFloating() && floating.pillClass(),
      floating.isFloating() && 'px-3 py-1.5',
    );

  return (
    <MediaViewerBottomChromeContent>
      <div
        class={cn(
          mediaViewerChromeBottomRowClass,
          floating.isFloating() && 'border-0 bg-transparent',
        )}
      >
        <Button
          variant={floating.isFloating() ? 'ghost' : 'outline'}
          size="sm"
          class={navBtn()}
          disabled={local.chapterIndex <= 0 || local.loading}
          onClick={local.onPrev}
        >
          上一章
        </Button>
        <div class={centerWrap()}>
          <span class="text-xs text-muted-foreground">
            {local.catalogLength > 0
              ? `${local.chapterIndex + 1} / ${local.catalogLength} 章`
              : ''}
          </span>
          {local.center}
        </div>
        <Button
          variant={floating.isFloating() ? 'ghost' : 'outline'}
          size="sm"
          class={navBtn()}
          disabled={local.chapterIndex >= local.catalogLength - 1 || local.loading}
          onClick={local.onNext}
        >
          下一章
        </Button>
      </div>
    </MediaViewerBottomChromeContent>
  );
}
