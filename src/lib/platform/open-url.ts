/**
 * 打开 URL 的两种方式（对齐 legado）：
 * - 应用内打开：WebviewWindow / inAppBrowser
 * - 系统浏览器：opener / window.open
 *
 * 书源登录：配置了 loginUi 时由调用方用对话框组件弹窗显示；未配置时用本模块 openUrlInApp 打开新窗口。
 */

import { isTauri } from './detect';
import { isMobile } from './detect';

const OPEN_URL_LOG = '[openUrlInApp]';

/**
 * 在应用内打开 URL（未配置 loginUi 时的书源登录、或其它内嵌打开场景）
 * - Tauri 桌面：WebviewWindow 新窗口
 * - Tauri 移动：opener inAppBrowser
 * - Web：window.open 新标签
 */
export async function openUrlInApp(url: string, title?: string): Promise<void> {
  const trimmed = url?.trim();
  console.warn(OPEN_URL_LOG, 'entry', { url: trimmed?.slice(0, 100), title });
  const isHttp = trimmed?.startsWith('http://') || trimmed?.startsWith('https://');
  const isData = trimmed?.startsWith('data:');
  const isReaderLoginOpen = trimmed?.startsWith('reader-login-open://');
  if (!trimmed || (!isHttp && !isData && !isReaderLoginOpen)) {
    console.warn(OPEN_URL_LOG, 'skip: URL 为空或非 http(s)/data/reader-login-open:', { trimmed: trimmed?.slice(0, 80) });
    return;
  }
  if (isTauri()) {
    if (isMobile() && isHttp && !isReaderLoginOpen) {
      console.warn(OPEN_URL_LOG, 'Tauri 移动: inAppBrowser', trimmed.slice(0, 80));
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(trimmed, 'inAppBrowser');
    } else if (!isMobile() || isData || isReaderLoginOpen) {
      console.warn(OPEN_URL_LOG, 'Tauri 桌面: 创建 WebviewWindow', trimmed.slice(0, 80));
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const label = `source-login-${Date.now()}`;
      const win = new WebviewWindow(label, {
        url: trimmed,
        title: title ?? '书源登录',
        width: 800,
        height: 600,
        minWidth: 400,
        minHeight: 300,
      });
      win.once('tauri://error', (e: unknown) => {
        const msg = e != null && typeof (e as { message?: string }).message === 'string'
          ? (e as { message: string }).message
          : String(e);
        console.error(OPEN_URL_LOG, 'WebviewWindow 创建失败:', msg, e);
      });
      win.once('tauri://created', () => {
        console.warn(OPEN_URL_LOG, 'WebviewWindow 已创建，请求焦点');
        win.setFocus().catch((err) => {
          console.warn(OPEN_URL_LOG, 'setFocus 失败', err);
        });
      });
    }
  } else {
    console.warn(OPEN_URL_LOG, 'Web: window.open', trimmed.slice(0, 80));
    window.open(trimmed, '_blank', 'noopener,noreferrer');
  }
}

/**
 * 在系统默认浏览器中打开 URL
 * - Tauri：使用 @tauri-apps/plugin-opener
 * - Web：window.open
 */
export async function openUrlInBrowser(url: string): Promise<void> {
  const trimmed = url?.trim();
  if (!trimmed || (!trimmed.startsWith('http://') && !trimmed.startsWith('https://'))) {
    return;
  }
  if (isTauri()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(trimmed);
  } else {
    window.open(trimmed, '_blank', 'noopener,noreferrer');
  }
}
