/**
 * 书籍信息抽屉：复用 BookInfoPage 完整实现，基于 AppDrawer。
 * 视口 ≥ md 时右侧抽屉，< md 时底部抽屉。
 */

import {
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  splitProps,
} from 'solid-js';
import { BookInfoPage, type BookInfoPageProps } from '@/pages/book-info/BookInfoPage';
import {
  AppDrawer,
  AppDrawerBody,
  AppDrawerContent,
  AppDrawerHeader,
} from '@/components/shared/AppDrawer';
import { cn } from '@/lib/utils';
import {
  APP_BOOK_INFO_DRAWER_OVERLAY_Z,
  APP_BOOK_INFO_DRAWER_Z,
} from '@/lib/ui/overlay-z';
import { releasePageFocus } from '@/utils/accessibility';

const MD_MEDIA_QUERY = '(min-width: 768px)';

/** 与 AppDrawer `duration-300` / corvu 关闭过渡对齐 */
export const BOOK_INFO_DRAWER_TRANSITION_MS = 300;

function useMdUp() {
  const [mdUp, setMdUp] = createSignal(
    typeof window !== 'undefined' && window.matchMedia(MD_MEDIA_QUERY).matches,
  );

  onMount(() => {
    const mql = window.matchMedia(MD_MEDIA_QUERY);
    const onChange = () => setMdUp(mql.matches);
    mql.addEventListener('change', onChange);
    onCleanup(() => mql.removeEventListener('change', onChange));
  });

  return mdUp;
}

export interface BookInfoDrawerProps extends BookInfoPageProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BookInfoDrawer(props: BookInfoDrawerProps) {
  const [local, rest] = splitProps(props, ['open', 'onOpenChange', 'onBack']);
  const mdUp = useMdUp();
  const side = () => (mdUp() ? 'right' : 'bottom') as 'right' | 'bottom';

  /** 驱动 corvu 的本地 open；关闭时先播动画再通知宿主卸载 */
  const [drawerOpen, setDrawerOpen] = createSignal(false);
  const [closing, setClosing] = createSignal(false);
  let dismissTimer: ReturnType<typeof setTimeout> | undefined;

  const clearDismissTimer = () => {
    if (dismissTimer === undefined) return;
    clearTimeout(dismissTimer);
    dismissTimer = undefined;
  };

  const finishDismiss = () => {
    clearDismissTimer();
    setClosing(false);
    releasePageFocus();
    local.onOpenChange(false);
  };

  const animateDismiss = () => {
    if (!drawerOpen()) {
      if (!local.open) finishDismiss();
      return;
    }
    setClosing(true);
    setDrawerOpen(false);
    dismissTimer = setTimeout(finishDismiss, BOOK_INFO_DRAWER_TRANSITION_MS);
  };

  onCleanup(() => {
    clearDismissTimer();
  });

  createEffect(() => {
    if (local.open) {
      clearDismissTimer();
      setClosing(false);
      setDrawerOpen(true);
      return;
    }
    if (drawerOpen() && !dismissTimer) {
      animateDismiss();
    }
  });

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setDrawerOpen(true);
      return;
    }
    if (!drawerOpen()) return;
    animateDismiss();
  };

  const shellActive = () => drawerOpen() && !closing();

  return (
    <AppDrawer
      open={drawerOpen()}
      onOpenChange={handleOpenChange}
      side={side()}
      snapPoints={[0, 1]}
      defaultSnapPoint={1}
    >
      <AppDrawerContent
        portalToBody
        class={cn(APP_BOOK_INFO_DRAWER_Z, 'flex flex-col overflow-hidden', mdUp() && 'h-full')}
        overlayClass={APP_BOOK_INFO_DRAWER_OVERLAY_Z}
        showNativeDragHandle={false}
      >
        <AppDrawerHeader
          title="书籍信息"
          class="relative z-20 shrink-0 border-b border-border/40 bg-background"
        />
        <AppDrawerBody class="relative z-0 flex min-h-0 flex-1 flex-col overflow-hidden p-0">
          <BookInfoPage
            {...rest}
            presentation="drawer"
            shellActive={shellActive()}
            onBack={local.onBack}
          />
        </AppDrawerBody>
      </AppDrawerContent>
    </AppDrawer>
  );
}
