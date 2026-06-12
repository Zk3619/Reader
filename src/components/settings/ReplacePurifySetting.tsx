/**
 * 替换净化相关全局/阅读器设置（对齐 Legado replaceEnableDefault + adaptSpecialStyle）
 */

import { createSignal, onMount } from 'solid-js';
import { Label } from '@/components/ui/label';
import { Switch, SwitchControl, SwitchLabel, SwitchThumb } from '@/components/ui/switch';
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
import { WebServiceSettingBlock } from '@/components/settings/WebServiceSetting';
import { textViewerStore } from '@/stores/viewer';
import { loadReaderUiConfig, saveReaderUiConfig } from '@/lib/media/text/read-config-storage';
import { defaultTextViewerUiConfig } from '@/lib/media/text/reader-ui-config';

export function ReplacePurifySetting() {
  const [replaceDefault, setReplaceDefault] = createSignal(true);
  const [adaptSpecialStyle, setAdaptSpecialStyle] = createSignal(true);
  const [exportUseReplace, setExportUseReplaceState] = createSignal(true);
  const [exportNoChapterName, setExportNoChapterNameState] = createSignal(false);

  onMount(async () => {
    setReplaceDefault(getReplaceEnableDefault());
    setExportUseReplaceState(getExportUseReplace());
    setExportNoChapterNameState(getExportNoChapterName());
    const cfg = await loadReaderUiConfig();
    setAdaptSpecialStyle((cfg?.adaptSpecialStyle ?? defaultTextViewerUiConfig.adaptSpecialStyle) !== false);
  });

  const toggleReplaceDefault = (enabled: boolean) => {
    setReplaceDefault(enabled);
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
    <div class="space-y-4 rounded-2xl border border-border/50 bg-card p-4">
      <div>
        <h3 class="font-semibold text-foreground">替换净化</h3>
        <p class="text-sm text-muted-foreground">
          新书默认是否启用正文替换；替换前保护特殊 HTML 块
        </p>
      </div>
      <div class="flex items-center justify-between gap-3">
        <Label class="text-sm">新书默认启用替换净化</Label>
        <Switch checked={replaceDefault()} onChange={toggleReplaceDefault}>
          <SwitchControl>
            <SwitchThumb />
          </SwitchControl>
          <SwitchLabel class="sr-only">新书默认启用替换净化</SwitchLabel>
        </Switch>
      </div>
      <div class="flex items-center justify-between gap-3">
        <Label class="text-sm">导出时应用替换净化</Label>
        <Switch checked={exportUseReplace()} onChange={toggleExportUseReplace}>
          <SwitchControl>
            <SwitchThumb />
          </SwitchControl>
          <SwitchLabel class="sr-only">导出时应用替换净化</SwitchLabel>
        </Switch>
      </div>
      <div class="flex items-center justify-between gap-3">
        <Label class="text-sm">导出 TXT 不含章节名</Label>
        <Switch checked={exportNoChapterName()} onChange={toggleExportNoChapterName}>
          <SwitchControl>
            <SwitchThumb />
          </SwitchControl>
          <SwitchLabel class="sr-only">导出 TXT 不含章节名</SwitchLabel>
        </Switch>
      </div>
      <WebServiceSettingBlock />
      <div class="flex items-center justify-between gap-3">
        <Label class="text-sm">保护特殊 HTML（usehtml）</Label>
        <Switch checked={adaptSpecialStyle()} onChange={(v) => void toggleAdaptSpecialStyle(v)}>
          <SwitchControl>
            <SwitchThumb />
          </SwitchControl>
          <SwitchLabel class="sr-only">保护特殊 HTML</SwitchLabel>
        </Switch>
      </div>
    </div>
  );
}
