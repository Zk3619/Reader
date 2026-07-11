/**
 * 主题本地导入：选择单个文件或扫描目录
 */

import { ImportLocalChoiceDialog } from '@/components/shared/ImportLocalChoiceDialog';
import { THEME_IMPORT_EXTENSIONS } from '@/lib/theme/import/theme-import-files';

export interface ImportThemeLocalDialogProps {
  open: boolean;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onPickFile: () => void;
  onPickDirectory: () => void;
  portalZClass?: string;
}

const EXT_LABEL = THEME_IMPORT_EXTENSIONS.join('、');

export function ImportThemeLocalDialog(props: ImportThemeLocalDialogProps) {
  return (
    <ImportLocalChoiceDialog
      open={props.open}
      busy={props.busy}
      portalZClass={props.portalZClass}
      onOpenChange={props.onOpenChange}
      onPickFile={props.onPickFile}
      onPickDirectory={props.onPickDirectory}
      title="本地导入主题"
      description={`选择单个主题包文件，或选择文件夹并自动扫描其中符合条件的文件（${EXT_LABEL}、.reader-theme.json / .reader-theme.zip）。`}
      fileButtonHint="可一次选择多个 JSON 或 ZIP 主题包"
      directoryButtonHint="扫描文件夹内全部符合条件的主题文件"
    />
  );
}
