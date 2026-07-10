/**
 * 壳层侧栏生命周期：布局切换时关闭 Sheet，避免状态残留。
 */

import { createEffect } from 'solid-js';
import { useShellLayout } from '@/components/shell/ShellLayoutProvider';
import { useSidebar } from '@/components/ui/sidebar';

export function ShellSidebarLifecycle() {
  const shell = useShellLayout();
  const { setOpenMobile } = useSidebar();

  createEffect(() => {
    if (!shell().sidebarUseSheet) {
      setOpenMobile(false);
    }
  });

  return null;
}
