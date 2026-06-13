import { createEffect, createSignal, For, Show } from 'solid-js';
import { Card, Button } from '@/components/Layout';
import {
  formatHotkeyLabel,
  type SourceHotkeyAction,
} from '@/lib/source-hotkeys';

interface SourceHotkeysDialogProps {
  open: boolean;
  actions: SourceHotkeyAction[];
  onSave: (actions: SourceHotkeyAction[]) => void;
  onClose: () => void;
}

export function SourceHotkeysDialog(props: SourceHotkeysDialogProps) {
  const [draft, setDraft] = createSignal<SourceHotkeyAction[]>([]);
  const [recordingId, setRecordingId] = createSignal('');

  createEffect(() => {
    if (props.open) setDraft(props.actions.map((a) => ({ ...a })));
  });

  const startRecord = (id: string) => {
    setRecordingId(id);
    setDraft((list) => list.map((a) => (a.id === id ? { ...a, hotKeys: [] } : a)));
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    const id = recordingId();
    if (!id) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      setRecordingId('');
      return;
    }
    const keys: string[] = [];
    if (e.ctrlKey || e.metaKey) keys.push('ctrl');
    if (e.altKey) keys.push('alt');
    if (e.shiftKey) keys.push('shift');
    const main = e.key.toLowerCase();
    if (!['control', 'alt', 'shift', 'meta'].includes(main)) keys.push(main);
    if (keys.length) {
      setDraft((list) => list.map((a) => (a.id === id ? { ...a, hotKeys: keys } : a)));
      setRecordingId('');
    }
  };

  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onKeyDown={handleKeyDown}
        tabIndex={-1}
        ref={(el) => el?.focus()}
      >
        <Card class="flex max-h-[90vh] w-full max-w-lg flex-col gap-3">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold">快捷键设置</h2>
            <Show when={recordingId()}>
              <span class="text-sm text-primary">录入中… 按 Esc 取消</span>
            </Show>
          </div>
          <ul class="max-h-[60vh] space-y-2 overflow-y-auto text-sm">
            <For each={draft()}>
              {(action) => (
                <li class="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                  <span>{action.name}</span>
                  <kbd class="rounded bg-muted px-2 py-0.5 font-mono text-xs">
                    {formatHotkeyLabel(action.hotKeys)}
                  </kbd>
                  <Button
                    variant="ghost"
                    class="px-2! py-1! text-xs"
                    disabled={Boolean(recordingId())}
                    onClick={() => startRecord(action.id)}
                  >
                    编辑
                  </Button>
                </li>
              )}
            </For>
          </ul>
          <div class="flex justify-end gap-2">
            <Button variant="ghost" onClick={props.onClose}>
              取消
            </Button>
            <Button
              onClick={() => {
                props.onSave(draft());
                props.onClose();
              }}
            >
              保存
            </Button>
          </div>
        </Card>
      </div>
    </Show>
  );
}
