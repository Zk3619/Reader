import { splitProps } from 'solid-js';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useMediaViewerShellOptional } from '@/components/viewer/media-viewer-shell-context';

export interface MediaViewerChapterNavFooterProps {
  chapterIndex: number;
  catalogLength: number;
  loading?: boolean;
  /** 中间附加信息（如漫画页码）*/
  center?: import('solid-js').JSX.Element;
  /** 不传 overlay 时跟 MediaViewerShell footerVisible */
  visible?: boolean;
  onPrev: () => void;
  onNext: () => void;
}

/** 媒体阅读器通用章节切换底栏（overlay 位移+淡入淡出） */
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
  const shell = useMediaViewerShellOptional();
  const visible = () => {
    if (local.visible !== undefined) return local.visible;
    if (shell) return shell.footerVisible();
    return true;
  };

  return (
    <div
      class={cn(
        'reader-chrome-overlay-panel reader-chrome-overlay-panel--bottom',
        'flex items-center justify-between gap-2 border-t border-border/50 bg-background/95 px-4 py-2 text-muted-foreground backdrop-blur safe-area-inset-bottom',
        !visible() && 'reader-chrome-overlay-panel--hidden',
      )}
    >
      <Button
        variant="outline"
        size="sm"
        disabled={local.chapterIndex <= 0 || local.loading}
        onClick={local.onPrev}
      >
        上一章
      </Button>
      <div class="flex min-w-0 flex-col items-center gap-0.5 text-center">
        <span class="text-xs text-muted-foreground">
          {local.catalogLength > 0
            ? `${local.chapterIndex + 1} / ${local.catalogLength} 章`
            : ''}
        </span>
        {local.center}
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={local.chapterIndex >= local.catalogLength - 1 || local.loading}
        onClick={local.onNext}
      >
        下一章
      </Button>
    </div>
  );
}
