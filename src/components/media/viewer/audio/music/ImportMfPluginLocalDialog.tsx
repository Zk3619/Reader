/**
 * MusicFree 插件本地导入：选择单个文件或扫描目录（对齐 LX UserApi 弹窗）
 */

import { ImportLocalChoiceDialog } from '@/components/shared/ImportLocalChoiceDialog';
import { MF_PLUGIN_IMPORT_EXTENSIONS } from '@/lib/media/audio/online/mf-plugin/mf-plugin-import-files';

export interface ImportMfPluginLocalDialogProps {
  open: boolean;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onPickFile: () => void;
  onPickDirectory: () => void;
}

const EXT_LABEL = MF_PLUGIN_IMPORT_EXTENSIONS.map((ext) => `.${ext}`).join('、');

export function ImportMfPluginLocalDialog(props: ImportMfPluginLocalDialogProps) {
  return (
    <ImportLocalChoiceDialog
      open={props.open}
      busy={props.busy}
      onOpenChange={props.onOpenChange}
      onPickFile={props.onPickFile}
      onPickDirectory={props.onPickDirectory}
      title="本地导入 MusicFree 插件"
      description={`选择单个插件脚本或订阅 JSON，或选择文件夹并自动扫描其中符合条件的文件（${EXT_LABEL}）。`}
      fileButtonHint="可一次选择多个 .js / .json 文件"
      directoryButtonHint="扫描文件夹内全部插件脚本与订阅 JSON"
    />
  );
}
