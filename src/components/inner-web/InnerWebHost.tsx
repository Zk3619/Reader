/**
 * 内嵌网页浮层宿主：挂到 body，层级高于 Dialog，低于 Toast
 */

import { Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import type { InnerWebPayload } from '@/lib/platform/inner-web';
import { useInnerWebTauriPanel } from '@/lib/platform/inner-web-mode';
import { cn } from '@/lib/utils';
import { InnerWebPage } from '@/pages/inner-web/InnerWebPage';

export interface InnerWebHostProps {
  payload: InnerWebPayload | null | undefined;
  onClose: () => void;
}

export function InnerWebHost(props: InnerWebHostProps) {
  const hasContent = () => {
    const p = props.payload;
    if (!p) return false;
    return Boolean(p.html?.trim() || p.url?.trim());
  };

  return (
    <Show when={hasContent()}>
      <Portal mount={document.body}>
        <div
          class={cn(
            'reader-inner-web-layer fixed inset-0 flex flex-col bg-background',
            useInnerWebTauriPanel({
              url: props.payload?.url,
              html: props.payload?.html,
            }) && 'reader-inner-web-layer--panel'
          )}
          role="dialog"
          aria-modal="true"
          aria-label={props.payload?.title ?? '内嵌网页'}
        >
          <InnerWebPage payload={props.payload!} onBack={props.onClose} />
        </div>
      </Portal>
    </Show>
  );
}
