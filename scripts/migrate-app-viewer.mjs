/**
 * 将 App.tsx 从 git HEAD（mediaReaderStore + readerStore）迁移到 viewerStore。
 * 在恢复 App.tsx 中文后运行。
 */
import fs from 'node:fs';

let s = fs.readFileSync('src/app/App.tsx', 'utf8');

s = s.replace(
  /import \{ mediaReaderStore \} from "@\/stores\/media-viewer";\n/,
  '',
);
s = s.replace(
  /import \{ readerStore \} from "@\/stores\/reader";\n/,
  'import { textViewerStore, viewerStore } from "@/stores/viewer";\n',
);
s = s.replace(/\bmediaReaderStore\b/g, 'viewerStore');

// readerStore：文本阅读与 guest/switchToText 等仍走 textViewerStore
const readerToText = [
  'readerStore.setBookInitialState',
  'readerStore.openBook',
  'readerStore.loadChapter',
  'readerStore.closeBook',
  'readerStore.state.book',
  'readerStore.state.catalog',
  'readerStore.isGuestReading',
  'textViewerStore.state.book', // idempotent
];

// 先处理 text 专用 API
s = s.replace(/\breaderStore\.setBookInitialState\b/g, 'textViewerStore.setBookInitialState');
s = s.replace(/\breaderStore\.openBook\b/g, 'textViewerStore.openBook');
s = s.replace(/\breaderStore\.loadChapter\b/g, 'textViewerStore.loadChapter');
s = s.replace(/\breaderStore\.closeBook\b/g, 'textViewerStore.closeBook');
s = s.replace(/\breaderStore\.isGuestReading\b/g, 'textViewerStore.isGuestReading');

// state.book / catalog 在 text viewer 上下文
s = s.replace(/\breaderStore\.state\b/g, 'textViewerStore.state');

// 若仍有裸 readerStore
s = s.replace(/\breaderStore\b/g, 'textViewerStore');

fs.writeFileSync('src/app/App.tsx', s);
console.log('App.tsx migrated to viewerStore');
