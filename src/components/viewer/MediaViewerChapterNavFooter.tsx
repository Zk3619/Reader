import { splitProps } from 'solid-js';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MediaViewerBottomChromeContent } from '@/components/viewer/MediaViewerBottomChromeContent';
import {
  mediaViewerChromeBottomPassThroughClass,
  mediaViewerChromeBottomRowClass,
  mediaViewerChromeFloatingBottomPillClass,
  mediaViewerChromeFloatingBottomRowClass,
  mediaViewerChromeHitTargetClass,
} from '@/components/viewer/viewer-chrome';
import { useMediaViewerShellOptional } from '@/components/viewer/media-viewer-shell-context';
import {
  useMediaViewerChromeFloating,
  useViewerChromeLayout,
} from '@/lib/viewer/viewer-chrome-layout';
import { mediaViewerChromeBarHoverHandlers } from '@/lib/media/media-viewer-chrome-bar-hover';

export interface MediaViewerChapterNavFooterProps {
  chapterIndex: number;
  catalogLength: number;
  loading?: boolean;
  /** 中间附加信息（如漫画页码）*/
  center?: import('solid-js').JSX.Element;
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
    'onPrev',
    'onNext',
  ]);

  const floating = useMediaViewerChromeFloating();
  const shell = useMediaViewerShellOptional();
  const chromeLayout = useViewerChromeLayout();
  const isFloatingLayout = () => chromeLayout() === 'floating';
  const barHover = () =>
    isFloatingLayout()
      ? mediaViewerChromeBarHoverHandlers(shell, chromeLayout())
      : {};
  const navBtn = () =>
    cn(
      floating.isFloating() && mediaViewerChromeFloatingBottomPillClass,
      isFloatingLayout() && mediaViewerChromeHitTargetClass,
    );
  const centerWrap = () =>
    cn(
      'flex min-w-0 flex-col items-center gap-0.5 text-center',
      floating.isFloating() && mediaViewerChromeFloatingBottomPillClass,
      isFloatingLayout() && mediaViewerChromeHitTargetClass,
    );
  const floatingPillStyle = () =>
    floating.isFloating() ? floating.overlaySurfaceStyle() : undefined;

  return (
    <MediaViewerBottomChromeContent>
      <div
        class={cn(
          isFloatingLayout()
            ? cn(
                mediaViewerChromeFloatingBottomRowClass,
                mediaViewerChromeBottomPassThroughClass,
              )
            : mediaViewerChromeBottomRowClass,
        )}
      >
        <Button
          variant={floating.isFloating() ? 'ghost' : 'outline'}
          size="sm"
          class={navBtn()}
          style={floatingPillStyle()}
          disabled={local.chapterIndex <= 0 || local.loading}
          onClick={local.onPrev}
          onPointerEnter={barHover().onPointerEnter}
          onPointerLeave={barHover().onPointerLeave}
        >
          上一章
        </Button>
        <div
          class={centerWrap()}
          style={floatingPillStyle()}
          onPointerEnter={barHover().onPointerEnter}
          onPointerLeave={barHover().onPointerLeave}
        >
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
          style={floatingPillStyle()}
          disabled={local.chapterIndex >= local.catalogLength - 1 || local.loading}
          onClick={local.onNext}
          onPointerEnter={barHover().onPointerEnter}
          onPointerLeave={barHover().onPointerLeave}
        >
          下一章
        </Button>
      </div>
    </MediaViewerBottomChromeContent>
  );
}
