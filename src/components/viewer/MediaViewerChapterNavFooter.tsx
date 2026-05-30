import { Button } from '@/components/ui/button';

export interface MediaViewerChapterNavFooterProps {
  chapterIndex: number;
  catalogLength: number;
  loading?: boolean;
  /** 中间附加信息（如漫画页码） */
  center?: import('solid-js').JSX.Element;
  onPrev: () => void;
  onNext: () => void;
}

/** 媒体阅读器通用章节切换底栏 */
export function MediaViewerChapterNavFooter(props: MediaViewerChapterNavFooterProps) {
  return (
    <div class="reader-bottom-bar flex items-center justify-between gap-2 border-t border-border/50 bg-background/95 px-4 py-2 text-muted-foreground backdrop-blur safe-area-inset-bottom">
      <Button
        variant="outline"
        size="sm"
        disabled={props.chapterIndex <= 0 || props.loading}
        onClick={props.onPrev}
      >
        上一章
      </Button>
      <div class="flex min-w-0 flex-col items-center gap-0.5 text-center">
        <span class="text-xs text-muted-foreground">
          {props.catalogLength > 0
            ? `${props.chapterIndex + 1} / ${props.catalogLength} 章`
            : ''}
        </span>
        {props.center}
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={props.chapterIndex >= props.catalogLength - 1 || props.loading}
        onClick={props.onNext}
      >
        下一章
      </Button>
    </div>
  );
}
