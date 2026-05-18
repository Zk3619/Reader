/**
 * 统一页面头部组件
 * 用于替代各页面独立的导航栏，保持设计一致性
 * 
 * 设计原则：
 * - 与阅读器导航栏保持一致的设计风格
 * - 提供灵活的配置选项
 * - 支持返回按钮、标题、副标题、操作按钮、主题切换、窗口控制等
 */

import { Show, For, createSignal, onMount, onCleanup, type Component, type JSX } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { WindowControlButtons } from '@/components/WindowControlButtons';
import { withBlurBefore, blurActiveElement } from '@/utils/accessibility';
import { cn } from '@/lib/utils';
import { ChevronLeftIcon, ThemeLightIcon, ThemeDarkIcon } from '@/components/icons';
import { isTauri, isMobile } from '@/lib/platform/detect';

export interface PageHeaderAction {
  /** 图标组件 */
  icon: Component<{ class?: string }>;
  /** 标签文本（用于 tooltip 和 aria-label） */
  label: string;
  /** 点击回调 */
  onClick?: () => void;
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否显示 tooltip */
  showTooltip?: boolean;
  /** 图标自定义类名（用于动画等） */
  iconClass?: string;
  /** 是否为下拉菜单（如果为 true，则使用 dropdownItems 而不是 onClick） */
  isDropdown?: boolean;
  /** 下拉菜单项列表 */
  dropdownItems?: PageHeaderDropdownItem[];
}

export interface PageHeaderDropdownItem {
  /** 图标组件（可选） */
  icon?: Component<{ class?: string }>;
  /** 标签文本 */
  label: string;
  /** 点击回调 */
  onClick: () => void;
  /** 是否为分隔符 */
  separator?: boolean;
}

export interface PageHeaderProps {
  /** 返回按钮回调（不提供则不显示返回按钮） */
  onBack?: () => void;
  /** 主标题 */
  title: string;
  /** 副标题（可选） */
  subtitle?: string;
  /** 操作按钮列表（显示在右侧） */
  actions?: PageHeaderAction[];
  /** 是否显示主题切换按钮（默认 true，阅读器页面除外） */
  showThemeToggle?: boolean;
  /** 是否显示窗口控制按钮（默认 true，阅读器页面除外） */
  showWindowControls?: boolean;
  /** 自定义类名 */
  class?: string;
  /** 是否固定在顶部（默认 false，跟随内容滚动） */
  sticky?: boolean;
  /** 是否支持拖拽（用于 Tauri 窗口，默认 false） */
  draggable?: boolean;
}

/**
 * 统一页面头部组件
 * 
 * 使用示例：
 * ```tsx
 * <PageHeader
 *   onBack={() => navigateBack()}
 *   title="发现"
 *   subtitle="笔趣阁 · 玄幻"
 *   actions={[
 *     {
 *       icon: RefreshIcon,
 *       label: "刷新",
 *       onClick: () => refresh(),
 *       disabled: loading(),
 *     },
 *     {
 *       icon: MoreIcon,
 *       label: "更多",
 *       onClick: () => setShowDialog(true),
 *     },
 *   ]}
 * />
 * ```
 */
// 下拉菜单按钮组件（独立组件以避免在循环中创建 signal）
function DropdownActionButton(props: {
  action: PageHeaderAction;
  iconElement: JSX.Element;
}) {
  const [dropdownOpen, setDropdownOpen] = createSignal(false);
  
  const handleItemSelect = (item: PageHeaderDropdownItem) => {
    setDropdownOpen(false);
    blurActiveElement();
    item.onClick();
  };
  
  return (
    <DropdownMenu open={dropdownOpen()} onOpenChange={setDropdownOpen}>
      <Tooltip>
        <TooltipTrigger as="div">
          <DropdownMenuTrigger
            as={(triggerProps: any) => (
              <Button
                variant="ghost"
                size="icon"
                class="h-9 w-9"
                disabled={props.action.disabled}
                onClick={withBlurBefore(triggerProps.onClick)}
                aria-label={props.action.label}
                {...triggerProps}
              >
                {props.iconElement}
                <span class="sr-only">{props.action.label}</span>
              </Button>
            )}
          />
        </TooltipTrigger>
        <TooltipContent>{props.action.label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent class="min-w-0 w-auto">
        <For each={props.action.dropdownItems}>
          {(item) => (
            <>
              <Show when={item.separator}>
                <DropdownMenuSeparator />
              </Show>
                <DropdownMenuItem onSelect={() => handleItemSelect(item)}>
                  {(() => {
                    if (item.icon) {
                      const Icon = item.icon;
                      return <Icon class="h-4 w-4" />;
                    }
                    return null;
                  })()}
                  <span>{item.label}</span>
                </DropdownMenuItem>
            </>
          )}
        </For>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PageHeader(props: PageHeaderProps) {
  const [isDark, setIsDark] = createSignal(document.documentElement.classList.contains('dark'));

  // 检测主题变化
  onMount(() => {
    const checkTheme = () => setIsDark(document.documentElement.classList.contains('dark'));
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    onCleanup(() => observer.disconnect());
  });

  const toggleTheme = (pressed: boolean) => {
    setIsDark(pressed);
    document.documentElement.classList.toggle('dark', pressed);
  };

  const showThemeToggle = props.showThemeToggle !== false;
  const showWindowControls = props.showWindowControls !== false;

  return (
    <header
      class={cn(
        'flex h-14 shrink-0 items-center gap-3 border-b border-border/50 bg-background/95 px-4 backdrop-blur',
        'safe-area-inset-top',
        props.sticky && 'sticky top-0 z-10',
        props.class
      )}
      data-tauri-drag-region={props.draggable}
    >
      {/* 返回按钮 */}
      <Show when={props.onBack}>
        <Button
          variant="ghost"
          size="icon"
          onClick={props.onBack}
          aria-label="返回"
          class={cn(props.draggable && 'no-drag')}
        >
          <ChevronLeftIcon class="h-5 w-5" size={20} />
        </Button>
      </Show>

      {/* 标题区域 - 左右布局 */}
      <div class="min-w-0 flex-1 flex items-center gap-3" data-tauri-drag-region={props.draggable}>
        <h1 class="truncate text-lg font-semibold text-foreground">{props.title}</h1>
        <Show when={props.subtitle}>
          <span class="text-sm text-muted-foreground">·</span>
          <p class="truncate text-sm text-muted-foreground">{props.subtitle}</p>
        </Show>
      </div>

      {/* 操作按钮区域 */}
      <Show when={props.actions && props.actions.length > 0}>
        <div class={cn('flex items-center gap-1', props.draggable && 'no-drag')}>
          <For each={props.actions}>
            {(action) => {
              const iconElement = <action.icon class={cn('h-5 w-5', action.iconClass)} />;

              // 下拉菜单按钮
              if (action.isDropdown && action.dropdownItems) {
                return <DropdownActionButton action={action} iconElement={iconElement} />;
              }

              // 普通按钮
              return (
                <Show
                  when={action.showTooltip !== false}
                  fallback={
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={action.onClick}
                      disabled={action.disabled}
                      aria-label={action.label}
                    >
                      {iconElement}
                    </Button>
                  }
                >
                  <Tooltip>
                    <TooltipTrigger as={Button} variant="ghost" size="icon" onClick={action.onClick} disabled={action.disabled} aria-label={action.label}>
                      {iconElement}
                    </TooltipTrigger>
                    <TooltipContent>{action.label}</TooltipContent>
                  </Tooltip>
                </Show>
              );
            }}
          </For>
        </div>
      </Show>

      {/* 竖向分隔：仅桌面端（Tauri 且非移动端）且在左侧有操作按钮时显示 */}
      <Show when={(props.actions && props.actions.length > 0) && isTauri() && !isMobile()}>
        <Separator orientation="vertical" class={cn('mx-2 h-6', props.draggable && 'no-drag')} />
      </Show>
      {/* 主题切换与窗口控制 */}
      <Show when={showThemeToggle || showWindowControls}>
        <div class={cn('flex items-center gap-2', props.draggable && 'no-drag')}>
          <Show when={showThemeToggle}>
            <Tooltip>
              <TooltipTrigger as="div">
                <Toggle
                  pressed={isDark()}
                  onChange={toggleTheme}
                  variant="default"
                  size="default"
                  class="h-9 w-9 rounded-md hover:bg-muted transition-colors p-0"
                >
                  <Show
                    when={isDark()}
                    fallback={<ThemeLightIcon class="h-4 w-4" size={16} />}
                  >
                    <ThemeDarkIcon class="h-4 w-4" size={16} />
                  </Show>
                  <span class="sr-only">{isDark() ? "切换到浅色模式" : "切换到深色模式"}</span>
                </Toggle>
              </TooltipTrigger>
              <TooltipContent>{isDark() ? "切换到浅色模式" : "切换到深色模式"}</TooltipContent>
            </Tooltip>
          </Show>
          <Show when={showWindowControls}>
            <WindowControlButtons />
          </Show>
        </div>
      </Show>
    </header>
  );
}
