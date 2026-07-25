/**
 * 歌手 / 专辑发现页工具栏：来源选择 + 更多（滚动/分页加载）
 */

import { createSignal, type Component } from 'solid-js';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuIconTrigger,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import {
  AppSelect,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import { ViewerAppSelectContent } from '@/components/media/viewer/viewer-app-overlay';
import { MoreIcon } from '@/components/shared/icons';
import { cn } from '@/lib/utils';
import type { AudioTrackSource } from '@/lib/media/audio/track-types';
import {
  hubBrowseSourceLabel,
  type HubBrowseSource,
} from '@/lib/media/audio/online/mf-plugin/hub-browse-sources';
import {
  getMusicDiscoverPaginationPreference,
  setMusicDiscoverPaginationPreference,
  type MusicDiscoverKind,
} from '@/stores/music-hub/music-discover-ui';

function MenuRadioIndicator(props: { selected: boolean }) {
  return (
    <span
      class={cn(
        'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border',
        props.selected ? 'border-primary' : 'border-muted-foreground/40',
      )}
      aria-hidden
    >
      <span
        class={cn('h-1.5 w-1.5 rounded-full', props.selected ? 'bg-primary' : 'bg-transparent')}
      />
    </span>
  );
}

export const DISCOVER_LIST_SOURCES: HubBrowseSource[] = ['wy', 'kg'];

export interface MusicDiscoverListToolbarProps {
  kind: MusicDiscoverKind;
  source: AudioTrackSource;
  onSourceChange: (source: AudioTrackSource) => void;
  onPaginationModeChange?: () => void;
}

export const MusicDiscoverListToolbar: Component<MusicDiscoverListToolbarProps> = (props) => {
  const [moreMenuOpen, setMoreMenuOpen] = createSignal(false);
  const preference = () => getMusicDiscoverPaginationPreference(props.kind);

  return (
    <>
      <AppSelect
        value={props.source}
        onChange={(value) => {
          if (value != null) props.onSourceChange(value as AudioTrackSource);
        }}
        options={DISCOVER_LIST_SOURCES}
        itemComponent={(itemProps) => (
          <AppSelectItem item={itemProps.item}>
            {hubBrowseSourceLabel(itemProps.item.rawValue as HubBrowseSource)}
          </AppSelectItem>
        )}
      >
        <AppSelectTrigger
          layout="compact"
          class="h-9 w-22 sm:w-24"
          aria-label={props.kind === 'singer' ? '歌手来源' : '专辑来源'}
        >
          <AppSelectValue>
            {(selectState) => {
              const raw = selectState.selectedOption();
              return raw != null ? hubBrowseSourceLabel(raw as HubBrowseSource) : '';
            }}
          </AppSelectValue>
          <AppSelectIcon />
        </AppSelectTrigger>
        <ViewerAppSelectContent>
          <AppSelectListbox />
        </ViewerAppSelectContent>
      </AppSelect>

      <AppDropdownMenu open={moreMenuOpen()} onOpenChange={setMoreMenuOpen}>
        <AppTooltip>
          <AppTooltipTrigger as="div">
            <AppDropdownMenuTrigger
              as={(triggerProps: Record<string, unknown>) => (
                <AppDropdownMenuIconTrigger triggerProps={triggerProps}>
                  <MoreIcon class="h-4 w-4" />
                  <span class="sr-only">更多</span>
                </AppDropdownMenuIconTrigger>
              )}
            />
          </AppTooltipTrigger>
          <AppTooltipContent>更多</AppTooltipContent>
        </AppTooltip>
        <AppDropdownMenuContent layout="compact">
          <AppDropdownMenuItem class="pointer-events-none text-xs text-muted-foreground">
            列表分页方式
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => {
              setMusicDiscoverPaginationPreference(props.kind, 'scroll');
              props.onPaginationModeChange?.();
            }}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={preference() === 'scroll'} />
            <span>滚动加载</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => {
              setMusicDiscoverPaginationPreference(props.kind, 'pagination');
              props.onPaginationModeChange?.();
            }}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={preference() === 'pagination'} />
            <span>分页加载</span>
          </AppDropdownMenuItem>
        </AppDropdownMenuContent>
      </AppDropdownMenu>
    </>
  );
};
