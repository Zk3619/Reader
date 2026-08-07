/**
 * 共享输入框右键菜单：剪切、复制、粘贴、全选、删除。
 * 包裹 input / textarea（或其容器）；打开时快照选区，避免菜单聚焦导致选区丢失。
 */

import { createSignal, type JSX, type ParentComponent } from 'solid-js';
import {
  AppContextMenu,
  AppContextMenuContent,
  AppContextMenuItem,
  AppContextMenuSeparator,
  AppContextMenuShortcut,
  AppContextMenuTrigger,
} from '@/components/shared/AppContextMenu';
import { isMacOS } from '@/lib/platform/detect';
import {
  findTextInputEditable,
  hasTextSelection,
  isTextInputEditable,
  replaceTextInputSelection,
  selectAllTextInput,
  selectedTextFromSnapshot,
  snapshotTextInputSelection,
  type TextInputSelectionSnapshot,
} from '@/lib/ui/text-input-edit';
import { cn } from '@/lib/utils';

export type AppTextInputContextMenuProps = {
  class?: string;
  /** Trigger 容器 class；默认撑满表单行 */
  triggerClass?: string;
  /** 强制禁用编辑类菜单项（剪切 / 粘贴 / 删除） */
  disabled?: boolean;
  children: JSX.Element;
};

const modLabel = () => (isMacOS() ? '⌘' : 'Ctrl+');

export const AppTextInputContextMenu: ParentComponent<AppTextInputContextMenuProps> = (props) => {
  let triggerEl: HTMLDivElement | undefined;
  const [snap, setSnap] = createSignal<TextInputSelectionSnapshot | null>(null);

  const capture = () => {
    const fromTrigger = findTextInputEditable(triggerEl);
    const fromFocus = isTextInputEditable(document.activeElement)
      ? document.activeElement
      : null;
    setSnap(snapshotTextInputSelection(fromTrigger ?? fromFocus));
  };

  const editable = () => {
    const s = snap();
    if (props.disabled) return false;
    if (!s) return false;
    return !s.disabled && !s.readOnly;
  };

  const canCutOrDelete = () => editable() && hasTextSelection(snap());
  const canCopy = () => hasTextSelection(snap()) && !snap()?.disabled;
  const canPaste = () => editable();
  const canSelectAll = () => {
    const s = snap();
    return !!s && !s.disabled && s.value.length > 0;
  };

  const runCut = async () => {
    const s = snap();
    if (!s || !canCutOrDelete()) return;
    const text = selectedTextFromSnapshot(s);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    replaceTextInputSelection(s, '', 'deleteByCut');
  };

  const runCopy = async () => {
    const s = snap();
    if (!s || !canCopy()) return;
    try {
      await navigator.clipboard.writeText(selectedTextFromSnapshot(s));
    } catch {
      /* ignore */
    }
  };

  const runPaste = async () => {
    const s = snap();
    if (!s || !canPaste()) return;
    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch {
      return;
    }
    replaceTextInputSelection(s, text, 'insertFromPaste');
  };

  const runSelectAll = () => {
    const s = snap();
    if (!s || !canSelectAll()) return;
    selectAllTextInput(s.el);
  };

  const runDelete = () => {
    const s = snap();
    if (!s || !canCutOrDelete()) return;
    replaceTextInputSelection(s, '', 'deleteContent');
  };

  return (
    <AppContextMenu
      disableAccessibilityAnnounce
      onOpenChange={(open) => {
        if (open) capture();
        else setSnap(null);
      }}
    >
      <AppContextMenuTrigger
        as="div"
        ref={(el: HTMLDivElement) => {
          triggerEl = el;
        }}
        class={cn('w-full min-w-0', props.triggerClass, props.class)}
        onContextMenu={(e: MouseEvent) => {
          e.stopPropagation();
          capture();
        }}
      >
        {props.children}
      </AppContextMenuTrigger>
      <AppContextMenuContent layout="compact" class="min-w-40">
        <AppContextMenuItem
          disabled={!canCutOrDelete()}
          onSelect={() => {
            void runCut();
          }}
        >
          剪切
          <AppContextMenuShortcut>{modLabel()}X</AppContextMenuShortcut>
        </AppContextMenuItem>
        <AppContextMenuItem
          disabled={!canCopy()}
          onSelect={() => {
            void runCopy();
          }}
        >
          复制
          <AppContextMenuShortcut>{modLabel()}C</AppContextMenuShortcut>
        </AppContextMenuItem>
        <AppContextMenuItem
          disabled={!canPaste()}
          onSelect={() => {
            void runPaste();
          }}
        >
          粘贴
          <AppContextMenuShortcut>{modLabel()}V</AppContextMenuShortcut>
        </AppContextMenuItem>
        <AppContextMenuSeparator />
        <AppContextMenuItem disabled={!canSelectAll()} onSelect={runSelectAll}>
          全选
          <AppContextMenuShortcut>{modLabel()}A</AppContextMenuShortcut>
        </AppContextMenuItem>
        <AppContextMenuItem disabled={!canCutOrDelete()} onSelect={runDelete}>
          删除
          <AppContextMenuShortcut>Del</AppContextMenuShortcut>
        </AppContextMenuItem>
      </AppContextMenuContent>
    </AppContextMenu>
  );
};
