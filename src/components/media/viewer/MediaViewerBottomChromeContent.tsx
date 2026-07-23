import { splitProps, type JSX } from 'solid-js';
import { cn } from '@/lib/utils';
import { mediaViewerChromeBottomContentClass } from '@/components/media/viewer/viewer-chrome';

export interface MediaViewerBottomChromeContentProps {
  children: JSX.Element;
  class?: string;
}

/**
 * 底栏 overlay 内唯一内容根（与 MediaViewerChapterNavFooter 同层级约定）。
 * 底部安全间距由 MediaViewerFooter / OverlayBottomChrome / FloatingBottomChrome 的 surface 承担，
 * 勿在此重复加 app-bottom-chrome-inset，以免双重留白。
 */
export function MediaViewerBottomChromeContent(props: MediaViewerBottomChromeContentProps) {
  const [local] = splitProps(props, ['children', 'class']);
  return (
    <div class={cn(mediaViewerChromeBottomContentClass, local.class)}>
      {local.children}
    </div>
  );
}
