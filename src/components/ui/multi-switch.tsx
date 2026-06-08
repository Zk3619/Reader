import type { Component, JSX } from "solid-js";
import { createSignal, For, onCleanup, Show } from "solid-js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDownIcon } from "@/components/shared/icons";
import { cn } from "@/lib/utils";

const LONG_PRESS_MS = 500;

export interface MultiSwitchOption<T> {
  value: T;
  label: string;
  icon?: Component<{ class?: string }>;
}

export interface MultiSwitchProps<T> {
  options: MultiSwitchOption<T>[];
  /** 当前值，或返回当前值的 accessor（用于与 store 同步，避免循环显示滞后） */
  value: T | (() => T);
  onChange: (value: T) => void;
  class?: string;
  /** 按钮尺寸类，默认 h-9 w-9 */
  sizeClass?: string;
  /** 用于比较选项相等，默认用 value 引用相等 */
  equals?: (a: T, b: T) => boolean;
  children?: (option: MultiSwitchOption<T>) => JSX.Element;
  /**
   * 为 true 时渲染为「图标 + 文字 + 箭头」的下拉触发器，左键直接打开菜单；
   * 禁用长按、右键打开菜单，仅左键点击打开下拉。
   */
  dropdownTrigger?: boolean;
  /** 自定义下拉内容容器（阅读器内须用 ViewerAppDropdownMenuContent） */
  DropdownMenuContent?: Component<{ class?: string; children: JSX.Element }>;
}

function getValue<T>(value: T | (() => T)): T {
  return typeof value === "function" ? (value as () => T)() : value;
}

export function MultiSwitch<T>(props: MultiSwitchProps<T>) {
  const [menuOpen, setMenuOpen] = createSignal(false);
  const [longPressTimer, setLongPressTimer] = createSignal<ReturnType<typeof setTimeout> | null>(null);
  const equals = () => props.equals ?? ((a: T, b: T) => a === b);
  /** 当前值（支持 accessor，保证与 store 同步） */
  const currentValue = () => getValue(props.value);

  const currentIndex = () => {
    const v = currentValue();
    const i = props.options.findIndex((o) => equals()(o.value, v));
    return i >= 0 ? i : 0;
  };

  const cycleNext = () => {
    const idx = (currentIndex() + 1) % props.options.length;
    props.onChange(props.options[idx].value);
  };

  const openMenu = () => setMenuOpen(true);
  const isDropdownTrigger = () => props.dropdownTrigger === true;

  const handlePointerDown = () => {
    if (isDropdownTrigger()) return;
    const t = setTimeout(() => {
      openMenu();
      setLongPressTimer(null);
    }, LONG_PRESS_MS);
    setLongPressTimer(t);
  };

  const handlePointerUp = () => {
    if (isDropdownTrigger()) return;
    const t = longPressTimer();
    if (t) {
      clearTimeout(t);
      setLongPressTimer(null);
    }
  };

  const handlePointerCancel = () => {
    if (isDropdownTrigger()) return;
    const t = longPressTimer();
    if (t) {
      clearTimeout(t);
      setLongPressTimer(null);
    }
  };

  onCleanup(() => {
    const t = longPressTimer();
    if (t) clearTimeout(t);
  });

  const handleClick = (e: MouseEvent) => {
    if (isDropdownTrigger()) return;
    e.preventDefault();
    e.stopPropagation();
    cycleNext();
  };

  const handleContextMenu = (e: MouseEvent) => {
    if (isDropdownTrigger()) return;
    e.preventDefault();
    openMenu();
  };

  const currentOption = () => props.options[currentIndex()] ?? props.options[0];

  const menuItems = () => (
    <For each={props.options}>
      {(opt) => (
        <DropdownMenuItem
          onSelect={() => {
            props.onChange(opt.value);
            setMenuOpen(false);
          }}
          class={cn(
            "flex items-center gap-2",
            equals()(opt.value, currentValue()) && "bg-accent/50"
          )}
        >
          {opt.icon ? (() => {
            const Icon = opt.icon!;
            return <Icon class="h-4 w-4 shrink-0" />;
          })() : null}
          <span>{opt.label}</span>
        </DropdownMenuItem>
      )}
    </For>
  );

  const triggerButtonClass = () =>
    cn(
      "inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      isDropdownTrigger() ? "px-3 py-2 h-9 min-w-0" : props.sizeClass ?? "h-9 w-9"
    );

  const triggerContent = () =>
    props.children ? (
      props.children(currentOption())
    ) : isDropdownTrigger() ? (
      <>
        {(() => {
          const opt = currentOption();
          const Icon = opt?.icon;
          return Icon ? <Icon class="h-4 w-4 shrink-0" /> : null;
        })()}
        <span class="min-w-0 truncate">{currentOption()?.label ?? ""}</span>
        <ChevronDownIcon class="h-4 w-4 shrink-0 opacity-50" />
      </>
    ) : (
      (() => {
        const opt = currentOption();
        const Icon = opt?.icon;
        return Icon ? <Icon class="h-4 w-4" /> : <span class="text-xs">{opt?.label ?? ""}</span>;
      })()
    );

  return (
    <div class={cn("relative inline-flex", props.class)}>
      <DropdownMenu open={menuOpen()} onOpenChange={setMenuOpen}>
        {isDropdownTrigger() ? (
          <DropdownMenuTrigger as="button" type="button" class={triggerButtonClass()}>
            {triggerContent()}
          </DropdownMenuTrigger>
        ) : (
          <>
            <DropdownMenuTrigger
              as="span"
              class="absolute inset-0 pointer-events-none"
              aria-hidden
            />
            <Show
              when={menuOpen()}
              fallback={
                <button
                  type="button"
                  class={triggerButtonClass()}
                  onClick={handleClick}
                  onContextMenu={handleContextMenu}
                  onPointerDown={handlePointerDown}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerCancel}
                  onPointerCancel={handlePointerCancel}
                  aria-haspopup="menu"
                  aria-expanded="false"
                >
                  {triggerContent()}
                </button>
              }
            >
              <button
                type="button"
                class={triggerButtonClass()}
                onClick={handleClick}
                onContextMenu={handleContextMenu}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerCancel}
                onPointerCancel={handlePointerCancel}
                aria-haspopup="menu"
                aria-expanded="true"
              >
                {triggerContent()}
              </button>
            </Show>
          </>
        )}
        {props.DropdownMenuContent ? (
          <props.DropdownMenuContent class="min-w-0 w-auto">
            {menuItems()}
          </props.DropdownMenuContent>
        ) : (
          <DropdownMenuContent class="min-w-0 w-auto">
            {menuItems()}
          </DropdownMenuContent>
        )}
      </DropdownMenu>
    </div>
  );
}
