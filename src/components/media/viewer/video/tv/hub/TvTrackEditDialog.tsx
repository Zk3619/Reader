/**
 * 编辑影视收藏 / 历史展示名与封面
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
import { appDialogSettingsShell } from '@/lib/ui/viewport-classes';

export interface TvTrackEditFields {
  vodName: string;
  vodPic: string;
}

export interface TvTrackEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  initial?: TvTrackEditFields | null;
  onSubmit: (fields: TvTrackEditFields) => void | Promise<void>;
}

export function TvTrackEditDialog(props: TvTrackEditDialogProps) {
  const [name, setName] = createSignal('');
  const [pic, setPic] = createSignal('');
  const [saving, setSaving] = createSignal(false);

  createEffect(() => {
    if (props.open) {
      setName(props.initial?.vodName ?? '');
      setPic(props.initial?.vodPic ?? '');
      setSaving(false);
    }
  });

  async function handleSubmit() {
    const vodName = name().trim();
    if (!vodName || saving()) return;
    setSaving(true);
    try {
      await props.onSubmit({ vodName, vodPic: pic().trim() });
      props.onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent class={appDialogSettingsShell}>
        <AppDialogHeader>
          <AppDialogTitle>{props.title ?? '编辑'}</AppDialogTitle>
          <AppDialogDescription>
            {props.description ?? '修改显示名称与封面地址'}
          </AppDialogDescription>
        </AppDialogHeader>
        <div class="space-y-3 px-1 py-2">
          <div class="space-y-2">
            <Label for="tv-track-edit-name">名称</Label>
            <AppTextField>
              <AppTextFieldInput
                id="tv-track-edit-name"
                value={name()}
                onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
                  setName(e.currentTarget.value)
                }
                placeholder="显示名称"
                onKeyDown={(e: KeyboardEvent) => {
                  if (e.key === 'Enter') void handleSubmit();
                }}
              />
            </AppTextField>
          </div>
          <div class="space-y-2">
            <Label for="tv-track-edit-pic">封面 URL</Label>
            <AppTextField>
              <AppTextFieldInput
                id="tv-track-edit-pic"
                value={pic()}
                onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
                  setPic(e.currentTarget.value)
                }
                placeholder="https://…"
              />
            </AppTextField>
          </div>
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
