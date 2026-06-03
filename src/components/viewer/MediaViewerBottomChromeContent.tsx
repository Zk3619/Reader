import { splitProps, type JSX } from 'solid-js';
import { cn } from '@/lib/utils';
import { mediaViewerChromeBottomContentClass } from '@/components/viewer/viewer-chrome';

export interface MediaViewerBottomChromeContentProps {
  children: JSX.Element;
  class?: string;
}

/** 底栏 overlay 内唯一内容根（与 MediaViewerChapterNavFooter 同层级约定） */
export function MediaViewerBottomChromeContent(props: MediaViewerBottomChromeContentProps) {
  const [local] = splitProps(props, ['children', 'class']);
  return (
    <div class={cn(mediaViewerChromeBottomContentClass, local.class)}>
      {local.children}
    </div>
  );
}
