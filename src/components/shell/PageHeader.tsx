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
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuIconTrigger,
  AppDropdownMenuItem,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { WindowControlButtons } from '@/components/shell/WindowControlButtons';
import { cn } from '@/lib/utils';
import { ChevronLeftIcon, ThemeLightIcon, ThemeDarkIcon } from '@/components/shared/icons';
import { isTauri, isMobile } from '@/lib/platform/detect';
import { createTauriWindowChromeDblClickHandler } from '@/lib/platform/tauri-window-chrome';

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
  /** 下拉菜单 Portal z-index（RSS/阅读器叠层内需高于 z-[110]） */
  dropdownPortalZClass?: string;
}

export interface PageHeaderDropdownItem {
  /** 图标组件（可选） */
  icon?: Component<{ class?: string }>;
  /** 标签文本 */
  label: string;
  /** 点击回调 */
  onClick?: () => void;
  /** 是否为分隔符（可与菜单项同存，在项前画线） */
  separator?: boolean;
  /** 仅渲染分隔线，不渲染菜单项 */
  separatorOnly?: boolean;
  /** 复选框项（与排序下拉等一致的勾选样式） */
  checkbox?: {
    checked: () => boolean;
    onChange: (checked: boolean) => void;
    closeOnSelect?: boolean;
  };
  /** 单选项（与订阅页更多菜单一致的圆形指示器） */
  radio?: {
    selected: () => boolean;
    onSelect: () => void;
  };
}

function MenuRadioIndicator(props: { selected: boolean }) {
  return (
    <span
      class="flex h-4 w-4 shrink-0 items-center justify-center pointer-events-none"
      aria-label={props.selected ? '已选' : '未选'}
    >
      <span class="relative flex size-4 items-center justify-center" aria-hidden>
        <span class="size-4 rounded-full border border-primary" />
        <Show when={props.selected}>
          <span class="absolute size-2 rounded-full bg-primary" />
        </Show>
      </span>
    </span>
  );
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
  /**
   * 固定在页面顶部、不参与内容区滚动。
   * 父级须为 `flex flex-col overflow-hidden`（如 `h-dvh`），内容区单独 `flex-1 min-h-0 overflow-y-auto scroll-gutter-stable-both`。
   */
  pinToTop?: boolean;
  /** 是否在滚动容器内吸顶（默认 false）；与 pinToTop 互斥，pinToTop 优先 */
  sticky?: boolean;
  /** 操作按钮与主题/窗口控制之间的自定义区域（如内嵌页「更多」菜单） */
  trailing?: JSX.Element;
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
  
  
  return (
    <AppDropdownMenu open={dropdownOpen()} onOpenChange={setDropdownOpen}>
      <Tooltip>
        <TooltipTrigger as="div">
          <AppDropdownMenuTrigger
            as={(triggerProps: Record<string, unknown>) => (
              <AppDropdownMenuIconTrigger
                triggerProps={triggerProps}
                disabled={props.action.disabled}
                aria-label={props.action.label}
              >
                {props.iconElement}
                <span class="sr-only">{props.action.label}</span>
              </AppDropdownMenuIconTrigger>
            )}
          />
        </TooltipTrigger>
        <TooltipContent>{props.action.label}</TooltipContent>
      </Tooltip>
      <AppDropdownMenuContent
        layout="compact"
        portalZClass={props.action.dropdownPortalZClass}
      >
        <For each={props.action.dropdownItems}>
          {(item) => (
            <>
              <Show when={item.separator || item.separatorOnly}>
                <AppDropdownMenuSeparator />
              </Show>
              <Show when={!item.separatorOnly}>
              <Show
                when={item.radio}
                fallback={
                  <Show
                    when={item.checkbox}
                    fallback={
                      <AppDropdownMenuItem onSelect={() => item.onClick?.()}>
                        {(() => {
                          if (item.icon) {
                            const Icon = item.icon;
                            return <Icon class="h-4 w-4" />;
                          }
                          return null;
                        })()}
                        <span>{item.label}</span>
                      </AppDropdownMenuItem>
                    }
                  >
                    {(checkbox) => (
                      <AppDropdownMenuItem
                        onSelect={() => checkbox().onChange(!checkbox().checked())}
                        class="flex items-center gap-2"
                      >
                        <span class="flex h-4 w-4 shrink-0 items-center justify-center pointer-events-none">
                          <Checkbox checked={checkbox().checked()} aria-label={item.label} />
                        </span>
                        <span>{item.label}</span>
                      </AppDropdownMenuItem>
                    )}
                  </Show>
                }
              >
                {(radio) => (
                  <AppDropdownMenuItem
                    onSelect={() => radio().onSelect()}
                    class="flex items-center gap-2"
                  >
                    <MenuRadioIndicator selected={radio().selected()} />
                    <span>{item.label}</span>
                  </AppDropdownMenuItem>
                )}
              </Show>
              </Show>
            </>
          )}
        </For>
      </AppDropdownMenuContent>
    </AppDropdownMenu>
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
  const pinToTop = props.pinToTop === true;
  const onTauriWindowChromeDblClick = createTauriWindowChromeDblClickHandler();

  return (
    <header
      class={cn(
        'flex shrink-0 flex-col border-b border-border/50 bg-background/95 backdrop-blur safe-area-inset-top',
        pinToTop && 'z-20',
        !pinToTop && props.sticky && 'sticky top-0 z-10',
        props.class
      )}
      data-page-header
      data-tauri-drag-region={props.draggable}
      onDblClick={props.draggable ? onTauriWindowChromeDblClick : undefined}
    >
      <div class="flex h-14 items-center gap-3 px-4">
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

      <Show when={props.trailing}>
        <div class={cn('flex shrink-0 items-center', props.draggable && 'no-drag')}>
          {props.trailing}
        </div>
      </Show>

      {/* 竖向分隔：仅桌面端（Tauri 且非移动端）且在左侧有操作按钮时显示 */}
      <Show
        when={
          ((props.actions && props.actions.length > 0) || props.trailing) &&
          (showThemeToggle || showWindowControls) &&
          isTauri() &&
          !isMobile()
        }
      >
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
      </div>
    </header>
  );
}
