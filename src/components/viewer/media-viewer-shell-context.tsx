import { createContext, useContext, type Accessor } from 'solid-js';

export interface MediaViewerShellContextValue {
  headerVisible: Accessor<boolean>;
  footerVisible: Accessor<boolean>;
  setHeaderVisible: (visible: boolean) => void;
  toggleBars: () => void;
  tapToToggleBars: boolean;
}

const MediaViewerShellContext = createContext<MediaViewerShellContextValue>();

export function useMediaViewerShell(): MediaViewerShellContextValue {
  const ctx = useContext(MediaViewerShellContext);
  if (!ctx) {
    throw new Error('须在 MediaViewerShell 内使用');
  }
  return ctx;
}

/** 顶栏/底栏在未传 visible 时可读取 Shell 显隐状态 */
export function useMediaViewerShellOptional(): MediaViewerShellContextValue | undefined {
  return useContext(MediaViewerShellContext);
}

export function MediaViewerShellContextProvider(props: {
  value: MediaViewerShellContextValue;
  children: import('solid-js').JSX.Element;
}) {
  return (
    <MediaViewerShellContext.Provider value={props.value}>
      {props.children}
    </MediaViewerShellContext.Provider>
  );
}
