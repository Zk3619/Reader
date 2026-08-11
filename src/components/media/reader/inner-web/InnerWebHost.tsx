/**
 * 内嵌网页浮层宿主：全屏层或四向抽屉（段评 preset 等）
 */

import { Show, createMemo } from 'solid-js';
import { Portal } from 'solid-js/web';
import type { InnerWebPayload } from '@/lib/platform/inner-web';
import { useInnerWebTauriPanel } from '@/lib/platform/inner-web-mode';
import {
  resolveInnerWebPresentation,
} from '@/lib/platform/inner-web-presentation';
import { isMobile, isTauri } from '@/lib/platform/detect';
import { cn } from '@/lib/utils';
import {
  InnerWebDrawerShell,
  idleInnerWebDrawerResolved,
} from '@/components/media/reader/inner-web/InnerWebDrawerShell';
import { InnerWebPage } from '@/pages/media/reader/inner-web/InnerWebPage';

export interface InnerWebHostProps {
  payload: InnerWebPayload | null | undefined;
  /** 由 registerInnerWebClose 清空 payload；页面内返回走 cancelInnerWebClose */
  onClose?: () => void;
}

export function InnerWebHost(props: InnerWebHostProps) {
  const hasContent = () => {
    const p = props.payload;
    if (!p) return false;
    return Boolean(p.html?.trim() || p.url?.trim());
  };

  const resolved = createMemo(() => {
    const p = props.payload;
    if (!p) return idleInnerWebDrawerResolved();
    return resolveInnerWebPresentation(p.presentation, { showConfirm: p.showConfirm });
  });

  const isDrawerLayout = () => hasContent() && resolved().layout === 'drawer';

  /** 与 InnerWebPage.panelMode 对齐：CF / forceTauriPanel 也算 panel */
  const usesTauriPanel = createMemo(() => {
    const p = props.payload;
    if (!p || !isTauri() || isMobile()) return false;
    if (p.cloudflareVerification || p.forceTauriPanel) return true;
    return useInnerWebTauriPanel({ url: p?.url, html: p?.html });
  });

  return (
    <>
      <Portal mount={document.body}>
        <InnerWebDrawerShell open={isDrawerLayout()} resolved={resolved()}>
          <Show when={isDrawerLayout()}>
            <InnerWebPage payload={props.payload} resolved={resolved()} />
          </Show>
        </InnerWebDrawerShell>
      </Portal>

      <Show when={hasContent() && resolved().layout !== 'drawer'}>
        <Portal mount={document.body}>
          <div
            class={cn(
              'reader-inner-web-layer fixed inset-0 flex flex-col bg-background',
              usesTauriPanel() && 'reader-inner-web-layer--panel',
            )}
            role="dialog"
            aria-modal="true"
            aria-label={props.payload?.title ?? '内嵌网页'}
          >
            <InnerWebPage payload={props.payload} resolved={resolved()} />
          </div>
        </Portal>
      </Show>
    </>
  );
}
