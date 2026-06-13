/**
 * media-viewer 系统返回：顶底栏隐藏时先唤出 chrome，再次返回再走页面栈。
 */

export type MediaViewerChromeBackSession = {
  isChromeVisible: () => boolean;
  chromeBarsCollapsible: () => boolean;
  revealChrome: () => void;
};

let activeSession: MediaViewerChromeBackSession | null = null;
let activeToken: symbol | null = null;

export function registerMediaViewerChromeBackSession(
  session: MediaViewerChromeBackSession | null,
  token?: symbol,
): void {
  if (session === null) {
    if (token === undefined || token === activeToken) {
      activeSession = null;
      activeToken = null;
    }
    return;
  }
  activeSession = session;
  activeToken = token ?? null;
}

/** 系统返回且顶底栏已隐藏时唤出 chrome；返回 true 表示已消费本次返回且勿关闭叠层 */
export function tryRevealMediaViewerChromeOnSystemBack(): boolean {
  const session = activeSession;
  if (!session?.chromeBarsCollapsible() || session.isChromeVisible()) return false;
  session.revealChrome();
  return true;
}
