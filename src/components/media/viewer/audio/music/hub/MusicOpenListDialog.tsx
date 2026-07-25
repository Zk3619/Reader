/**
 * OpenList：通过 URL 打开在线歌单（自动遍历 / 指定平台）
 */

import { createEffect, createSignal, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  AppTextField,
  AppTextFieldInput,
  AppTextFieldLabel,
} from '@/components/shared/AppTextField';
import {
  AppSelect,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import { showAppToast } from '@/components/shared/AppToasts';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogFooter,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
  ViewerAppSelectContent,
} from '@/components/media/viewer/viewer-app-overlay';
import {
  detectSongListSourceFromUrl,
  MUSIC_SDK_SOURCE_LABELS,
  MUSIC_SDK_SOURCES,
  type MusicSdkSource,
} from '@/lib/media/audio/music-sdk';
import { openListFromUrlInput } from '@/stores/music-hub/songList';

type PlatformChoice = MusicSdkSource | 'auto';

const PLATFORM_OPTIONS: PlatformChoice[] = ['auto', ...MUSIC_SDK_SOURCES];

function platformLabel(value: PlatformChoice): string {
  return value === 'auto' ? '自动' : MUSIC_SDK_SOURCE_LABELS[value];
}

export interface MusicOpenListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const MusicOpenListDialog: Component<MusicOpenListDialogProps> = (props) => {
  const [url, setUrl] = createSignal('');
  const [platform, setPlatform] = createSignal<PlatformChoice>('auto');
  const [loading, setLoading] = createSignal(false);
  const [switchPrompt, setSwitchPrompt] = createSignal<{
    detected: MusicSdkSource;
    value: string;
  } | null>(null);

  createEffect(() => {
    if (!props.open) {
      setUrl('');
      setLoading(false);
      setSwitchPrompt(null);
      setPlatform('auto');
    }
  });

  const finishOk = () => {
    props.onOpenChange(false);
    setUrl('');
    setSwitchPrompt(null);
  };

  const openWithSource = async (value: string, source: MusicSdkSource) => {
    setLoading(true);
    const ok = await openListFromUrlInput(value, source);
    setLoading(false);
    if (ok) {
      finishOk();
      return;
    }
    showAppToast({
      title: '未识别到歌单',
      description: '请选择正确的平台',
      variant: 'destructive',
    });
  };

  const openAuto = async (value: string) => {
    setLoading(true);
    const ok = await openListFromUrlInput(value);
    setLoading(false);
    if (ok) {
      finishOk();
      return;
    }
    showAppToast({
      title: '未识别到歌单',
      description: '可尝试选择具体平台后再打开',
      variant: 'destructive',
    });
  };

  const submit = async () => {
    const value = url().trim();
    if (!value) return;

    const choice = platform();
    const detected = detectSongListSourceFromUrl(value);

    if (choice === 'auto') {
      await openAuto(value);
      return;
    }

    // 指定平台 + 完整地址域名与所选不一致 → 询问是否切换
    if (detected && detected !== choice) {
      setSwitchPrompt({ detected, value });
      return;
    }

    await openWithSource(value, choice);
  };

  const confirmSwitch = async () => {
    const pending = switchPrompt();
    if (!pending) return;
    setPlatform(pending.detected);
    setSwitchPrompt(null);
    await openWithSource(pending.value, pending.detected);
  };

  return (
    <>
      <ViewerAppDialog open={props.open} onOpenChange={props.onOpenChange}>
        <ViewerAppDialogContent layout="app" class="w-[calc(100dvw-2rem)] max-w-md">
          <ViewerAppDialogHeader>
            <ViewerAppDialogTitle>打开歌单链接</ViewerAppDialogTitle>
          </ViewerAppDialogHeader>

          {/* 短表单用普通内边距区即可；AppDialogScrollBody 的 overflow-y-auto 会裁切焦点环 */}
          <div class="flex flex-col gap-3 px-6 py-4">
            <p class="text-sm text-muted-foreground">
              「自动」会按域名直达或对纯 ID 遍历平台；也可指定平台打开
            </p>
            <div class="flex items-end gap-2">
              <div class="shrink-0">
                <span class="text-foreground mb-1.5 block text-sm font-medium leading-none">
                  平台
                </span>
                <AppSelect
                  value={platform()}
                  onChange={(value) => {
                    if (value != null) setPlatform(value as PlatformChoice);
                  }}
                  options={[...PLATFORM_OPTIONS]}
                  itemComponent={(itemProps) => (
                    <AppSelectItem item={itemProps.item}>
                      {platformLabel(itemProps.item.rawValue as PlatformChoice)}
                    </AppSelectItem>
                  )}
                >
                  <AppSelectTrigger layout="compact" class="h-10 w-24" aria-label="歌单平台">
                    <AppSelectValue>
                      {(selectState) => {
                        const raw = selectState.selectedOption() as PlatformChoice | undefined;
                        return raw != null ? platformLabel(raw) : '';
                      }}
                    </AppSelectValue>
                    <AppSelectIcon />
                  </AppSelectTrigger>
                  <ViewerAppSelectContent>
                    <AppSelectListbox />
                  </ViewerAppSelectContent>
                </AppSelect>
              </div>
              <AppTextField class="min-w-0 flex-1">
                <AppTextFieldLabel>歌单链接</AppTextFieldLabel>
                <AppTextFieldInput
                  placeholder="粘贴歌单 URL 或 ID"
                  value={url()}
                  onInput={(e) => setUrl(e.currentTarget.value)}
                  onKeyDown={(e: KeyboardEvent) => e.key === 'Enter' && void submit()}
                />
              </AppTextField>
            </div>
          </div>

          <ViewerAppDialogFooter>
            <Button variant="outline" onClick={() => props.onOpenChange(false)}>
              取消
            </Button>
            <Button onClick={() => void submit()} disabled={loading() || !url().trim()}>
              {loading() ? '解析中…' : '打开'}
            </Button>
          </ViewerAppDialogFooter>
        </ViewerAppDialogContent>
      </ViewerAppDialog>

      <ViewerAppDialog
        open={switchPrompt() != null}
        onOpenChange={(open) => {
          if (!open) setSwitchPrompt(null);
        }}
      >
        <ViewerAppDialogContent layout="app" class="w-[calc(100dvw-2rem)] max-w-sm">
          <ViewerAppDialogHeader>
            <ViewerAppDialogTitle>平台不一致</ViewerAppDialogTitle>
          </ViewerAppDialogHeader>
          <div class="px-6 py-4">
            <p class="text-sm text-muted-foreground">
              {switchPrompt()
                ? `识别到「${MUSIC_SDK_SOURCE_LABELS[switchPrompt()!.detected]}」平台的歌单，是否切换到对应平台？`
                : ''}
            </p>
          </div>
          <ViewerAppDialogFooter>
            <Button variant="outline" onClick={() => setSwitchPrompt(null)} disabled={loading()}>
              取消
            </Button>
            <Button onClick={() => void confirmSwitch()} disabled={loading()}>
              {loading() ? '打开中…' : '切换并打开'}
            </Button>
          </ViewerAppDialogFooter>
        </ViewerAppDialogContent>
      </ViewerAppDialog>
    </>
  );
};
