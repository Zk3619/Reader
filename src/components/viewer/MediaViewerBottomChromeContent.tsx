import { splitProps, type JSX } from 'solid-js';
import { cn } from '@/lib/utils';
import { mediaViewerChromeBottomContentClass } from '@/components/viewer/viewer-chrome';
import { appBottomChromePadding } from '@/lib/ui/viewport-classes';
import { useViewerChromeLayout } from '@/lib/viewer/viewer-chrome-layout';

export interface MediaViewerBottomChromeContentProps {
  children: JSX.Element;
  class?: string;
}

/** 底栏 overlay 内唯一内容根（与 MediaViewerChapterNavFooter 同层级约定） */
export function MediaViewerBottomChromeContent(props: MediaViewerBottomChromeContentProps) {
  const [local] = splitProps(props, ['children', 'class']);
  const layout = useViewerChromeLayout();
  return (
    <div
      class={cn(
        mediaViewerChromeBottomContentClass,
        layout() !== 'floating' && appBottomChromePadding,
        local.class,
      )}
    >
      {local.children}
    </div>
  );
}
