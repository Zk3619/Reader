/**
 * 影视列表缩略封面（收藏列表卡 / 管理 / 历史共用）
 */

import { Show, createEffect, createSignal } from 'solid-js';
import { TvTabIcon } from '@/components/shared/icons';
import { cn } from '@/lib/utils';

export interface TvListCoverProps {
  coverUrl?: string;
  class?: string;
  /** 空图 / 失败时图标尺寸 */
  iconClass?: string;
}

function CoverFallback(props: { iconClass?: string }) {
  return (
    <div class="flex h-full w-full items-center justify-center bg-muted/40 text-muted-foreground">
      <TvTabIcon class={props.iconClass ?? 'h-7 w-7 opacity-40'} />
    </div>
  );
}

/** 列表行海报容器尺寸（对齐 TvKeepListCard） */
export const TV_LIST_COVER_FRAME_CLASS =
  'h-19 w-12.5 shrink-0 overflow-hidden rounded-lg bg-muted/30';

export function TvListCover(props: TvListCoverProps) {
  const [failed, setFailed] = createSignal(false);

  createEffect(() => {
    props.coverUrl;
    setFailed(false);
  });

  const showImage = () => !!props.coverUrl?.trim() && !failed();

  return (
    <div class={cn(TV_LIST_COVER_FRAME_CLASS, props.class)}>
      <Show when={showImage()} fallback={<CoverFallback iconClass={props.iconClass} />}>
        <img
          src={props.coverUrl}
          alt=""
          class="h-full w-full object-cover"
          loading="lazy"
          draggable={false}
          onError={() => setFailed(true)}
        />
      </Show>
    </div>
  );
}
