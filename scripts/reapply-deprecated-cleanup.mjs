import fs from 'node:fs';

function patch(file, transforms) {
  let s = fs.readFileSync(file, 'utf8');
  for (const [re, to] of transforms) {
    if (!re.test(s)) console.warn('MISSING', file, re);
    s = s.replace(re, to);
  }
  fs.writeFileSync(file, s, 'utf8');
  console.log('patched', file);
}

patch('src/lib/sources/source-list-filter.ts', [
  [
    /\n\/\*\* @deprecated 旧标题下拉 id，仅作兼容迁移 \*\/\nexport const SOURCE_FILTER_ENABLED = '__filter:enabled__';\nexport const SOURCE_FILTER_DISABLED = '__filter:disabled__';\nexport const SOURCE_FILTER_NEED_LOGIN = '__filter:need_login__';\nexport const SOURCE_FILTER_UNGROUPED = '__filter:ungrouped__';\nexport const SOURCE_FILTER_EXPLORE_ENABLED = '__filter:explore_enabled__';\nexport const SOURCE_FILTER_EXPLORE_DISABLED = '__filter:explore_disabled__';\n\n/,
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
  [
    /return SOURCE_FILTER_EXPLORE_ENABLED;/g,
    "return '__filter:explore_enabled__';",
  ],
  [
    /return SOURCE_FILTER_EXPLORE_DISABLED;/g,
    "return '__filter:explore_disabled__';",
  ],
]);

patch('src/pages/explore/ExplorePage.tsx', [
  [/\n\/\*\* @deprecated 使用 ExplorePage \*\/\nexport const ScoutPage = ExplorePage;\nexport type ScoutPageProps = ExplorePageProps;\n/, '\n'],
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

console.log('all done');
