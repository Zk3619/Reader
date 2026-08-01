import { For, Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import { getEdgeInfo, getPlayerInfo } from '@/lib/download/bili/extras';
import { durationLabel } from '@/lib/download/bili/error';
import {
  getBiliHubState,
  setBiliMedia,
  setBiliSectionTarget,
  setBiliSelected,
  toggleBiliSelected,
} from '@/stores/download-bili/hub';
import { getMediaInfo } from '@/lib/download/bili/media-info';
import { showAppToast } from '@/components/shared/AppToasts';

export function BiliMediaList(props: { onDownload: () => void }) {
  const hub = getBiliHubState();

  const selectAll = () => {
    if (!hub.media) return;
    setBiliSelected(hub.media.list.map((_, i) => i));
  };

  const clearSel = () => setBiliSelected([]);

  const switchSection = async (id: number) => {
    if (!hub.media) return;
    setBiliSectionTarget(id);
    try {
      const next = await getMediaInfo(hub.media.id, hub.media.type, {
        target: id,
      });
      setBiliMedia(next);
    } catch (e) {
      showAppToast({
        title: e instanceof Error ? e.message : '切换失败',
        variant: 'error',
      });
    }
  };

  const chooseEdge = async (edgeId: number) => {
    const media = hub.media;
    if (!media?.edge || !media.list[0]?.aid) return;
    try {
      const aid = media.list[0].aid!;
      const player = await getPlayerInfo(aid, media.list[0].cid!);
      const graph =
        media.edge.graph_version ||
        ((player.interaction as { graph_version?: number } | undefined)
          ?.graph_version ?? 0);
      const info = (await getEdgeInfo(aid, graph, edgeId)) as {
        story_list?: Array<{ edge_id: number; title: string; cid: number; cover?: string }>;
        edges?: { questions?: Array<{ choices?: Array<{ id: number; option: string }> }> };
        hidden_vars?: unknown[];
      };
      const story = info.story_list?.[0];
      if (!story) throw new Error('无分支节点');
      const list = media.list.map((it, i) =>
        i === 0
          ? {
              ...it,
              title: story.title || it.title,
              cid: story.cid,
              cover: story.cover || it.cover,
            }
          : it,
      );
      setBiliMedia({
        ...media,
        list,
        edge: {
          ...media.edge,
          edge_id: edgeId,
          list: info.story_list ?? media.edge.list,
          choices: info.edges?.questions?.[0]?.choices,
          vars: (info.hidden_vars as typeof media.edge.vars) ?? media.edge.vars,
        },
      });
    } catch (e) {
      showAppToast({
        title: e instanceof Error ? e.message : '互动分支失败',
        variant: 'error',
      });
    }
  };

  return (
    <Show when={hub.media}>
      <div class="flex min-h-0 flex-1 flex-col gap-2">
        <div class="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={selectAll}>
            全选
          </Button>
          <Button size="sm" variant="ghost" onClick={clearSel}>
            清空
          </Button>
          <span class="text-xs text-muted-foreground">
            已选 {hub.selected.length} / {hub.media!.list.length}
          </span>
          <Button
            size="sm"
            class="ml-auto"
            disabled={!hub.selected.length}
            onClick={() => props.onDownload()}
          >
            下载所选
          </Button>
        </div>

        <Show when={hub.media!.sections?.tabs?.length}>
          <div class="flex flex-wrap gap-1">
            <For each={hub.media!.sections!.tabs}>
              {(tab) => (
                <Button
                  size="sm"
                  variant={
                    hub.sectionTarget === tab.id ||
                    hub.media!.sections?.target === tab.id
                      ? 'default'
                      : 'outline'
                  }
                  onClick={() => void switchSection(tab.id)}
                >
                  {tab.name}
                </Button>
              )}
            </For>
          </div>
        </Show>

        <Show when={hub.media!.edge?.choices?.length}>
          <div class="flex flex-wrap gap-1 rounded border border-border/50 p-2">
            <span class="w-full text-xs text-muted-foreground">互动视频分支</span>
            <For each={hub.media!.edge!.choices!}>
              {(c) => (
                <Button size="sm" variant="outline" onClick={() => void chooseEdge(c.id)}>
                  {c.option}
                </Button>
              )}
            </For>
          </div>
        </Show>

        <div class="min-h-0 flex-1 overflow-auto rounded border border-border/40">
          <For each={hub.media!.list}>
            {(item, i) => {
              const idx = i();
              const on = () => hub.selected.includes(idx);
              return (
                <button
                  type="button"
                  class="flex w-full items-center gap-3 border-b border-border/30 px-3 py-2 text-left hover:bg-muted/40"
                  classList={{ 'bg-primary/10': on() }}
                  onClick={(e) => toggleBiliSelected(idx, e.ctrlKey || e.metaKey || true)}
                >
                  <input
                    type="checkbox"
                    checked={on()}
                    class="pointer-events-none"
                    readOnly
                  />
                  <Show when={item.cover}>
                    <img
                      src={item.cover}
                      alt=""
                      class="h-12 w-20 shrink-0 rounded object-cover"
                    />
                  </Show>
                  <div class="min-w-0 flex-1">
                    <div class="truncate text-sm font-medium">
                      {idx + 1}. {item.title}
                    </div>
                    <div class="text-xs text-muted-foreground">
                      {item.bvid || item.opid || item.sid || ''} ·{' '}
                      {durationLabel(item.duration || 0)}
                    </div>
                  </div>
                </button>
              );
            }}
          </For>
        </div>
      </div>
    </Show>
  );
}
