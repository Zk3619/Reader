import { For, Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  ABR_LABEL,
  ENC_LABEL,
  RES_LABEL,
  type StreamFormat,
} from '@/lib/download/bili/types';
import {
  closeBiliPopup,
  getBiliHubState,
  patchBiliPopupSelect,
} from '@/stores/download-bili/hub';

export function BiliSelectPopup(props: { onConfirm: () => void }) {
  const hub = getBiliHubState();
  const provider = () => hub.popupProvider;
  const select = () => hub.popupSelect;

  const videoOpts = () =>
    [...new Set((provider()?.video ?? []).map((v) => v.id))].sort((a, b) => b - a);
  const audioOpts = () =>
    [...new Set((provider()?.audio ?? []).map((a) => a.id))].sort((a, b) => b - a);
  const encOpts = () =>
    [
      ...new Set(
        (provider()?.video ?? [])
          .map((v) => v.codecid)
          .filter((x): x is number => typeof x === 'number'),
      ),
    ].sort((a, b) => a - b);

  return (
    <Show when={hub.popupOpen && select() && provider()}>
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div class="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl border border-border bg-background p-4 shadow-xl">
          <div class="mb-3 flex items-center justify-between">
            <h3 class="text-base font-semibold">
              下载选项（{hub.popupItems.length} 项）
            </h3>
            <Button size="sm" variant="ghost" onClick={() => closeBiliPopup()}>
              关闭
            </Button>
          </div>

          <Show when={videoOpts().length}>
            <label class="mb-2 block text-xs text-muted-foreground">清晰度</label>
            <div class="mb-3 flex flex-wrap gap-1">
              <For each={videoOpts()}>
                {(id) => (
                  <Button
                    size="sm"
                    variant={select()!.res === id ? 'default' : 'outline'}
                    onClick={() => patchBiliPopupSelect({ res: id })}
                  >
                    {RES_LABEL[id] || id}
                  </Button>
                )}
              </For>
            </div>
          </Show>

          <Show when={audioOpts().length}>
            <label class="mb-2 block text-xs text-muted-foreground">音质</label>
            <div class="mb-3 flex flex-wrap gap-1">
              <For each={audioOpts()}>
                {(id) => (
                  <Button
                    size="sm"
                    variant={select()!.abr === id ? 'default' : 'outline'}
                    onClick={() => patchBiliPopupSelect({ abr: id })}
                  >
                    {ABR_LABEL[id] || id}
                  </Button>
                )}
              </For>
            </div>
          </Show>

          <Show when={encOpts().length}>
            <label class="mb-2 block text-xs text-muted-foreground">编码</label>
            <div class="mb-3 flex flex-wrap gap-1">
              <For each={encOpts()}>
                {(id) => (
                  <Button
                    size="sm"
                    variant={select()!.enc === id ? 'default' : 'outline'}
                    onClick={() => patchBiliPopupSelect({ enc: id })}
                  >
                    {ENC_LABEL[id] || id}
                  </Button>
                )}
              </For>
            </div>
          </Show>

          <label class="mb-2 block text-xs text-muted-foreground">格式</label>
          <div class="mb-3 flex flex-wrap gap-1">
            <For each={(['dash', 'mp4', 'flv'] as StreamFormat[])}>
              {(fmt) => (
                <Button
                  size="sm"
                  variant={select()!.fmt === fmt ? 'default' : 'outline'}
                  onClick={() => patchBiliPopupSelect({ fmt })}
                >
                  {fmt.toUpperCase()}
                </Button>
              )}
            </For>
          </div>

          <label class="mb-2 block text-xs text-muted-foreground">媒体</label>
          <div class="mb-3 flex flex-wrap gap-3 text-sm">
            <label class="flex items-center gap-1">
              <input
                type="checkbox"
                checked={select()!.media.audioVideo}
                onChange={(e) =>
                  patchBiliPopupSelect({
                    media: {
                      ...select()!.media,
                      audioVideo: e.currentTarget.checked,
                    },
                  })
                }
              />
              音视频
            </label>
            <label class="flex items-center gap-1">
              <input
                type="checkbox"
                checked={select()!.media.video}
                onChange={(e) =>
                  patchBiliPopupSelect({
                    media: { ...select()!.media, video: e.currentTarget.checked },
                  })
                }
              />
              仅视频
            </label>
            <label class="flex items-center gap-1">
              <input
                type="checkbox"
                checked={select()!.media.audio}
                onChange={(e) =>
                  patchBiliPopupSelect({
                    media: { ...select()!.media, audio: e.currentTarget.checked },
                  })
                }
              />
              仅音频
            </label>
          </div>

          <label class="mb-2 block text-xs text-muted-foreground">附加</label>
          <div class="mb-3 flex flex-wrap gap-3 text-sm">
            <Show when={provider()!.danmaku.includes('live')}>
              <label class="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={select()!.danmaku.live}
                  onChange={(e) =>
                    patchBiliPopupSelect({
                      danmaku: {
                        ...select()!.danmaku,
                        live: e.currentTarget.checked,
                      },
                    })
                  }
                />
                弹幕
              </label>
            </Show>
            <Show when={provider()!.misc.aiSummary}>
              <label class="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={select()!.misc.aiSummary}
                  onChange={(e) =>
                    patchBiliPopupSelect({
                      misc: {
                        ...select()!.misc,
                        aiSummary: e.currentTarget.checked,
                      },
                    })
                  }
                />
                AI 总结
              </label>
            </Show>
            <Show when={provider()!.nfo.single}>
              <label class="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={select()!.nfo.single}
                  onChange={(e) =>
                    patchBiliPopupSelect({
                      nfo: { ...select()!.nfo, single: e.currentTarget.checked },
                    })
                  }
                />
                NFO
              </label>
            </Show>
            <Show when={provider()!.misc.opusContent}>
              <label class="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={select()!.misc.opusContent}
                  onChange={(e) =>
                    patchBiliPopupSelect({
                      misc: {
                        ...select()!.misc,
                        opusContent: e.currentTarget.checked,
                      },
                    })
                  }
                />
                图文 MD
              </label>
            </Show>
            <Show when={provider()!.misc.opusImages}>
              <label class="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={select()!.misc.opusImages}
                  onChange={(e) =>
                    patchBiliPopupSelect({
                      misc: {
                        ...select()!.misc,
                        opusImages: e.currentTarget.checked,
                      },
                    })
                  }
                />
                图文图片
              </label>
            </Show>
            <Show when={provider()!.thumb.length}>
              <label class="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={select()!.thumb.length > 0}
                  onChange={(e) =>
                    patchBiliPopupSelect({
                      thumb: e.currentTarget.checked
                        ? provider()!.thumb.slice(0, 1)
                        : [],
                    })
                  }
                />
                封面
              </label>
            </Show>
          </div>

          <Show when={provider()!.misc.subtitles.length}>
            <label class="mb-2 block text-xs text-muted-foreground">字幕</label>
            <div class="mb-3 flex flex-wrap gap-1">
              <Button
                size="sm"
                variant={select()!.misc.subtitles === false ? 'default' : 'outline'}
                onClick={() =>
                  patchBiliPopupSelect({
                    misc: { ...select()!.misc, subtitles: false },
                  })
                }
              >
                无
              </Button>
              <For each={provider()!.misc.subtitles}>
                {(s) => (
                  <Button
                    size="sm"
                    variant={
                      select()!.misc.subtitles === s.id ? 'default' : 'outline'
                    }
                    onClick={() =>
                      patchBiliPopupSelect({
                        misc: { ...select()!.misc, subtitles: s.id },
                      })
                    }
                  >
                    {s.name}
                  </Button>
                )}
              </For>
            </div>
          </Show>

          <Show when={provider()!.danmaku.includes('history')}>
            <label class="mb-1 block text-xs text-muted-foreground">
              历史弹幕日期（YYYY-MM-DD，可选）
            </label>
            <input
              type="date"
              class="mb-3 w-full rounded border border-border bg-background px-2 py-1 text-sm"
              onChange={(e) => {
                const v = e.currentTarget.value;
                patchBiliPopupSelect({
                  danmaku: {
                    ...select()!.danmaku,
                    history: v || false,
                    live: select()!.danmaku.live || Boolean(v),
                  },
                });
              }}
            />
          </Show>

          <div class="flex justify-end gap-2">
            <Button variant="outline" onClick={() => closeBiliPopup()}>
              取消
            </Button>
            <Button onClick={() => props.onConfirm()}>加入任务</Button>
          </div>
        </div>
      </div>
    </Show>
  );
}
