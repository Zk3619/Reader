import fs from 'node:fs';

function writeUtf8(path, content) {
  fs.writeFileSync(path, content, 'utf8');
}

writeUtf8(
  'src/lib/media/text/reader-ui-config.ts',
  `/**
 * Text Viewer UI \u914d\u7f6e\u7c7b\u578b\u4e0e\u9ed8\u8ba4\u503c\uff08\u5bf9\u9f50 Legado ReadBookConfig\uff09
 * \u4e0e\u4e66\u7c4d\u7ea7 types/book.ReadConfig\uff08reverseToc \u7b49\uff09\u4e0d\u540c\uff0c\u52ff\u6df7\u7528\u3002
 */

import { DEFAULT_CLICK_ACTIONS } from '@/lib/media/text/reader-click-actions';
import { DEFAULT_CLICK_REGION } from '@/lib/media/text/reader-click-region';
import type { ReadAloudEngine } from '@/lib/media/text/read-aloud';
import type { ReaderClickActions } from '@/lib/media/text/reader-click-actions';
import type { ReaderClickRegion } from '@/lib/media/text/reader-click-region';

export type TextViewerPageAnim = 'scroll' | 'cover' | 'slide' | 'none';
export type TextViewerDualPageMode = 'off' | 'auto' | 'always';
export type TextViewerImageStyle = 'DEFAULT' | 'FULL' | 'TEXT' | 'SINGLE';

export interface TextViewerUiConfig {
  theme: number;
  font: number;
  fontSize: number;
  readWidth: number;
  infiniteLoading: boolean;
  customFontName: string;
  jumpDuration: number;
  spacing: {
    paragraph: number;
    line: number;
    letter: number;
  };
  contentInset: {
    left: number;
    right: number;
    center: number;
  };
  statusBarDisplayStyle: 'follow' | 'always' | 'never';
  pageAnim: TextViewerPageAnim;
  dualPage: TextViewerDualPageMode;
  volumeKeyTurnPage: boolean;
  clickActions: ReaderClickActions;
  clickRegion: ReaderClickRegion;
  aloudEngine: ReadAloudEngine;
  httpTtsId: number | null;
  speakSpeed: number;
  imageStyle: TextViewerImageStyle;
}

export const defaultTextViewerUiConfig: TextViewerUiConfig = {
  theme: 0,
  font: 0,
  fontSize: 18,
  readWidth: 800,
  infiniteLoading: false,
  customFontName: '',
  jumpDuration: 1000,
  spacing: { paragraph: 1, line: 0.8, letter: 0 },
  contentInset: { left: 16, right: 16, center: 32 },
  statusBarDisplayStyle: 'follow',
  pageAnim: 'scroll',
  dualPage: 'auto',
  volumeKeyTurnPage: true,
  clickActions: { ...DEFAULT_CLICK_ACTIONS },
  clickRegion: {
    xSplits: [...DEFAULT_CLICK_REGION.xSplits] as [number, number],
    ySplits: [...DEFAULT_CLICK_REGION.ySplits] as [number, number],
  },
  aloudEngine: 'system',
  httpTtsId: null,
  speakSpeed: 5,
  imageStyle: 'DEFAULT',
};
`,
);

writeUtf8(
  'src/test/compat/platform/inner-web-presentation.compat.test.ts',
  `import { describe, expect, it } from 'vitest';
import {
  createInnerWebPresentation,
  innerWebDrawerPanelStyle,
  INNER_WEB_PRESETS,
  resolveInnerWebPresentation,
} from '@/lib/platform/inner-web-presentation';

describe('resolveInnerWebPresentation', () => {
  it('default \u4e3a\u5168\u5c4f\u3001\u65e0\u906e\u7f69', () => {
    const r = resolveInnerWebPresentation(undefined, {});
    expect(r.layout).toBe('fullscreen');
    expect(r.backdrop.visible).toBe(false);
    expect(r.animation).toBe('fade');
  });

  it('paragraph-review \u9884\u8bbe\u4e3a\u5e95\u90e8\u62bd\u5c49', () => {
    const r = resolveInnerWebPresentation({ preset: 'paragraph-review' }, { showConfirm: true });
    expect(r.layout).toBe('drawer');
    expect(r.drawer.side).toBe('bottom');
    expect(r.drawer.size).toBe('72dvh');
    expect(r.drawer.showNativeDragHandle).toBe(false);
    expect(r.drawer.dragToDismiss).toBe(true);
    expect(r.backdrop.visible).toBe(true);
    expect(r.header.showConfirm).toBe(false);
    expect(r.animation).toBe('none');
  });

  it('layout sheet \u517c\u5bb9\u6620\u5c04\u4e3a drawer bottom', () => {
    const r = resolveInnerWebPresentation(
      { layout: 'sheet', drawer: { side: 'bottom', size: '60vh' } },
      {},
    );
    expect(r.layout).toBe('drawer');
    expect(r.drawer.side).toBe('bottom');
    expect(r.drawer.size).toBe('60vh');
  });

  it('\u56db\u5411 drawer \u4e0e\u5c3a\u5bf8', () => {
    const left = resolveInnerWebPresentation(
      { layout: 'drawer', drawer: { side: 'left', size: '400px' } },
      {},
    );
    expect(left.drawer.side).toBe('left');
    expect(left.drawer.size).toBe('400px');
    expect(innerWebDrawerPanelStyle(left.drawer).width).toBe('400px');

    const top = resolveInnerWebPresentation(
      { layout: 'drawer', drawer: { side: 'top', size: '50vh' } },
      {},
    );
    expect(top.drawer.side).toBe('top');
    expect(innerWebDrawerPanelStyle(top.drawer)).toBeUndefined();
  });

  it('\u53ef\u5173\u95ed\u62d6\u62fd\u6761\u4e0e\u62d6\u62fd\u5173\u95ed', () => {
    const r = resolveInnerWebPresentation(
      {
        layout: 'drawer',
        drawer: { showNativeDragHandle: false, dragToDismiss: false },
      },
      {},
    );
    expect(r.drawer.showNativeDragHandle).toBe(false);
    expect(r.drawer.dragToDismiss).toBe(false);
  });

  it('center \u6a21\u5f0f\u9ed8\u8ba4\u663e\u793a\u906e\u7f69', () => {
    const r = resolveInnerWebPresentation({ layout: 'center' }, {});
    expect(r.layout).toBe('center');
    expect(r.backdrop.visible).toBe(true);
    expect(r.backdrop.dismissOnClick).toBe(true);
  });

  it('createInnerWebPresentation \u7edf\u4e00 preset API', () => {
    const p = createInnerWebPresentation(INNER_WEB_PRESETS.paragraphReview);
    expect(p.preset).toBe('paragraph-review');
    const r = resolveInnerWebPresentation(p, {});
    expect(r.layout).toBe('drawer');
    expect(r.drawer.showNativeDragHandle).toBe(false);
  });
});
`,
);

const iwpPath = 'src/lib/platform/inner-web-presentation.ts';
let iwp = fs.readFileSync(iwpPath, 'utf8');
if (iwp.includes('???') || iwp.includes('\uFFFD')) {
  iwp = iwp
    .replace(/^\/\*\*[\s\S]*?\*\//, '/**\n * Inner-Web \u6d6e\u5c42\u5c55\u793a\u914d\u7f6e\uff1a\u5168\u5c4f / \u56db\u5411\u62bd\u5c49 / \u5c45\u4e2d\u5361\u7247\u3001\u9876\u680f\u3001\u906e\u7f69\u3001\u52a8\u753b\u7b49\u3002\n */')
    .replace(
      /\/\*\* \S+ \*\/\n  side\?:/,
      '/** \u62bd\u5c49\u9644\u7740\u8fb9\uff08\u9ed8\u8ba4 bottom\uff09 */\n  side?:',
    )
    .replace(
      /\/\*\* bottom\/top \S+ \*\/\n  size\?:/,
      '/** bottom/top \u4e3a\u9ad8\u5ea6\uff0cleft/right \u4e3a\u5bbd\u5ea6 */\n  size?:',
    )
    .replace(
      /\/\*\* \S+ showNativeDragHandle\S+ \*\/\n  showNativeDragHandle/,
      '/** \u663e\u793a\u62d6\u52a8\u624b\u67c4\u6761\uff08\u5bf9\u9f50 AppDrawer showNativeDragHandle\uff0c\u9ed8\u8ba4 false\uff09 */\n  showNativeDragHandle',
    )
    .replace(
      /\/\*\* \S+ snap \S+ \*\/\n  dragToDismiss/,
      '/** \u62d6\u62fd\u5173\u95ed / \u6ed1\u81f3 snap 0\uff08\u9ed8\u8ba4 true\uff09 */\n  dragToDismiss',
    )
    .replace(
      /\/\*\* \S+ preset \S+ \*\/\nexport function resolveInnerWebPresentation/,
      '/** \u5408\u5e76 preset + \u8c03\u7528\u65b9 overrides + payload \u9ed8\u8ba4\u503c */\nexport function resolveInnerWebPresentation',
    )
    .replace(
      /\/\*\* \S+ drawer \S+ inline style\S+ \*\/\nexport function innerWebDrawerHeightClass/,
      '/** \u4fa7\u680f drawer \u5bbd\u5ea6\u7b49\u4ecd\u7528 inline style\uff1b\u5e95/\u9876\u62bd\u5c49\u9ad8\u5ea6\u7528\u9759\u6001 Tailwind class\uff08\u4e0e\u9605\u8bfb\u8bbe\u7f6e hDrawerPanel \u540c\u6a21\u5f0f\uff09 */\nexport function innerWebDrawerHeightClass',
    )
    .replace(
      /\/\*\* drawer \S+ inline style\S+ \*\/\nexport function innerWebDrawerPanelStyle/,
      '/** drawer \u9762\u677f\u5c3a\u5bf8 inline style\uff08\u4f9b\u4fa7\u680f AppDrawerContent\uff09 */\nexport function innerWebDrawerPanelStyle',
    )
    .replace(
      /\/\*\* \S+ preset \S+ API \S+ \*\/\nexport const INNER_WEB_PRESETS/,
      '/** \u5185\u7f6e preset \u540d\u79f0\uff08\u7edf\u4e00 API \u5165\u53e3\uff09 */\nexport const INNER_WEB_PRESETS',
    )
    .replace(
      /\/\*\* \S+presentation\S+ \*\/\nexport function createInnerWebPresentation/,
      '/** \u6784\u9020 presentation\uff08preset + \u53ef\u9009\u8986\u76d6\uff09 */\nexport function createInnerWebPresentation',
    );
  writeUtf8(iwpPath, iwp);
}

const viPath = 'src/stores/viewer/index.ts';
let vi = fs.readFileSync(viPath, 'utf8');
if (vi.includes('???') || vi.includes('\uFFFD')) {
  vi = vi.replace(
    /^\/\*\*[\s\S]*?\*\//,
    `/**
 * Viewer \u72b6\u6001\u7ba1\u7406\uff08MediaKind: text / image / audio / video / file\uff09
 *
 * \u7ed3\u6784\uff1amedia/ \u4e3a\u9876\u7ea7\u6a21\u5757\uff0c\u4e0b\u8bbe text / image / audio / video / file \u4e94\u4e2a\u5b50\u6a21\u5757
 * UI \u914d\u7f6e\u7c7b\u578b\u89c1 @/lib/media/text/reader-ui-config
 */`,
  );
  writeUtf8(viPath, vi);
}

// text.ts remaining broken comments
const textPath = 'src/stores/viewer/media/text.ts';
let text = fs.readFileSync(textPath, 'utf8');
const textPatches = [
  [/文本 Viewer 专用 Actions[^\n]+\n/, ' * 文本 Viewer 专用 Actions（共享 open/close/save 与 viewerStore）\n'],
  [/\/\*\* 获取状\S+ \*\//, '/** 获取状态 */'],
  [/设置书籍初始状态[^\n]+\n/, '   * 设置书籍初始状态（用于立即显示 skeleton）\n'],
  [/渐进目录更新[^\n]+\n/, '   * 渐进目录更新（对齐 Legado ReadBook.onChapterListUpdated）\n'],
  [/preserveContent=true[^\n]+\n/, '   * preserveContent=true 时只刷新目录，不重载正文\n'],
  [/\* 下一\S+/, '* 下一章'],
  [/\* 上一\S+/, '* 上一章'],
  [/跳转到指定\S+/, '跳转到指定章节'],
  [/重置阅读配置为默认\S+/, '重置阅读配置为默认值'],
  [/仅重\S+display processing/, '仅重跑 display processing'],
  [/用当前缓\S+raw/, '用当前缓存 raw'],
  [/不触发网络\S+/, '不触发网络）'],
];
for (const [re, rep] of textPatches) {
  text = text.replace(re, rep);
}
writeUtf8(textPath, text);

console.log('utf8 comment fixes done');
