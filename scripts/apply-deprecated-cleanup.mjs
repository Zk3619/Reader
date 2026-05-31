/**
 * 弃用导出清理 + 消费者更新（在 git 恢复损坏文件后重跑）
 */
import fs from 'node:fs';

function patch(file, transforms) {
  if (!fs.existsSync(file)) return;
  let s = fs.readFileSync(file, 'utf8');
  let changed = false;
  for (const [re, to] of transforms) {
    if (!re.test(s)) continue;
    s = s.replace(re, to);
    changed = true;
  }
  if (changed) {
    fs.writeFileSync(file, s, 'utf8');
    console.log('patched', file);
  }
}

const deprecatedRemovals = [
  [
    /\n\/\*\* @deprecated 使用 MediaKind \*\/\nexport type ReaderKind = MediaKind;\n\n/,
    '\n',
  ],
  [
    /\n\/\*\* @deprecated 使用 resolveMediaKind \*\/\nexport function resolveReaderKind[\s\S]*?\n}\n/,
    '\n',
  ],
  [
    /\n\/\*\* @deprecated 使用 resolveContentApiItemId \*\/\nexport function normalizeContentApiItemId[\s\S]*?\n}\n/,
    '\n',
  ],
  [
    /\n\/\*\* @deprecated 使用 normalizeDataUrlPayload \*\/\nexport const normalizeQingtianPayload = normalizeDataUrlPayload;\n\/\*\* @deprecated 使用 normalizeDataUrlPayload \*\/\nexport const normalizeQingtianTocPayload = normalizeDataUrlPayload;\n\n/,
    '\n',
  ],
  [
    /\n\/\*\* @deprecated 使用 evalSearchUrlExpression \*\/\nexport const evalSearchUrlJs = evalSearchUrlExpression;\n/,
    '\n',
  ],
  [
    /\n\/\*\* @deprecated 使用 normalizeLegadoContentImages \*\/\nexport function normalizeLegadoImagesInHtml[\s\S]*?\n}\n/,
    '\n',
  ],
  [
    /\n\/\*\* @deprecated 请优先使用 tryFormatDisplayUpdateTime \*\/\nexport function formatDisplayUpdateTime[\s\S]*?\n}\n/,
    '\n',
  ],
  [
    /\n\/\*\* @deprecated 使用 BOOKSHELF_LAYOUT_GAP_CLASS \*\/\nexport const BOOKSHELF_GRID_GAP_CLASS = BOOKSHELF_LAYOUT_GAP_CLASS;\n/,
    '\n',
  ],
  [
    /\n\/\*\* @deprecated 使用 bindBookshelfLayoutGap \*\/\nexport const bindBookshelfGridGap = bindBookshelfLayoutGap;\n/,
    '\n',
  ],
  [
    /\n\/\*\* @deprecated 使用 estimateBookshelfGridCardHeight[\s\S]*?\nexport function estimateBookshelfGridRowHeight[\s\S]*?\n}\n/,
    '\n',
  ],
  [
    /\n\/\*\* @deprecated 使用 bookshelfCompactCoverClass[\s\S]*?\nexport function bookGroupCompactCoverClass[\s\S]*?\n}\n/,
    '\n',
  ],
  [
    /\n\/\*\* @deprecated 旧标题下拉 id，仅作兼容迁移 \*\/\nexport const SOURCE_FILTER_ENABLED[\s\S]*?export const SOURCE_FILTER_EXPLORE_DISABLED = '__filter:explore_disabled__';\n\n/,
    '\n',
  ],
  [
    /\n\/\*\* @deprecated 使用 shouldGroupSourcesByGroupName \*\/\nexport function isSourceFilterOrAll[\s\S]*?\n}\n/,
    '\n',
  ],
  [
    /\n\/\*\* @deprecated 使用 filterSourcesByCriteria \*\/\nexport function filterSourcesByDialogCriteria[\s\S]*?\n}\n/,
    '\n',
  ],
  [/\n\/\*\* @deprecated 使用 ExplorePage \*\/\nexport const ScoutPage = ExplorePage;\nexport type ScoutPageProps = ExplorePageProps;\n/, '\n'],
  [
    /\n\/\*\* @deprecated 使用 readBytes\(StorageRef\) \*\/\nexport async function readPath[\s\S]*?\n}\n/,
    '\n',
  ],
  [/\n \* @deprecated 优先使用 `readBytes\(parseStorageRef\(bookUrl\)\)`[^\n]*\n/, '\n'],
];

for (const f of [
  'src/lib/book-source/book-type.ts',
  'src/lib/book-source/utils.ts',
  'src/lib/book-source/search-script-runner.ts',
  'src/lib/js-engine/legado/parse-legado-url-options.ts',
  'src/lib/format/display-time.ts',
  'src/lib/bookshelf/bookshelf-layout-gap.ts',
  'src/lib/bookshelf/bookshelf-grid-row-height.ts',
  'src/lib/bookshelf/book-group-card-styles.ts',
  'src/lib/sources/source-list-filter.ts',
  'src/pages/explore/ExplorePage.tsx',
  'src/lib/platform/fs/read-write.ts',
  'src/lib/platform/filesystem.ts',
]) {
  patch(f, deprecatedRemovals);
}

patch('src/lib/sources/source-list-filter.ts', [
  [/return SOURCE_FILTER_EXPLORE_ENABLED;/g, "return '__filter:explore_enabled__';"],
  [/return SOURCE_FILTER_EXPLORE_DISABLED;/g, "return '__filter:explore_disabled__';"],
]);

patch('src/stores/explore-page-layout.ts', [
  [
    /\/\*\* @deprecated 旧版单选样式，仅用于迁移 \*\/\ntype LegacySourceNavStyle/,
    '/** 旧版单选样式，仅用于迁移 */\ntype LegacySourceNavStyle',
  ],
]);

patch('src/components/explore/ExploreSourcePageContent.tsx', [
  [/ScoutPage \/ ExploreSourcePage/, 'ExploreSourcePage'],
]);

patch('src/components/bookshelf/BookshelfCacheBookCard.tsx', [
  [
    /import \{\n  bookGroupCompactCardClass,\n  bookGroupCompactCoverClass,\n\} from '@\/lib\/bookshelf\/book-group-card-styles';/,
    `import {
  bookGroupCompactCardClass,
  bookshelfCompactCoverClass,
} from '@/lib/bookshelf/book-group-card-styles';`,
  ],
  [/bookGroupCompactCoverClass/g, 'bookshelfCompactCoverClass'],
]);

patch('src/components/sources/SourceLoginDialog.tsx', [
  [
    /import \{ showAppToast, showScriptToast \} from '@\/components\/shared\/AppToasts';/,
    "import { showAppToast, normalizeScriptToastText } from '@/components/shared/AppToasts';",
  ],
  [
    /showScriptToast\(text\);/,
    `showAppToast({
        description: normalizeScriptToastText(text),
        script: true,
        variant: 'plain',
        id: 'reader-script-toast',
      });`,
  ],
]);

// AppToasts
let toasts = fs.readFileSync('src/components/shared/AppToasts.tsx', 'utf8');
toasts = toasts.replace(
  /function resolveProgress\(\n  progress: ToastProgressInput \| undefined,\n  showProgress: boolean \| undefined,\n  duration: number,\n\): ResolvedToastProgress \| null \{\n  if \(progress === undefined \|\| progress === false\) \{\n    if \(!showProgress\) return null\n    return \{ mode: "duration", ms: duration \}\n  \}/,
  `function resolveProgress(
  progress: ToastProgressInput | undefined,
  duration: number,
): ResolvedToastProgress | null {
  if (progress === undefined || progress === false) {
    return null
  }`,
);
toasts = toasts.replace(
  /\n\/\*\*\n \* 书源脚本 longToast[\s\S]*?export function showScriptToast[\s\S]*?\n}\n\n/,
  '\n',
);
toasts = toasts.replace(/\n  \/\*\* @deprecated 使用 progress: true \*\/\n  showProgress\?: boolean\n/, '\n');
toasts = toasts.replace(/resolveProgress\(props\.progress, props\.showProgress, /g, 'resolveProgress(props.progress, ');
fs.writeFileSync('src/components/shared/AppToasts.tsx', toasts);
console.log('patched AppToasts.tsx');

patch('src/test/vitest.setup.ts', [[/  showScriptToast: vi\.fn\(\),\n/, '']]);

patch('src/test/compat/platform/inner-web-presentation.compat.test.ts', [
  [
    /resolveInnerWebPresentation\(\{ layout: 'sheet', sheetHeight: '60vh' \}, \{\}\)/,
    "resolveInnerWebPresentation({ layout: 'sheet', drawer: { side: 'bottom', size: '60vh' } }, {})",
  ],
]);

patch('src/app/App.tsx', [[/showProgress: true/g, 'progress: true']]);

// inner-web presentation legacy sheet
let inner = fs.readFileSync('src/lib/platform/inner-web-presentation.ts', 'utf8');
inner = inner.replace(
  /\n\/\*\* @deprecated 使用 layout: 'drawer' \+ drawer\.side: 'bottom' \*\/\nexport type InnerWebLegacySheetLayout = 'sheet';\n\n/,
  '\n',
);
inner = inner.replace(/\n  \/\*\* @deprecated 使用 drawer\.size \*\/\n  sheetHeight\?: string;\n/, '\n');
inner = inner.replace(
  /  layout\?: InnerWebLayoutMode \| InnerWebLegacySheetLayout;/,
  "  layout?: InnerWebLayoutMode | 'sheet';",
);
inner = inner.replace(
  /function defaultDrawerSize[\s\S]*?if \(merged\.sheetHeight[\s\S]*?return merged\.sheetHeight;\n  }\n  if \(merged\.drawer\?\.size\)/,
  'function defaultDrawerSize(side: InnerWebDrawerSide, merged: InnerWebPresentation): string {\n  if (merged.drawer?.size)',
);
fs.writeFileSync('src/lib/platform/inner-web-presentation.ts', inner);
console.log('patched inner-web-presentation.ts');

// readerStore -> textViewerStore in text viewer components
for (const f of [
  'src/components/viewer/text-viewer/ReaderSearchDrawer.tsx',
  'src/components/viewer/text-viewer/ReaderMoreMenu.tsx',
]) {
  patch(f, [
    [/from '@\/stores\/reader'/g, "from '@/stores/viewer'"],
    [/import \{ readerStore \}/g, 'import { textViewerStore }'],
    [/readerStore/g, 'textViewerStore'],
  ]);
}

console.log('deprecated cleanup complete');
