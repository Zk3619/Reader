/**
 * TXT 目录规则页操作区：可展开搜索 + 更多（对齐书源管理页）
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
  FileTextIcon,
  FolderPlusIcon,
  LinkIcon,
  ScanQrCodeIcon,
  CodeIcon,
  ChevronLeftIcon,
} from '@/components/shared/icons';

export interface TxtTocRulesPageToolbarProps {
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  onNewRule?: () => void;
  onImportLocal?: () => void;
  onImportNetwork?: () => void;
  onImportQR?: () => void;
  onImportCode?: () => void;
  onImportDefault?: () => void;
  onBatchReparse?: () => void;
}

export function TxtTocRulesToolbarLeading(props: { onBack: () => void }) {
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

export function TxtTocRulesPageToolbar(props: TxtTocRulesPageToolbarProps) {
  const [moreMenuOpen, setMoreMenuOpen] = createSignal(false);

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
        placeholder="TXT目录规则-搜索"
        tooltip="搜索"
        aria-label="搜索 TXT 目录规则"
      />

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
          <AppDropdownMenuItem onSelect={() => props.onImportDefault?.()}>
            <FileTextIcon class="h-4 w-4" />
            <span>导入默认规则</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem onSelect={() => props.onBatchReparse?.()}>
            <FileTextIcon class="h-4 w-4" />
            <span>批量重解析书架</span>
          </AppDropdownMenuItem>
        </AppDropdownMenuContent>
      </AppDropdownMenu>
    </>
  );
}
