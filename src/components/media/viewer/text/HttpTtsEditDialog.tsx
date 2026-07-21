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
  const [debugText, setDebugText] = createSignal('欢迎使用朗读引擎调试。');
  const [debugBusy, setDebugBusy] = createSignal(false);
  const [debugInfo, setDebugInfo] = createSignal<string>('');
  let debugAudio: HTMLAudioElement | null = null;
  let debugObjectUrl: string | null = null;

  const revokeDebugAudio = () => {
    if (debugAudio) {
      debugAudio.pause();
      debugAudio = null;
    }
    if (debugObjectUrl) {
      URL.revokeObjectURL(debugObjectUrl);
      debugObjectUrl = null;
    }
  };

  const handleOpen = (open: boolean) => {
    if (open) {
      setForm(props.initial ? { ...props.initial } : emptyTts());
      setDebugInfo('');
    } else {
      revokeDebugAudio();
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

  const handleDebugSpeak = async () => {
    const data = form();
    if (!data.url.trim()) {
      setDebugInfo('请先填写 URL 规则');
      return;
    }
    setDebugBusy(true);
    setDebugInfo('');
    try {
      const { buildHttpTtsRequest } = await import('@/lib/media/text/http-tts-analyze');
      const { fetchHttpTtsObjectUrl } = await import('@/lib/media/text/http-tts-speak');
      const spec = buildHttpTtsRequest(data, debugText(), 5);
      const maskedUrl = spec.url.replace(/([?&](?:key|token|api_key|apikey)=)[^&]+/gi, '$1***');
      setDebugInfo(`${spec.method} ${maskedUrl}`);
      revokeDebugAudio();
      const objectUrl = await fetchHttpTtsObjectUrl(data, debugText(), 5);
      debugObjectUrl = objectUrl;
      debugAudio = new Audio(objectUrl);
      await debugAudio.play();
      setDebugInfo((prev) => `${prev}\n试听已开始`);
    } catch (e) {
      setDebugInfo(e instanceof Error ? e.message : String(e));
    } finally {
      setDebugBusy(false);
    }
  };

  const copyDebugInfo = () => {
    const text = debugInfo().trim();
    if (!text) return;
    void navigator.clipboard.writeText(text);
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
          <div class="space-y-2 rounded-md border border-border/60 p-3">
            <Label>规则调试（试听）</Label>
            <p class="text-xs text-muted-foreground">
              按当前表单展开 URL 并发起请求；厂商 API（含豆包等）请自行填写 HttpTTS 规则，主程序无特供接入。
            </p>
            <AppTextField>
              <AppTextFieldTextArea
                class="min-h-14 text-sm"
                value={debugText()}
                onInput={(e) => setDebugText(e.currentTarget.value)}
              />
            </AppTextField>
            <Show when={debugInfo()}>
              <pre class="max-h-24 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/40 p-2 text-[11px] text-muted-foreground">
                {debugInfo()}
              </pre>
            </Show>
            <div class="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={debugBusy()}
                onClick={() => void handleDebugSpeak()}
              >
                <Show when={debugBusy()} fallback="试听">
                  请求中…
                </Show>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!debugInfo()}
                onClick={copyDebugInfo}
              >
                复制调试信息
              </Button>
            </div>
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
