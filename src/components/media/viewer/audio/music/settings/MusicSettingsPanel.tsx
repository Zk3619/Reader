/**
 * 音乐设置内容区（分类侧栏 + 设置路由）
 */

import { createSignal, For } from 'solid-js';
import { ChevronRight } from 'lucide-solid';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { MusicSettingsRouter } from '@/components/media/viewer/audio/music/settings/MusicSettingsRouter';
import {
  MUSIC_SETTINGS_SECTIONS,
  type MusicSettingsSection,
} from '@/components/media/viewer/audio/music/settings/music-settings-sections';
import { musicHubPageContentInsetClass } from '@/lib/media/audio/music-hub-section-meta';
import { settingsStore } from '@/stores/settings';
import { cn } from '@/lib/utils';

function settingsNavButtonClass(active: boolean) {
  return cn(
    'h-9 w-full min-w-0 justify-start rounded-md px-2.5 text-left text-[13px] font-normal',
    'transition-[color,background-color] duration-300 ease-out',
    active
      ? 'bg-primary/10! font-medium text-primary!'
      : 'text-foreground hover:bg-primary/10! hover:text-foreground!',
  );
}

function SettingsActiveIndicator(props: { active: boolean }) {
  const reduceMotion = () => settingsStore.state.app.reduceMotion;
  return (
    <span
      class={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden',
        reduceMotion() ? '' : 'transition-[width,opacity] duration-130 ease-out',
        props.active ? 'mr-0.5 w-[0.9em] opacity-100' : 'w-0 opacity-0',
      )}
      aria-hidden="true"
    >
      <ChevronRight class="h-[0.9em] w-[0.9em] shrink-0" />
    </span>
  );
}

export function MusicSettingsPanel() {
  const [settingsSection, setSettingsSection] = createSignal<MusicSettingsSection>('theme');

  return (
    <div class={cn('flex min-h-0 flex-1 overflow-hidden', musicHubPageContentInsetClass)}>
      <nav class="w-44 shrink-0 overflow-y-auto border-r border-border/60 p-2 md:w-52">
        <SidebarGroup class="p-0">
          <SidebarGroupContent class="p-0">
            <SidebarMenu class="gap-0.5">
              <For each={MUSIC_SETTINGS_SECTIONS}>
                {(section) => (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={settingsSection() === section.id}
                      onClick={() => setSettingsSection(section.id)}
                      class={settingsNavButtonClass(settingsSection() === section.id)}
                    >
                      <SettingsActiveIndicator active={settingsSection() === section.id} />
                      <span class="min-w-0 flex-1 truncate">{section.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </For>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </nav>
      <div class="min-h-0 flex-1 overflow-y-auto">
        <MusicSettingsRouter section={settingsSection()} />
      </div>
    </div>
  );
}
