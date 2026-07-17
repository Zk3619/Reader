/**
 * 自定义音源本地导入：选择单个文件或扫描目录
 */

import { ImportLocalChoiceDialog } from '@/components/shared/ImportLocalChoiceDialog';
import { USER_API_IMPORT_EXTENSIONS } from '@/lib/media/audio/online/user-api-import-files';

export interface ImportUserApiLocalDialogProps {
  open: boolean;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onPickFile: () => void;
  onPickDirectory: () => void;
}

const EXT_LABEL = USER_API_IMPORT_EXTENSIONS.map((ext) => `.${ext}`).join('、');

export function ImportUserApiLocalDialog(props: ImportUserApiLocalDialogProps) {
  return (
    <ImportLocalChoiceDialog
      open={props.open}
      busy={props.busy}
      onOpenChange={props.onOpenChange}
      onPickFile={props.onPickFile}
      onPickDirectory={props.onPickDirectory}
      title="本地导入自定义源"
      description={`选择单个自定义源脚本，或选择文件夹并自动扫描其中符合条件的文件（${EXT_LABEL}）。`}
      fileButtonHint="可一次选择多个 .js / .txt 脚本文件"
      directoryButtonHint="扫描文件夹内全部符合条件的自定义源脚本"
    />
  );
}
