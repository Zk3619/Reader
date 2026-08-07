/**
 * 文本框选区读写：供输入框右键菜单等在失焦后仍能改值并触发受控 onInput。
 */

export type TextInputEditable = HTMLInputElement | HTMLTextAreaElement;

const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

export function isTextInputEditable(el: Element | null | undefined): el is TextInputEditable {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (!(el instanceof HTMLInputElement)) return false;
  const type = (el.type || 'text').toLowerCase();
  return !NON_TEXT_INPUT_TYPES.has(type);
}

export function findTextInputEditable(root: ParentNode | null | undefined): TextInputEditable | null {
  if (!root) return null;
  if (isTextInputEditable(root as Element)) return root as TextInputEditable;
  if (!(root instanceof Element) && !(root instanceof DocumentFragment)) return null;
  const candidates = root.querySelectorAll('input, textarea');
  for (const el of candidates) {
    if (isTextInputEditable(el)) return el;
  }
  return null;
}

export type TextInputSelectionSnapshot = {
  el: TextInputEditable;
  value: string;
  start: number;
  end: number;
  disabled: boolean;
  readOnly: boolean;
};

export function snapshotTextInputSelection(
  el: TextInputEditable | null | undefined,
): TextInputSelectionSnapshot | null {
  if (!el || !isTextInputEditable(el)) return null;
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  return {
    el,
    value: el.value,
    start: Math.min(start, end),
    end: Math.max(start, end),
    disabled: el.disabled,
    readOnly: el.readOnly,
  };
}

function setNativeValue(el: TextInputEditable, value: string, inputType: string, data: string | null) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  descriptor?.set?.call(el, value);
  el.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType,
      data,
    }),
  );
}

export function replaceTextInputSelection(
  snap: TextInputSelectionSnapshot,
  replacement: string,
  inputType: string,
): void {
  const { el, value, start, end } = snap;
  const next = value.slice(0, start) + replacement + value.slice(end);
  const data =
    inputType === 'insertFromPaste' || inputType === 'insertText' ? replacement : null;
  setNativeValue(el, next, inputType, data);
  const caret = start + replacement.length;
  try {
    el.focus({ preventScroll: true });
    el.setSelectionRange(caret, caret);
  } catch {
    /* type=number 等部分控件可能不支持 setSelectionRange */
  }
}

export function selectAllTextInput(el: TextInputEditable): void {
  try {
    el.focus({ preventScroll: true });
    el.setSelectionRange(0, el.value.length);
  } catch {
    el.select?.();
  }
}

export function selectedTextFromSnapshot(snap: TextInputSelectionSnapshot): string {
  return snap.value.slice(snap.start, snap.end);
}

export function hasTextSelection(snap: TextInputSelectionSnapshot | null | undefined): boolean {
  return !!snap && snap.end > snap.start;
}
