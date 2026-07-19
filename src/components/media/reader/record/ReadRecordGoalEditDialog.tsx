/**
 * 编辑阅读目标（对齐 legado-own showReadRecordGoalDialog）
 */

import { createEffect, createSignal } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { AppTextField, AppTextFieldInput } from '@/components/shared/AppTextField';
import { SettingsNumberField } from '@/components/settings/SettingsNumberField';
import {
  AppDialog,
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import {
  DEFAULT_READ_RECORD_GOAL_CONFIG,
  type ReadRecordGoalConfig,
} from '@/lib/record/read-record-goal';
import { pickLocalImageAsDataUrl } from '@/lib/platform/image-data-url';

export interface ReadRecordGoalEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: ReadRecordGoalConfig;
  onSave: (config: ReadRecordGoalConfig) => void;
}

export function ReadRecordGoalEditDialog(props: ReadRecordGoalEditDialogProps) {
  const [userName, setUserName] = createSignal('');
  const [avatar, setAvatar] = createSignal('');
  const [dailyGoalMinutes, setDailyGoalMinutes] = createSignal(
    DEFAULT_READ_RECORD_GOAL_CONFIG.dailyGoalMinutes,
  );
  const [pickingAvatar, setPickingAvatar] = createSignal(false);

  createEffect(() => {
    if (!props.open) return;
    setUserName(props.initial.userName ?? '');
    setAvatar(props.initial.avatar ?? '');
    setDailyGoalMinutes(props.initial.dailyGoalMinutes);
  });

  async function handlePickAvatar() {
    setPickingAvatar(true);
    try {
      const dataUrl = await pickLocalImageAsDataUrl();
      if (dataUrl) setAvatar(dataUrl);
    } catch (error) {
      console.error('选择头像失败:', error);
    } finally {
      setPickingAvatar(false);
    }
  }

  function handleSave() {
    const minutes = dailyGoalMinutes();
    props.onSave({
      userName: userName().trim() || undefined,
      avatar: avatar().trim() || undefined,
      dailyGoalMinutes:
        Number.isFinite(minutes) && minutes > 0
          ? minutes
          : DEFAULT_READ_RECORD_GOAL_CONFIG.dailyGoalMinutes,
    });
    props.onOpenChange(false);
  }

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent layout="app" class="max-w-md">
        <AppDialogHeader>
          <AppDialogTitle>阅读目标</AppDialogTitle>
        </AppDialogHeader>

        <div class="space-y-4 px-6 pb-2">
          <div class="space-y-2">
            <Label for="read-record-goal-user-name">用户名</Label>
            <AppTextField>
              <AppTextFieldInput
                id="read-record-goal-user-name"
                placeholder="填写要显示的用户名"
                value={userName()}
                onInput={(e) => setUserName(e.currentTarget.value)}
              />
            </AppTextField>
          </div>

          <div class="space-y-2">
            <Label for="read-record-goal-avatar">头像图片</Label>
            <div class="flex gap-2">
              <AppTextField class="min-w-0 flex-1">
                <AppTextFieldInput
                  id="read-record-goal-avatar"
                  placeholder="本地 URI 或图片链接"
                  value={avatar()}
                  onInput={(e) => setAvatar(e.currentTarget.value)}
                />
              </AppTextField>
              <Button
                type="button"
                variant="secondary"
                class="shrink-0"
                disabled={pickingAvatar()}
                onClick={() => void handlePickAvatar()}
              >
                选择图片
              </Button>
            </div>
          </div>

          <div class="space-y-2">
            <Label for="read-record-goal-minutes">每日目标（分钟）</Label>
            <SettingsNumberField
              value={dailyGoalMinutes()}
              onValueChange={setDailyGoalMinutes}
              min={1}
              max={24 * 60}
              groupClass="w-full"
              inputClass="pr-7"
            />
          </div>
        </div>

        <AppDialogFooter class="px-6 pb-6">
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave}>确定</Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
