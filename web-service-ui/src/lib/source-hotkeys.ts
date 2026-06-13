export interface SourceHotkeyAction {
  id: string;
  name: string;
  hotKeys: string[];
}

export const SOURCE_HOTKEY_ACTIONS: SourceHotkeyAction[] = [
  { id: 'save', name: '保存源', hotKeys: ['ctrl', 's'] },
  { id: 'undo', name: '撤销', hotKeys: ['ctrl', 'z'] },
  { id: 'redo', name: '重做', hotKeys: ['ctrl', 'y'] },
  { id: 'debug', name: '调试源', hotKeys: ['ctrl', 'd'] },
  { id: 'export', name: '导出源', hotKeys: ['ctrl', 'e'] },
  { id: 'qr', name: '二维码分享', hotKeys: ['ctrl', 'q'] },
  { id: 'json', name: 'JSON 编辑', hotKeys: ['ctrl', 'j'] },
];

const STORAGE_KEY = 'reader_web_source_hotkeys';

export function loadSourceHotkeys(): SourceHotkeyAction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return SOURCE_HOTKEY_ACTIONS.map((a) => ({ ...a }));
    const parsed = JSON.parse(raw) as { id: string; hotKeys: string[] }[];
    return SOURCE_HOTKEY_ACTIONS.map((action) => {
      const saved = parsed.find((p) => p.id === action.id);
      return saved ? { ...action, hotKeys: saved.hotKeys } : { ...action };
    });
  } catch {
    return SOURCE_HOTKEY_ACTIONS.map((a) => ({ ...a }));
  }
}

export function saveSourceHotkeys(actions: SourceHotkeyAction[]): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(actions.map((a) => ({ id: a.id, hotKeys: a.hotKeys }))),
  );
}

function normalizeKey(key: string): string {
  const k = key.toLowerCase();
  if (k === 'control') return 'ctrl';
  if (k === ' ') return 'space';
  return k;
}

export function matchHotkey(event: KeyboardEvent, hotKeys: string[]): boolean {
  if (!hotKeys.length) return false;
  const pressed = new Set<string>();
  if (event.ctrlKey || event.metaKey) pressed.add('ctrl');
  if (event.altKey) pressed.add('alt');
  if (event.shiftKey) pressed.add('shift');
  pressed.add(normalizeKey(event.key));
  const required = new Set(hotKeys.map(normalizeKey));
  if (pressed.size !== required.size) return false;
  for (const k of required) {
    if (!pressed.has(k)) return false;
  }
  return true;
}

export function formatHotkeyLabel(hotKeys: string[]): string {
  if (!hotKeys.length) return '未设置';
  return hotKeys
    .map((k) => {
      if (k === 'ctrl') return 'Ctrl';
      if (k === 'alt') return 'Alt';
      if (k === 'shift') return 'Shift';
      return k.length === 1 ? k.toUpperCase() : k;
    })
    .join(' + ');
}
