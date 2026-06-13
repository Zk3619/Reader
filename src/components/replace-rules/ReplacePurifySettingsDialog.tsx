/**
 * 替换净化全局选项（对齐 Legado replaceEnableDefault + exportUseReplace + adaptSpecialStyle）
 */

import { createSignal, onMount } from 'solid-js';
import { Label } from '@/components/ui/label';
import { Switch, SwitchControl, SwitchLabel, SwitchThumb } from '@/components/ui/switch';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import {
  getReplaceEnableDefault,
  setReplaceEnableDefault,
} from '@/lib/replace-rules/replace-rule-policy';
import {
  getExportUseReplace,
  setExportUseReplace,
  getExportNoChapterName,
  setExportNoChapterName,
} from '@/lib/replace-rules/export-replace-policy';
import { textViewerStore } from '@/stores/viewer';
import { loadReaderUiConfig, saveReaderUiConfig } from '@/lib/media/text/read-config-storage';
import { defaultTextViewerUiConfig } from '@/lib/media/text/reader-ui-config';

export interface ReplacePurifySettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReplacePurifySettingsDialog(props: ReplacePurifySettingsDialogProps) {
  const [replaceEnabled, setReplaceEnabled] = createSignal(true);
  const [adaptSpecialStyle, setAdaptSpecialStyle] = createSignal(true);
  const [exportUseReplace, setExportUseReplaceState] = createSignal(true);
  const [exportNoChapterName, setExportNoChapterNameState] = createSignal(false);

  const loadSettings = async () => {
    setReplaceEnabled(getReplaceEnableDefault());
    setExportUseReplaceState(getExportUseReplace());
    setExportNoChapterNameState(getExportNoChapterName());
    const cfg = await loadReaderUiConfig();
    setAdaptSpecialStyle((cfg?.adaptSpecialStyle ?? defaultTextViewerUiConfig.adaptSpecialStyle) !== false);
  };

  onMount(() => {
    void loadSettings();
  });

  const toggleReplaceEnabled = (enabled: boolean) => {
    setReplaceEnabled(enabled);
    setReplaceEnableDefault(enabled);
  };

  const toggleAdaptSpecialStyle = async (enabled: boolean) => {
    setAdaptSpecialStyle(enabled);
    const cfg = (await loadReaderUiConfig()) ?? { ...defaultTextViewerUiConfig };
    const next = { ...defaultTextViewerUiConfig, ...cfg, adaptSpecialStyle: enabled };
    await saveReaderUiConfig(next);
    textViewerStore.setConfig({ adaptSpecialStyle: enabled });
  };

  const toggleExportUseReplace = (enabled: boolean) => {
    setExportUseReplaceState(enabled);
    setExportUseReplace(enabled);
  };

  const toggleExportNoChapterName = (enabled: boolean) => {
    setExportNoChapterNameState(enabled);
    setExportNoChapterName(enabled);
  };

  return (
    <AppDialog
      open={props.open}
      onOpenChange={(open) => {
        props.onOpenChange(open);
        if (open) void loadSettings();
      }}
    >
      <AppDialogContent layout="app" class="max-w-md">
        <AppDialogHeader class="px-6 pt-6">
          <AppDialogTitle>替换净化设置</AppDialogTitle>
          <AppDialogDescription>
            全局开关对未单独配置的书籍生效；阅读器内仍可对单本书覆盖
          </AppDialogDescription>
        </AppDialogHeader>
        <div class="space-y-3 px-6 pb-6">
          <div class="flex items-center justify-between gap-3 rounded-lg px-1 py-1">
            <div class="space-y-0.5">
              <Label class="text-sm">启用替换净化</Label>
              <p class="text-xs text-muted-foreground">未单独开关的书籍是否应用替换规则</p>
            </div>
            <Switch checked={replaceEnabled()} onChange={toggleReplaceEnabled}>
              <SwitchControl>
                <SwitchThumb />
              </SwitchControl>
              <SwitchLabel class="sr-only">启用替换净化</SwitchLabel>
            </Switch>
          </div>
          <div class="flex items-center justify-between gap-3 rounded-lg px-1 py-1">
            <Label class="text-sm">导出时应用替换净化</Label>
            <Switch checked={exportUseReplace()} onChange={toggleExportUseReplace}>
              <SwitchControl>
                <SwitchThumb />
              </SwitchControl>
              <SwitchLabel class="sr-only">导出时应用替换净化</SwitchLabel>
            </Switch>
          </div>
          <div class="flex items-center justify-between gap-3 rounded-lg px-1 py-1">
            <Label class="text-sm">导出 TXT 不含章节名</Label>
            <Switch checked={exportNoChapterName()} onChange={toggleExportNoChapterName}>
              <SwitchControl>
                <SwitchThumb />
              </SwitchControl>
              <SwitchLabel class="sr-only">导出 TXT 不含章节名</SwitchLabel>
            </Switch>
          </div>
          <div class="flex items-center justify-between gap-3 rounded-lg px-1 py-1">
            <div class="space-y-0.5">
              <Label class="text-sm">保护特殊 HTML（usehtml）</Label>
              <p class="text-xs text-muted-foreground">替换前保留特殊 HTML 块</p>
            </div>
            <Switch checked={adaptSpecialStyle()} onChange={(v) => void toggleAdaptSpecialStyle(v)}>
              <SwitchControl>
                <SwitchThumb />
              </SwitchControl>
              <SwitchLabel class="sr-only">保护特殊 HTML</SwitchLabel>
            </Switch>
          </div>
        </div>
      </AppDialogContent>
    </AppDialog>
  );
}
