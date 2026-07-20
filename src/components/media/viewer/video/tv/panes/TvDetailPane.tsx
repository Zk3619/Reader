import { For, Show, createSignal, createEffect } from 'solid-js';
import { SettingsToolbarLeading } from '@/components/shell/SettingsPageToolbar';
import { AppTabs } from '@/components/shared/AppTabs';
import { TvHubPageShell } from '@/components/media/viewer/video/tv/hub/TvHubPageShell';
import { TvHubToolbarIconButton } from '@/components/media/viewer/video/tv/hub/TvHubToolbarIconButton';
import { TvDetailSkeleton } from '@/components/media/viewer/video/tv/hub/TvHubSkeletons';
import { tvHubPageContentInsetClass } from '@/lib/media/tv/tv-hub-section-meta';
import { shouldShowBlockingLoading } from '@/lib/media/audio/music-loading-ui';
import { useSkeletonLoading } from '@/lib/hooks/useSkeletonLoading';
import { ReplaceIcon, StarIcon } from '@/components/shared/icons';
import { cn } from '@/lib/utils';
import {
  getTvDetailState,
  playCurrentEpisode,
  selectEpisode,
  selectFlag,
  toggleKeepCurrent,
  switchSourceAndPlay,
} from '@/stores/tv-hub/detail';
import { getTvHubState, setTvSection } from '@/stores/tv-hub/section';
import * as TvDao from '@/lib/media/tv/db/tv-dao';

const episodeBtnClass = (selected: boolean) =>
  cn(
    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
    selected
      ? 'bg-primary text-primary-foreground shadow-sm'
      : 'bg-muted/80 text-foreground hover:bg-muted hover:text-foreground',
  );

export function TvDetailPane() {
  const state = getTvDetailState();
  const hub = getTvHubState();
  const flag = () => state.flags[state.flagIndex];
  const flagTabItems = () =>
    state.flags.map((f, i) => ({ value: String(i), label: f.flag }));
  const [kept, setKept] = createSignal(false);

  const showSkeleton = useSkeletonLoading(() =>
    shouldShowBlockingLoading(state.loading, state.vod ? 1 : 0),
  );

  createEffect(() => {
    const vod = state.vod;
    const siteKey = hub.siteKey;
    if (!vod || !siteKey) {
      setKept(false);
      return;
    }
    const key = `${siteKey}$${vod.vod_id}`;
    void TvDao.listKeep().then((list) => setKept(list.some((k) => k.key === key)));
  });

  return (
    <TvHubPageShell
      section="detail"
      title={state.vod?.vod_name || '详情'}
      description={state.vod?.type_name || ''}
      leading={<SettingsToolbarLeading onBack={() => setTvSection('home')} />}
      toolbar={
        <>
          <TvHubToolbarIconButton
            label="换源"
            onClick={() => void switchSourceAndPlay()}
          >
            <ReplaceIcon class="h-4 w-4" />
          </TvHubToolbarIconButton>
          <TvHubToolbarIconButton
            label={kept() ? '取消收藏' : '收藏'}
            pressed={kept()}
            onClick={() => {
              void toggleKeepCurrent().then(async () => {
                const vod = state.vod;
                const siteKey = hub.siteKey;
                if (!vod || !siteKey) return;
                const key = `${siteKey}$${vod.vod_id}`;
                const list = await TvDao.listKeep();
                setKept(list.some((k) => k.key === key));
              });
            }}
          >
            <StarIcon
              class={cn(
                'h-4 w-4',
                kept() ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground',
              )}
            />
          </TvHubToolbarIconButton>
        </>
      }
    >
      <div class={cn('flex flex-col gap-4 py-3', tvHubPageContentInsetClass)}>
        <Show when={showSkeleton()}>
          <TvDetailSkeleton />
        </Show>
        <Show when={!showSkeleton() && state.error}>
          <p class="text-sm text-muted-foreground">{state.error}</p>
        </Show>
        <Show when={!showSkeleton() && state.vod}>
          {(vod) => (
            <>
              <div class="flex gap-4">
                <div class="h-40 w-28 shrink-0 overflow-hidden rounded-md bg-muted">
                  <Show when={vod().vod_pic}>
                    <img src={vod().vod_pic} alt="" class="h-full w-full object-cover" />
                  </Show>
                </div>
                <div class="min-w-0 flex-1 space-y-2 text-sm">
                  <p class="text-muted-foreground line-clamp-4">{vod().vod_content}</p>
                  <Show when={vod().vod_actor}>
                    <p>演员：{vod().vod_actor}</p>
                  </Show>
                  <Show when={vod().vod_director}>
                    <p>导演：{vod().vod_director}</p>
                  </Show>
                </div>
              </div>
              <Show when={state.flags.length > 0}>
                <div class="space-y-2">
                  <p class="text-xs font-medium text-muted-foreground">线路</p>
                  <AppTabs
                    value={String(state.flagIndex)}
                    onChange={(value) => selectFlag(Number(value))}
                    items={flagTabItems()}
                    ariaLabel="播放线路"
                    variant="drawer-inline"
                    layout="inline"
                  />
                </div>
              </Show>
              <Show when={(flag()?.episodes.length ?? 0) > 0}>
                <div class="space-y-2">
                  <p class="text-xs font-medium text-muted-foreground">选集</p>
                  <div class="flex flex-wrap gap-2">
                    <For each={flag()?.episodes ?? []}>
                      {(ep, i) => (
                        <button
                          type="button"
                          class={episodeBtnClass(state.episodeIndex === i())}
                          onClick={() => {
                            selectEpisode(i());
                            void playCurrentEpisode();
                          }}
                        >
                          {ep.name}
                        </button>
                      )}
                    </For>
                  </div>
                </div>
              </Show>
            </>
          )}
        </Show>
      </div>
    </TvHubPageShell>
  );
}
