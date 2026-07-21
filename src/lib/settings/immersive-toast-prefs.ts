/**
 * 沉浸模式进入提示的「不再提示」偏好
 */

export const IMMERSIVE_TOAST_KEY_PERMANENT = 'reader.immersiveToastDismissed';
export const IMMERSIVE_TOAST_KEY_UNTIL = 'reader.immersiveToastDismissedUntil';
export const IMMERSIVE_TOAST_KEY_SESSION = 'reader.immersiveToastDismissedSession';

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type ImmersiveToastChoice = 'session' | 'week' | 'permanent' | '';

export type ImmersiveToastDismissalStatus =
  | { kind: 'none' }
  | { kind: 'session' }
  | { kind: 'week'; until: number }
  | { kind: 'permanent' };

export function persistImmersiveToastChoice(choice: ImmersiveToastChoice): void {
  if (typeof localStorage === 'undefined' && typeof sessionStorage === 'undefined') return;
  switch (choice) {
    case 'session':
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(IMMERSIVE_TOAST_KEY_SESSION, '1');
      }
      break;
    case 'week':
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(IMMERSIVE_TOAST_KEY_UNTIL, String(Date.now() + ONE_WEEK_MS));
      }
      break;
    case 'permanent':
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(IMMERSIVE_TOAST_KEY_PERMANENT, '1');
      }
      break;
    default:
      break;
  }
}

export function shouldShowImmersiveEnterToast(): boolean {
  if (typeof localStorage !== 'undefined' && localStorage.getItem(IMMERSIVE_TOAST_KEY_PERMANENT) === '1') {
    return false;
  }
  if (typeof localStorage !== 'undefined') {
    const until = localStorage.getItem(IMMERSIVE_TOAST_KEY_UNTIL);
    if (until) {
      const t = Number(until);
      if (!Number.isNaN(t) && Date.now() < t) return false;
    }
  }
  if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(IMMERSIVE_TOAST_KEY_SESSION) === '1') {
    return false;
  }
  return true;
}

export function getImmersiveToastDismissalStatus(): ImmersiveToastDismissalStatus {
  if (typeof localStorage !== 'undefined' && localStorage.getItem(IMMERSIVE_TOAST_KEY_PERMANENT) === '1') {
    return { kind: 'permanent' };
  }
  if (typeof localStorage !== 'undefined') {
    const untilRaw = localStorage.getItem(IMMERSIVE_TOAST_KEY_UNTIL);
    if (untilRaw) {
      const until = Number(untilRaw);
      if (!Number.isNaN(until) && Date.now() < until) {
        return { kind: 'week', until };
      }
    }
  }
  if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(IMMERSIVE_TOAST_KEY_SESSION) === '1') {
    return { kind: 'session' };
  }
  return { kind: 'none' };
}

export function clearImmersiveToastDismissal(): void {
  try {
    localStorage?.removeItem(IMMERSIVE_TOAST_KEY_PERMANENT);
    localStorage?.removeItem(IMMERSIVE_TOAST_KEY_UNTIL);
  } catch {
    // ignore
  }
  try {
    sessionStorage?.removeItem(IMMERSIVE_TOAST_KEY_SESSION);
  } catch {
    // ignore
  }
}

export function immersiveToastDismissalLabel(status: ImmersiveToastDismissalStatus): string {
  switch (status.kind) {
    case 'permanent':
      return '已永久不再提示';
    case 'week':
      return '一周内不再提示';
    case 'session':
      return '本次启动前不再提示';
    default:
      return '未设置（每次进入都会提示）';
  }
}
