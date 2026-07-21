/**
 * 关闭窗口时「记住的选择」：隐藏到托盘 / 退出（独立于 closeToTray）
 */

export type CloseWindowAction = 'hide' | 'quit';

export const CLOSE_ACTION_STORAGE_KEY = 'closeAction';

export function readCloseWindowAction(): CloseWindowAction | null {
  try {
    const saved = localStorage.getItem(CLOSE_ACTION_STORAGE_KEY);
    if (saved === 'hide' || saved === 'quit') return saved;
  } catch {
    // ignore
  }
  return null;
}

export function writeCloseWindowAction(action: CloseWindowAction): void {
  try {
    localStorage.setItem(CLOSE_ACTION_STORAGE_KEY, action);
  } catch {
    // ignore
  }
}

export function clearCloseWindowAction(): void {
  try {
    localStorage.removeItem(CLOSE_ACTION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function closeWindowActionLabel(action: CloseWindowAction): string {
  return action === 'hide' ? '隐藏到托盘' : '退出应用';
}
