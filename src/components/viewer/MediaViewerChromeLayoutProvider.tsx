import { createContext, useContext, type Accessor, type JSX } from 'solid-js';
import type { ViewerChromeLayout } from '@/components/viewer/viewer-chrome';

const MediaViewerChromeLayoutOverrideContext =
  createContext<Accessor<ViewerChromeLayout | undefined>>();

/** 为单个 MediaViewer（如漫画阅读器）覆盖全局顶底栏布局 */
export function MediaViewerChromeLayoutProvider(props: {
  layout: Accessor<ViewerChromeLayout | undefined>;
  children: JSX.Element;
}) {
  return (
    <MediaViewerChromeLayoutOverrideContext.Provider value={props.layout}>
      {props.children}
    </MediaViewerChromeLayoutOverrideContext.Provider>
  );
}

export function useMediaViewerChromeLayoutOverride(): Accessor<
  ViewerChromeLayout | undefined
> {
  const ctx = useContext(MediaViewerChromeLayoutOverrideContext);
  return ctx ?? (() => undefined);
}
