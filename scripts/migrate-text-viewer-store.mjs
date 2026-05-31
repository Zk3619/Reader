/**
 * 将仍引用已删除 stores/reader 的文件迁移到 textViewerStore
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(process.cwd(), 'src');

const TEXT_VIEWER_FILES = [
  'pages/bookshelf/BookShelfPage.tsx',
  'components/viewer/text-viewer/ReaderContent.tsx',
  'components/viewer/text-viewer/ReaderSettings.tsx',
  'components/viewer/text-viewer/ReaderClickRegionalOverlay.tsx',
  'components/viewer/text-viewer/ReaderCatalog.tsx',
];

for (const rel of TEXT_VIEWER_FILES) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;
  let s = fs.readFileSync(file, 'utf8');
  s = s.replace(
    /import \{ readerStore(?:,\s*([^}]+))?\} from '@\/stores\/reader';/g,
    (_, rest) =>
      rest
        ? `import { textViewerStore, ${rest.trim()} } from '@/stores/viewer';`
        : "import { textViewerStore } from '@/stores/viewer';",
  );
  s = s.replace(
    /import \{\s*readerStore,\s*/g,
    'import { textViewerStore, ',
  );
  s = s.replace(/\breaderStore\b/g, 'textViewerStore');
  fs.writeFileSync(file, s);
  console.log('migrated', rel);
}

// read-config-storage
const rcs = path.join(ROOT, 'lib/media/text/read-config-storage.ts');
let s = fs.readFileSync(rcs, 'utf8');
s = s.replace(
  "import type { ReadConfig } from '@/stores/reader';",
  "import type { TextViewerUiConfig as ReadConfig } from '@/lib/media/text/reader-ui-config';",
);
fs.writeFileSync(rcs, s);
console.log('migrated read-config-storage.ts');

// ReaderSettings types from viewer / lib
if (fs.existsSync(settings)) {
  let rs = fs.readFileSync(settings, 'utf8');
  rs = rs.replace(/from '@\/stores\/reader';/g, "from '@/stores/viewer';");
  fs.writeFileSync(settings, rs);
}

console.log('done');
