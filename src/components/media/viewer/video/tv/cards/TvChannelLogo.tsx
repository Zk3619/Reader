/**
 * 直播频道台标 — 经本地 proxy + @Headers 解析；失败时文字占位（对齐 fongmi ImgUtil）
 */

import { Show, createEffect, createSignal } from 'solid-js';
import { cn } from '@/lib/utils';
import {
  resolveProxyBaseUrl,
  wrapTvImageThroughProxy,
} from '@/lib/media/tv/proxy/client';

const failedLogo = new Set<string>();

function placeholderChar(name: string): string {
  const t = name.trim();
  if (!t) return '?';
  return t[0]!.toUpperCase();
}

function hueFromName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function TvChannelLogo(props: {
  name: string;
  logo?: string;
  class?: string;
}) {
  const [src, setSrc] = createSignal('');
  const [failed, setFailed] = createSignal(false);

  createEffect(() => {
    const logo = props.logo?.trim() ?? '';
    setFailed(false);
    setSrc('');
    if (!logo || failedLogo.has(logo)) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    void resolveProxyBaseUrl().then((base) => {
      if (cancelled) return;
      const proxied = wrapTvImageThroughProxy(logo, base);
      setSrc(proxied || logo);
    });
    return () => {
      cancelled = true;
    };
  });

  const showImg = () => !!src() && !failed();

  return (
    <div
      class={cn(
        'relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded bg-muted/50 text-[11px] font-semibold text-muted-foreground',
        props.class,
      )}
      style={
        !showImg()
          ? {
              background: `hsl(${hueFromName(props.name)} 28% 32%)`,
              color: 'rgba(255,255,255,0.92)',
            }
          : undefined
      }
    >
      <Show when={showImg()} fallback={<span>{placeholderChar(props.name)}</span>}>
        <img
          src={src()}
          alt=""
          class="h-full w-full object-contain"
          loading="lazy"
          draggable={false}
          onError={() => {
            const logo = props.logo?.trim();
            if (logo) failedLogo.add(logo);
            setFailed(true);
          }}
        />
      </Show>
    </div>
  );
}
