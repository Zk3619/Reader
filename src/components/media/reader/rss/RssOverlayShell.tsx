/**
 * RSS 全屏浮层壳：铺满视口，叠在订阅主页之上
 */

import type { JSX } from 'solid-js';
import { cn } from '@/lib/utils';

export interface RssOverlayShellProps {
  children: JSX.Element;
  /** Tailwind z-index class */
  zClass?: string;
}

export function RssOverlayShell(props: RssOverlayShellProps) {
  return (
    <div
      class={cn(
        'pointer-events-auto fixed inset-0 flex flex-col bg-background',
        props.zClass ?? 'z-[110]',
      )}
      data-rss-overlay-shell
    >
      {props.children}
    </div>
  );
}
