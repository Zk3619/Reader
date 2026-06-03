import { createContext, useContext, type Accessor } from 'solid-js';

export interface MediaViewerShellContextValue {
  headerVisible: Accessor<boolean>;
  footerVisible: Accessor<boolean>;
  /** 固定布局下为 false：顶底栏常显，不可自动隐藏或双击切换 */
  chromeBarsCollapsible: Accessor<boolean>;
  setHeaderVisible: (visible: boolean) => void;
  toggleBars: () => void;
  tapToToggleBars: boolean;
  /** 主区单击自定义逻辑（文本分区点击）；未设时单击切换顶底栏 */
  contentPrimaryAction?: (event: MouseEvent) => void;
  /** 内容区单击（延迟执行 action；桌面「回视口后点此隐藏」） */
  onContentPrimaryClick?: (event: MouseEvent, action: () => void) => void;
  /** 内容区双击：切换顶底栏 */
  onContentDblClick?: (event: MouseEvent, options?: { forceChrome?: boolean }) => void;
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
