/**
 * 新建 / 编辑影视收藏自定义分组
 */

import { createEffect, createSignal } from 'solid-js';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { AppTextField, AppTextFieldInput } from '@/components/shared/AppTextField';
import type { TvVideoGroupRow } from '@/lib/media/tv/types';
import { appDialogSettingsShell } from '@/lib/ui/viewport-classes';

export interface TvKeepGroupFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 编辑时传入；新建为空 */
  group?: TvVideoGroupRow | null;
  title?: string;
  description?: string;
  onSubmit: (input: { groupName: string }) => void | Promise<void>;
}

export function TvKeepGroupFormDialog(props: TvKeepGroupFormDialogProps) {
  const [name, setName] = createSignal('');
  const [saving, setSaving] = createSignal(false);

  createEffect(() => {
    if (props.open) {
      setName(props.group?.groupName ?? '');
      setSaving(false);
    }
  });

  const title = () =>
    props.title ?? (props.group ? '编辑分组' : '新建分组');
  const description = () =>
    props.description ?? '用于整理收藏片单的自定义分组';

  async function handleSubmit() {
    const groupName = name().trim();
    if (!groupName || saving()) return;
    setSaving(true);
    try {
      await props.onSubmit({ groupName });
      props.onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent class={appDialogSettingsShell}>
        <AppDialogHeader>
          <AppDialogTitle>{title()}</AppDialogTitle>
          <AppDialogDescription>{description()}</AppDialogDescription>
        </AppDialogHeader>
        <div class="space-y-2 px-1 py-2">
          <Label for="tv-keep-group-name">分组名称</Label>
          <AppTextField>
            <AppTextFieldInput
              id="tv-keep-group-name"
              value={name()}
              onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
                setName(e.currentTarget.value)
              }
              placeholder="例如：追番、电影"
              onKeyDown={(e: KeyboardEvent) => {
                if (e.key === 'Enter') void handleSubmit();
              }}
            />
          </AppTextField>
        </div>
        <AppDialogFooter>
          <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button
            type="button"
            disabled={!name().trim() || saving()}
            onClick={() => void handleSubmit()}
          >
            保存
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
