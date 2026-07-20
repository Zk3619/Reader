/**
 * HttpTTS 引擎编辑对话框
 */

import { createSignal, Show } from 'solid-js';
import {
  AppDialog,
  AppDialogScrollBody,
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { AppSwitch, AppSwitchControl, AppSwitchLabel, AppSwitchThumb } from '@/components/shared/AppSwitch';
import { AppTextField, AppTextFieldInput, AppTextFieldTextArea } from '@/components/shared/AppTextField';
import { upsertHttpTTS } from '@/lib/database/http-tts';
import type { HttpTTS } from '@/types';

export interface HttpTtsEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: HttpTTS | null;
  onSaved?: () => void;
}

function emptyTts(): HttpTTS {
  return {
    id: Date.now(),
    name: '',
    url: '',
    contentType: 'audio/mpeg',
    concurrentRate: '0',
    lastUpdateTime: Date.now(),
    enabledCookieJar: false,
  };
}

export function HttpTtsEditDialog(props: HttpTtsEditDialogProps) {
  const [form, setForm] = createSignal<HttpTTS>(emptyTts());
  const [saving, setSaving] = createSignal(false);

  const handleOpen = (open: boolean) => {
    if (open) {
      setForm(props.initial ? { ...props.initial } : emptyTts());
    }
    props.onOpenChange(open);
  };

  const patch = (partial: Partial<HttpTTS>) => {
    setForm((prev) => ({ ...prev, ...partial }));
  };

  const handleSave = async () => {
    const data = form();
    if (!data.name.trim() || !data.url.trim()) return;
    setSaving(true);
    try {
      await upsertHttpTTS({ ...data, lastUpdateTime: Date.now() });
      props.onSaved?.();
      props.onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppDialog open={props.open} onOpenChange={handleOpen} modal>
      <AppDialogContent portalToBody class="max-h-[90dvh]">
        <AppDialogHeader>
          <AppDialogTitle>{props.initial ? '编辑引擎' : '新增引擎'}</AppDialogTitle>
        </AppDialogHeader>
        <AppDialogScrollBody class="max-h-[60dvh] space-y-3">
          <div class="space-y-1">
            <Label>名称</Label>
            <AppTextField>
              <AppTextFieldInput value={form().name} onInput={(e) => patch({ name: e.currentTarget.value })} />
            </AppTextField>
          </div>
          <div class="space-y-1">
            <Label>URL</Label>
            <AppTextField>
              <AppTextFieldTextArea
                class="min-h-24 font-mono text-xs"
                value={form().url}
                onInput={(e) => patch({ url: e.currentTarget.value })}
              />
            </AppTextField>
          </div>
          <div class="space-y-1">
            <Label>Content-Type</Label>
            <AppTextField>
              <AppTextFieldInput
                value={form().contentType ?? ''}
                onInput={(e) => patch({ contentType: e.currentTarget.value })}
              />
            </AppTextField>
          </div>
          <div class="space-y-1">
            <Label>并发间隔（毫秒）</Label>
            <AppTextField>
              <AppTextFieldInput
                value={form().concurrentRate ?? '0'}
                onInput={(e) => patch({ concurrentRate: e.currentTarget.value })}
              />
            </AppTextField>
          </div>
          <div class="space-y-1">
            <Label>Header（JSON 或每行 Key: Value）</Label>
            <AppTextField>
              <AppTextFieldTextArea
                class="min-h-16 font-mono text-xs"
                value={form().header ?? ''}
                onInput={(e) => patch({ header: e.currentTarget.value })}
              />
            </AppTextField>
          </div>
          <div class="space-y-1">
            <Label>loginUi（JSON 数组）</Label>
            <AppTextField>
              <AppTextFieldTextArea
                class="min-h-16 font-mono text-xs"
                value={form().loginUi ?? ''}
                onInput={(e) => patch({ loginUi: e.currentTarget.value })}
              />
            </AppTextField>
          </div>
          <div class="space-y-1">
            <Label>loginUrl</Label>
            <AppTextField>
              <AppTextFieldTextArea
                class="min-h-16 font-mono text-xs"
                value={form().loginUrl ?? ''}
                onInput={(e) => patch({ loginUrl: e.currentTarget.value })}
              />
            </AppTextField>
          </div>
          <div class="space-y-1">
            <Label>loginCheckJs</Label>
            <AppTextField>
              <AppTextFieldTextArea
                class="min-h-16 font-mono text-xs"
                value={form().loginCheckJs ?? ''}
                onInput={(e) => patch({ loginCheckJs: e.currentTarget.value })}
              />
            </AppTextField>
          </div>
          <div class="space-y-1">
            <Label>jsLib</Label>
            <AppTextField>
              <AppTextFieldTextArea
                class="min-h-16 font-mono text-xs"
                value={form().jsLib ?? ''}
                onInput={(e) => patch({ jsLib: e.currentTarget.value })}
              />
            </AppTextField>
          </div>
          <div class="flex items-center justify-between">
            <Label>启用 CookieJar</Label>
            <AppSwitch
              checked={form().enabledCookieJar === true}
              onChange={(checked) => patch({ enabledCookieJar: checked })}
            >
              <AppSwitchControl>
                <AppSwitchThumb />
              </AppSwitchControl>
              <AppSwitchLabel class="sr-only">CookieJar</AppSwitchLabel>
            </AppSwitch>
          </div>
        </AppDialogScrollBody>
        <AppDialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button disabled={saving()} onClick={() => void handleSave()}>
            <Show when={saving()} fallback="保存">
              保存中…
            </Show>
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
