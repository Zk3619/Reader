/**
 * 替换净化规则页操作区：可展开搜索 + 更多
 */

import { createSignal, onMount } from 'solid-js';
import { blurActiveElement } from '@/utils/accessibility';
import { Button } from '@/components/ui/button';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuIconTrigger,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import { ExpandableIconSearch } from '@/components/shared/ExpandableIconSearch';
import {
  MoreIcon,
  SettingsIcon,
  FileTextIcon,
  FolderPlusIcon,
  LinkIcon,
  ScanQrCodeIcon,
  CodeIcon,
  ChevronLeftIcon,
} from '@/components/shared/icons';
import { ReplacePurifySettingsDialog } from '@/components/media/reader/replace-rules/ReplacePurifySettingsDialog';

export interface ReplaceRulesPageToolbarProps {
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  onNewRule?: () => void;
  onImportLocal?: () => void;
  onImportNetwork?: () => void;
  onImportQR?: () => void;
  onImportCode?: () => void;
}

export function ReplaceRulesToolbarLeading(props: { onBack: () => void }) {
  return (
    <AppTooltip>
      <AppTooltipTrigger
        as={Button}
        variant="ghost"
        size="icon"
        class="h-9 w-9 shrink-0"
        onClick={props.onBack}
        aria-label="返回"
        type="button"
      >
        <ChevronLeftIcon class="h-4 w-4" />
      </AppTooltipTrigger>
      <AppTooltipContent>返回</AppTooltipContent>
    </AppTooltip>
  );
}

export function ReplaceRulesPageToolbar(props: ReplaceRulesPageToolbarProps) {
  const [moreMenuOpen, setMoreMenuOpen] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);

  onMount(() => {
    const handleDialogOpened = () => {
      setMoreMenuOpen(false);
      blurActiveElement();
    };
    window.addEventListener('dialog-opened', handleDialogOpened);
    return () => window.removeEventListener('dialog-opened', handleDialogOpened);
  });

  return (
    <>
      <ExpandableIconSearch
        value={props.searchQuery ?? ''}
        onValueChange={(v) => props.onSearchQueryChange?.(v)}
        placeholder="替换规则-搜索"
        tooltip="搜索"
        aria-label="搜索替换规则"
      />

      <AppTooltip>
        <AppTooltipTrigger
          as={Button}
          variant="ghost"
          size="icon"
          class="h-9 w-9 shrink-0"
          onClick={() => setSettingsOpen(true)}
          aria-label="设置"
          type="button"
        >
          <SettingsIcon class="h-4 w-4" />
        </AppTooltipTrigger>
        <AppTooltipContent>设置</AppTooltipContent>
      </AppTooltip>

      <ReplacePurifySettingsDialog open={settingsOpen()} onOpenChange={setSettingsOpen} />

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
          <AppDropdownMenuItem onSelect={() => props.onNewRule?.()}>
            <FileTextIcon class="h-4 w-4" />
            <span>新建规则</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem onSelect={() => props.onImportLocal?.()}>
            <FolderPlusIcon class="h-4 w-4" />
            <span>本地导入</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem onSelect={() => props.onImportNetwork?.()}>
            <LinkIcon class="h-4 w-4" />
            <span>网络导入</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem onSelect={() => props.onImportQR?.()}>
            <ScanQrCodeIcon class="h-4 w-4" />
            <span>二维码导入</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem onSelect={() => props.onImportCode?.()}>
            <CodeIcon class="h-4 w-4" />
            <span>代码导入</span>
          </AppDropdownMenuItem>
        </AppDropdownMenuContent>
      </AppDropdownMenu>
    </>
  );
}
