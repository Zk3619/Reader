import { createSignal, splitProps, type JSX } from 'solid-js';
import { cn } from '@/lib/utils';
import {
  MediaViewerShellContextProvider,
  type MediaViewerShellContextValue,
} from '@/components/viewer/media-viewer-shell-context';

export type { ViewerChromePlacement } from '@/components/viewer/viewer-chrome';

export interface MediaViewerShellProps {
  children: JSX.Element;
  class?: string;
  /** 顶栏显隐；不传则 Shell 内部管理（点击主区可切换） */
  headerVisible?: boolean;
  /** 底栏显隐；不传则与顶栏一致 */
  footerVisible?: boolean;
  onHeaderVisibleChange?: (visible: boolean) => void;
  /** 点击 MediaViewerShellMain 切换 overlay 顶底栏；文本阅读器请设为 false */
  tapToToggleBars?: boolean;
}

function MediaViewerShellRoot(props: MediaViewerShellProps) {
  const [local] = splitProps(props, [
    'children',
    'class',
    'headerVisible',
    'footerVisible',
    'onHeaderVisibleChange',
    'tapToToggleBars',
  ]);

  const [internalHeaderVisible, setInternalHeaderVisible] = createSignal(true);

  const isHeaderControlled = () => local.headerVisible !== undefined;

  const headerVisible = () =>
    isHeaderControlled() ? (local.headerVisible as boolean) : internalHeaderVisible();

  const footerVisible = () => {
    if (local.footerVisible !== undefined) return local.footerVisible;
    return headerVisible();
  };

  const setHeaderVisible = (visible: boolean) => {
    if (local.onHeaderVisibleChange) {
      local.onHeaderVisibleChange(visible);
      return;
    }
    if (!isHeaderControlled()) {
      setInternalHeaderVisible(visible);
    }
  };

  const shellValue = (): MediaViewerShellContextValue => ({
    headerVisible,
    footerVisible,
    setHeaderVisible,
    toggleBars: () => setHeaderVisible(!headerVisible()),
    tapToToggleBars: local.tapToToggleBars !== false,
  });

  return (
    <MediaViewerShellContextProvider value={shellValue()}>
      <div
        class={cn(
          'fixed inset-0 flex flex-col overflow-hidden bg-background text-foreground',
          local.class,
        )}
      >
        {local.children}
      </div>
    </MediaViewerShellContextProvider>
  );
}

export const MediaViewerShell = MediaViewerShellRoot;

export { MediaViewerShellMain } from '@/components/viewer/MediaViewerShellMain';
export { MediaViewerHeader } from '@/components/viewer/MediaViewerHeader';
export { MediaViewerFooter } from '@/components/viewer/MediaViewerFooter';

/** @deprecated 使用 MediaViewerShell */
export type MediaReaderShellProps = MediaViewerShellProps;

/** @deprecated 使用 MediaViewerShell */
export const MediaReaderShell = MediaViewerShell;
