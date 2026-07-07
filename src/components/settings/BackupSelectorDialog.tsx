/**
 * 选择性备份/恢复项配置对话框
 */

import { createSignal, For, onMount, Show } from 'solid-js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  BACKUP_SELECTOR_GROUPS,
  BACKUP_SELECTOR_ITEMS,
  loadBackupSelectorMap,
  saveBackupSelectorMap,
  selectAllBackupItems,
  deselectAllBackupItems,
} from '@/lib/backup/backup-selector-config';

interface BackupSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function BackupSelectorDialog(props: BackupSelectorDialogProps) {
  const [selected, setSelected] = createSignal<Record<string, boolean>>({});
  const [saving, setSaving] = createSignal(false);

  onMount(() => {
    void loadBackupSelectorMap().then(setSelected);
  });

  const toggle = (key: string, checked: boolean) => {
    setSelected((prev) => ({ ...prev, [key]: checked }));
  };

  async function handleSave() {
    setSaving(true);
    try {
      await saveBackupSelectorMap(selected());
      props.onSaved?.();
      props.onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>选择性备份 / 恢复</DialogTitle>
          <DialogDescription>
            勾选需要包含在 ZIP 备份或从 ZIP 合并恢复的数据项（不含 reader.db 时可仅恢复 JSON）。
          </DialogDescription>
        </DialogHeader>

        <Show when={Object.keys(selected()).length > 0}>
          <div class="space-y-4 py-2">
            <For each={BACKUP_SELECTOR_GROUPS}>
              {(group) => (
                <div class="space-y-2">
                  <div class="text-xs font-semibold text-muted-foreground">{group}</div>
                  <For each={BACKUP_SELECTOR_ITEMS.filter((i) => i.group === group)}>
                    {(item) => (
                      <label class="flex cursor-pointer items-center gap-2 rounded-md border border-border/40 px-3 py-2 text-sm">
                        <Checkbox
                          checked={selected()[item.key] !== false}
                          onChange={(checked) => toggle(item.key, checked)}
                        />
                        <span class="flex-1">{item.title}</span>
                        <span class="text-xs text-muted-foreground">{item.fileName}</span>
                      </label>
                    )}
                  </For>
                </div>
              )}
            </For>
          </div>
        </Show>

        <DialogFooter class="flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void selectAllBackupItems().then(setSelected)}
          >
            全选
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void deselectAllBackupItems().then(setSelected)}
          >
            全不选
          </Button>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving()}>
            {saving() ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
