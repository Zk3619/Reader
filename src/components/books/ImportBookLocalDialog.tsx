/**
 * 本地书籍导入：选择单个文件或扫描目录
 */

import { ImportLocalChoiceDialog } from '@/components/shared/ImportLocalChoiceDialog';
import { LOCAL_BOOK_IMPORT_EXTENSIONS } from '@/lib/local-book/local-book-import-files';

export interface ImportBookLocalDialogProps {
  open: boolean;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onPickFile: () => void;
  onPickDirectory: () => void;
  portalZClass?: string;
}

const EXT_LABEL = LOCAL_BOOK_IMPORT_EXTENSIONS.join('、');

export function ImportBookLocalDialog(props: ImportBookLocalDialogProps) {
  return (
    <ImportLocalChoiceDialog
      open={props.open}
      busy={props.busy}
      portalZClass={props.portalZClass}
      onOpenChange={props.onOpenChange}
      onPickFile={props.onPickFile}
      onPickDirectory={props.onPickDirectory}
      title="添加本地书籍"
      description={`选择单个书籍文件，或选择文件夹并自动扫描其中符合条件的文件（${EXT_LABEL}）。`}
      fileButtonHint="可一次选择多个 TXT 或 EPUB"
      directoryButtonHint="扫描文件夹内全部符合条件的书籍并批量导入"
    />
  );
}
