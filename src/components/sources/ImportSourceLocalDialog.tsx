/**
 * 书源本地导入：选择单个文件或扫描目录
 */

import { ImportLocalChoiceDialog } from '@/components/shared/ImportLocalChoiceDialog';
import { BOOK_SOURCE_IMPORT_EXTENSIONS } from '@/lib/book-source/book-source-import-files';

export interface ImportSourceLocalDialogProps {
  open: boolean;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onPickFile: () => void;
  onPickDirectory: () => void;
  portalZClass?: string;
}

const EXT_LABEL = BOOK_SOURCE_IMPORT_EXTENSIONS.join('、');

export function ImportSourceLocalDialog(props: ImportSourceLocalDialogProps) {
  return (
    <ImportLocalChoiceDialog
      open={props.open}
      busy={props.busy}
      portalZClass={props.portalZClass}
      onOpenChange={props.onOpenChange}
      onPickFile={props.onPickFile}
      onPickDirectory={props.onPickDirectory}
      title="本地导入书源"
      description={`选择单个书源 / 备份文件，或选择文件夹并自动扫描其中符合条件的文件（${EXT_LABEL}）。数据库备份（.db）将引导至恢复流程，不会当作 JSON 书源解析。`}
      fileButtonHint="可一次选择多个 JSON、ZIP 或备份文件"
      directoryButtonHint="扫描文件夹内全部符合条件的书源文件"
    />
  );
}
