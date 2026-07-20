/**
 * HttpTTS 登录对话框（loginUi 表单）
 */

import { createMemo, createSignal, For, Show } from 'solid-js';
import JSON5 from 'json5';
import {
  AppDialog,
  AppDialogScrollBody,
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { Button } from '@/components/ui/button';
import { AppTextField, AppTextFieldInput } from '@/components/shared/AppTextField';
import { Label } from '@/components/ui/label';
import {
  AppSelect,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import { ViewerAppSelectContent } from '@/components/media/viewer/viewer-app-overlay';
import {
  loadHttpTtsLoginInfo,
  saveHttpTtsLoginInfo,
} from '@/lib/media/text/http-tts-import';
import type { HttpTTS } from '@/types';

export type LoginUiItem = {
  name: string;
  type?: string;
  chars?: string[];
  viewName?: string;
};

function parseLoginUi(loginUi: string | undefined): LoginUiItem[] | null {
  if (!loginUi?.trim()) return null;
  let s = loginUi.trim().replace(/^\uFEFF/, '');
  try {
    if (s.startsWith('"')) {
      s = JSON.parse(s) as string;
    }
    const parsed = JSON.parse(s) as unknown;
    if (Array.isArray(parsed)) return parsed as LoginUiItem[];
  } catch {
    try {
      const parsed = JSON5.parse(s) as unknown;
      if (Array.isArray(parsed)) return parsed as LoginUiItem[];
    } catch {
      return null;
    }
  }
  return null;
}

export interface HttpTtsLoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  httpTts: HttpTTS | null;
}

export function HttpTtsLoginDialog(props: HttpTtsLoginDialogProps) {
  const items = createMemo(() => parseLoginUi(props.httpTts?.loginUi));
  const [values, setValues] = createSignal<Record<string, string>>({});

  const loadValues = () => {
    const tts = props.httpTts;
    if (!tts) return;
    const saved = loadHttpTtsLoginInfo(tts.id) ?? {};
    const ui = items() ?? [];
    const next: Record<string, string> = { ...saved };
    for (const item of ui) {
      if (next[item.name] == null) next[item.name] = '';
    }
    setValues(next);
  };

  const handleOpen = (open: boolean) => {
    if (open) loadValues();
    props.onOpenChange(open);
  };

  const handleSave = () => {
    const tts = props.httpTts;
    if (!tts) return;
    saveHttpTtsLoginInfo(tts.id, values());
    props.onOpenChange(false);
  };

  return (
    <AppDialog open={props.open} onOpenChange={handleOpen} modal>
      <AppDialogContent portalToBody>
        <AppDialogHeader>
          <AppDialogTitle>引擎登录 — {props.httpTts?.name ?? ''}</AppDialogTitle>
        </AppDialogHeader>
        <AppDialogScrollBody class="space-y-3">
          <Show
            when={(items() ?? []).length > 0}
            fallback={
              <p class="text-sm text-muted-foreground">该引擎无需登录配置</p>
            }
          >
            <For each={items() ?? []}>
              {(item) => (
                <div class="space-y-1">
                  <Label>{item.viewName?.replace(/^'|'$/g, '') || item.name}</Label>
                  <Show
                    when={item.type === 'select' && item.chars?.length}
                    fallback={
                      <AppTextField>
                        <AppTextFieldInput
                          value={values()[item.name] ?? ''}
                          onInput={(e) =>
                            setValues((prev) => ({
                              ...prev,
                              [item.name]: e.currentTarget.value,
                            }))
                          }
                        />
                      </AppTextField>
                    }
                  >
                    <AppSelect
                      options={['', ...(item.chars ?? [])]}
                      value={values()[item.name] ?? ''}
                      onChange={(value) =>
                        setValues((prev) => ({
                          ...prev,
                          [item.name]: value ?? '',
                        }))
                      }
                      itemComponent={(p) => (
                        <AppSelectItem item={p.item}>
                          {p.item.rawValue || '请选择'}
                        </AppSelectItem>
                      )}
                    >
                      <AppSelectTrigger
                        class="w-full"
                        aria-label={item.viewName?.replace(/^'|'$/g, '') || item.name}
                      >
                        <AppSelectValue<string>>
                          {(state) => state.selectedOption() || '请选择'}
                        </AppSelectValue>
                        <AppSelectIcon />
                      </AppSelectTrigger>
                      <ViewerAppSelectContent>
                        <AppSelectListbox />
                      </ViewerAppSelectContent>
                    </AppSelect>
                  </Show>
                </div>
              )}
            </For>
          </Show>
        </AppDialogScrollBody>
        <AppDialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave}>保存</Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
