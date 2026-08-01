import { For, Show } from 'solid-js';
import { getBiliHubState } from '@/stores/download-bili/hub';
import { MEDIA_TYPE_LABEL } from '@/lib/download/bili/types';

export function BiliMediaInfo() {
  const hub = getBiliHubState();
  const nfo = () => hub.media?.nfo;
  return (
    <Show when={hub.media}>
      <div class="flex gap-3 rounded-lg border border-border/50 p-3">
        <Show when={nfo()?.thumbs?.[0]?.url || hub.media!.list[0]?.cover}>
          <img
            src={nfo()?.thumbs?.[0]?.url || hub.media!.list[0]?.cover}
            alt=""
            class="h-24 w-40 shrink-0 rounded object-cover"
          />
        </Show>
        <div class="min-w-0 flex-1">
          <div class="truncate text-base font-semibold">
            {nfo()?.showtitle || hub.media!.list[0]?.title}
          </div>
          <div class="mt-0.5 text-xs text-muted-foreground">
            {MEDIA_TYPE_LABEL[hub.media!.type]} · {hub.media!.list.length} 项
            <Show when={nfo()?.upper}>
              {' '}
              · UP {nfo()!.upper!.name}
            </Show>
          </div>
          <p class="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {nfo()?.intro || hub.media!.list[0]?.desc}
          </p>
          <div class="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <Show when={nfo()?.stat.play != null}>
              <span>播放 {nfo()!.stat.play}</span>
            </Show>
            <Show when={nfo()?.stat.danmaku != null}>
              <span>弹幕 {nfo()!.stat.danmaku}</span>
            </Show>
            <Show when={nfo()?.stat.like != null}>
              <span>点赞 {nfo()!.stat.like}</span>
            </Show>
            <For each={nfo()?.tags?.slice(0, 6) ?? []}>
              {(t) => (
                <span class="rounded bg-muted px-1.5 py-0.5 text-[11px]">{t}</span>
              )}
            </For>
          </div>
        </div>
      </div>
    </Show>
  );
}
