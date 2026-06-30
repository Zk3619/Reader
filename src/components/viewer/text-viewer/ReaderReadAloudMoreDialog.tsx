/**
 * 朗读更多设置（AppDialog）
 */

import { textViewerStore } from '@/stores/viewer';
import {
  AppDialog,
  AppDialogContent,
  AppDialogHeader,
  AppDialogScrollBody,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { Label } from '@/components/ui/label';
import { AppSwitch, AppSwitchControl, AppSwitchLabel, AppSwitchThumb } from '@/components/shared/AppSwitch';

export interface ReaderReadAloudMoreDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReaderReadAloudMoreDialog(props: ReaderReadAloudMoreDialogProps) {
  const config = () => textViewerStore.state.config;
  const setConfig = (patch: Parameters<typeof textViewerStore.setConfig>[0]) => {
    textViewerStore.setConfig(patch);
  };

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange} modal>
      <AppDialogContent portalToBody class="max-w-md">
        <AppDialogHeader>
          <AppDialogTitle>朗读更多设置</AppDialogTitle>
        </AppDialogHeader>
        <AppDialogScrollBody class="space-y-4">
          <div class="flex items-center justify-between gap-3">
            <Label>按页朗读</Label>
            <AppSwitch
              checked={config().readAloudByPage ?? false}
              onChange={(checked) => setConfig({ readAloudByPage: checked })}
            >
              <AppSwitchControl>
                <AppSwitchThumb />
              </AppSwitchControl>
              <AppSwitchLabel class="sr-only">按页朗读</AppSwitchLabel>
            </AppSwitch>
          </div>
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <Label>段键切章</Label>
              <p class="text-xs text-muted-foreground">开启后上一段/下一段改为切章</p>
            </div>
            <AppSwitch
              checked={config().mediaButtonPerNext ?? false}
              onChange={(checked) => setConfig({ mediaButtonPerNext: checked })}
            >
              <AppSwitchControl>
                <AppSwitchThumb />
              </AppSwitchControl>
              <AppSwitchLabel class="sr-only">段键切章</AppSwitchLabel>
            </AppSwitch>
          </div>
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <Label>选区连续朗读</Label>
              <p class="text-xs text-muted-foreground">开启后选区菜单显示「从此处朗读」</p>
            </div>
            <AppSwitch
              checked={(config().contentSelectSpeakMod ?? 0) === 1}
              onChange={(checked) => setConfig({ contentSelectSpeakMod: checked ? 1 : 0 })}
            >
              <AppSwitchControl>
                <AppSwitchThumb />
              </AppSwitchControl>
              <AppSwitchLabel class="sr-only">选区连续朗读</AppSwitchLabel>
            </AppSwitch>
          </div>
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <Label>朗读时音量键控段</Label>
              <p class="text-xs text-muted-foreground">朗读中音量键切换段/章而非翻页</p>
            </div>
            <AppSwitch
              checked={config().volumeKeyControlAloud ?? true}
              onChange={(checked) => setConfig({ volumeKeyControlAloud: checked })}
            >
              <AppSwitchControl>
                <AppSwitchThumb />
              </AppSwitchControl>
              <AppSwitchLabel class="sr-only">朗读时音量键控段</AppSwitchLabel>
            </AppSwitch>
          </div>
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <Label>HttpTTS 流式播放</Label>
              <p class="text-xs text-muted-foreground">边下边播，减少等待（部分引擎）</p>
            </div>
            <AppSwitch
              checked={config().streamReadAloudAudio ?? false}
              onChange={(checked) => setConfig({ streamReadAloudAudio: checked })}
            >
              <AppSwitchControl>
                <AppSwitchThumb />
              </AppSwitchControl>
              <AppSwitchLabel class="sr-only">HttpTTS 流式播放</AppSwitchLabel>
            </AppSwitch>
          </div>
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <Label>页面可见时恢复朗读</Label>
              <p class="text-xs text-muted-foreground">切回标签页后自动继续（非手动暂停）</p>
            </div>
            <AppSwitch
              checked={config().readAloudResumeOnFocus ?? false}
              onChange={(checked) => setConfig({ readAloudResumeOnFocus: checked })}
            >
              <AppSwitchControl>
                <AppSwitchThumb />
              </AppSwitchControl>
              <AppSwitchLabel class="sr-only">页面可见时恢复朗读</AppSwitchLabel>
            </AppSwitch>
          </div>
        </AppDialogScrollBody>
      </AppDialogContent>
    </AppDialog>
  );
}
