/**
 * 音乐设置内容区（分类侧栏 + 设置路由）
 */

import { createSignal, For } from 'solid-js';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { MusicSettingsRouter, type MusicSettingsSection } from '@/components/viewer/audio/music/settings/MusicSettingsRouter';
import { cn } from '@/lib/utils';

const SETTINGS_SECTIONS: { id: MusicSettingsSection; label: string }[] = [
  { id: 'basic', label: '基本' },
  { id: 'play', label: '播放' },
  { id: 'search', label: '搜索' },
  { id: 'list', label: '列表' },
  { id: 'download', label: '下载' },
  { id: 'sync', label: '同步' },
  { id: 'network', label: '网络' },
  { id: 'backup', label: '备份' },
  { id: 'other', label: '其他' },
];

function settingsNavButtonClass(active: boolean) {
  return cn(
    'mb-1 h-auto w-full justify-start rounded-lg px-3 py-2 text-left text-sm transition-colors',
    active
      ? 'border-l-primary bg-primary/10! text-primary! font-medium shadow-sm'
      : 'border-l-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground',
  );
}

export function MusicSettingsPanel() {
  const [settingsSection, setSettingsSection] = createSignal<MusicSettingsSection>('basic');

  return (
    <div class="flex min-h-0 flex-1 overflow-hidden">
      <nav class="w-28 shrink-0 overflow-y-auto border-r border-border/60 p-2 md:w-36">
        <SidebarGroup class="p-0">
          <SidebarGroupContent class="p-0">
            <SidebarMenu>
              <For each={SETTINGS_SECTIONS}>
                {(section) => (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={settingsSection() === section.id}
                      onClick={() => setSettingsSection(section.id)}
                      class={settingsNavButtonClass(settingsSection() === section.id)}
                    >
                      {section.label}
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
