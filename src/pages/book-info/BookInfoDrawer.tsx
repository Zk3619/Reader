/**
 * 书籍信息抽屉：复用 BookInfoPage 完整实现，基于 AppDrawer。
 * 视口 ≥ md 时右侧抽屉，< md 时底部抽屉。
 */

import { createSignal, onCleanup, onMount, splitProps } from 'solid-js';
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

const MD_MEDIA_QUERY = '(min-width: 768px)';

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

  return (
    <AppDrawer
      open={local.open}
      onOpenChange={local.onOpenChange}
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
          <BookInfoPage {...rest} presentation="drawer" onBack={local.onBack} />
        </AppDrawerBody>
      </AppDrawerContent>
    </AppDrawer>
  );
}
