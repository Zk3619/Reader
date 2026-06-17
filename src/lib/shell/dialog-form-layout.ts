import { createMemo, type Accessor } from 'solid-js';

import { useShellLayout } from '@/components/shell/ShellLayoutProvider';

/**
 * 弹窗内封面+字段横排：壳层宽屏（≥480px）且当前非移动底栏布局时启用。
 * 勿用纯 min-[480px] 媒体查询——移动端布局下宽屏仍会误触桌面横排。
 */
export function useDialogFormWideLayout(): Accessor<boolean> {
  const shell = useShellLayout();
  return createMemo(() => {
    const layout = shell();
    return layout.isWide && !layout.useMobileShell;
  });
}
