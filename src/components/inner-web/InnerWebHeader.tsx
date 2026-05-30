/**
 * 内嵌网页顶栏：基于统一 PageHeader（返回、标题、刷新、完成、更多、窗口控制）
 */

import { PageHeader, type PageHeaderAction } from '@/components/shell/PageHeader';
import { withBlurBefore } from '@/utils/accessibility';
import { cn } from '@/lib/utils';
import { CheckIcon, RefreshIcon } from '@/components/shared/icons';
import { InnerWebMoreMenu } from '@/components/inner-web/InnerWebMoreMenu';
import { isMobile, isTauri } from '@/lib/platform/detect';

export interface InnerWebHeaderProps {
  title: string;
  onBack: () => void;
  onConfirm?: () => void;
  onRefresh?: () => void;
  showConfirm?: boolean;
  confirmLoading?: boolean;
  /** Tauri 桌面子 WebView：显示窗口控制并支持拖拽 */
  showWindowControls?: boolean;
  /** 默认 true；inner-web 关闭时避免 blur 触发下层 Dialog 误关 */
  blurBeforeAction?: boolean;
  pageUrl?: string;
  cookieSyncUrl?: string;
  class?: string;
}

export function InnerWebHeader(props: InnerWebHeaderProps) {
  const showWindowControls = () =>
    props.showWindowControls !== false && isTauri() && !isMobile();
  const wrapAction = <T extends (event: Event) => void>(fn?: T) =>
    props.blurBeforeAction === false ? fn : withBlurBefore(fn);

  const actions = (): PageHeaderAction[] => {
    const list: PageHeaderAction[] = [];
    if (props.onRefresh) {
      list.push({
        icon: RefreshIcon,
        label: '刷新',
        onClick: () => props.onRefresh?.(),
        showTooltip: true,
      });
    }
    if (props.showConfirm) {
      list.push({
        icon: CheckIcon,
        label: '完成（保存并关闭）',
        onClick: () => props.onConfirm?.(),
        disabled: props.confirmLoading,
        showTooltip: true,
        iconClass: 'text-primary',
      });
    }
    return list;
  };

  return (
    <PageHeader
      onBack={wrapAction(props.onBack)}
      title={props.title}
      actions={actions()}
      trailing={
        <InnerWebMoreMenu pageUrl={props.pageUrl} cookieSyncUrl={props.cookieSyncUrl} />
      }
      showThemeToggle={false}
      showWindowControls={showWindowControls()}
      draggable={showWindowControls()}
      pinToTop
      class={cn(props.class)}
    />
  );
}
