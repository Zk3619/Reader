/**
 * 页面级错误/警告通知（统一走 AppToasts，不在页面内嵌红条）
 */

import { showAppToast } from '@/components/shared/AppToasts';

export function notifyPageError(title: string, description?: string): void {
  showAppToast({
    title,
    description,
    variant: 'destructive',
  });
}

export function notifyPageWarning(title: string, description?: string): void {
  showAppToast({
    title,
    description,
    variant: 'warning',
  });
}
