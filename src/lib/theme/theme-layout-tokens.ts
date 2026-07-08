/**
 * 布局 token 编辑辅助
 */

import type { LayoutTokens } from '@/lib/theme/types';
import { APP_THEME_LAYOUT_TOKENS } from '@/lib/theme/AppTheme';

export interface LayoutTokenGroup {
  id: string;
  label: string;
  keys: (keyof LayoutTokens)[];
}

export const LAYOUT_TOKEN_GROUPS: LayoutTokenGroup[] = [
  {
    id: 'shell',
    label: '壳层尺寸',
    keys: ['radius', 'appBarHeight', 'mobileSafeTop', 'mobileSafeBottomGesture', 'mobileSafeBottomButtons'],
  },
  {
    id: 'reader',
    label: '阅读器尺寸',
    keys: [
      'readerTopBarHeight',
      'readerBottomBarHeight',
      'readerFooterMaxHeight',
      'readerScrollbarSize',
      'readerBrightnessChromeGap',
    ],
  },
  {
    id: 'motion',
    label: '动效',
    keys: ['readerBarDuration', 'readerBarEasingEnter', 'readerBarEasingExit', 'searchLoopDuration', 'searchLoopMinWidth'],
  },
];

export const LAYOUT_TOKEN_LABELS: Record<keyof LayoutTokens, string> = {
  radius: '圆角 (--radius)',
  appBarHeight: '顶栏高度',
  readerTopBarHeight: '阅读器顶栏',
  readerBottomBarHeight: '阅读器底栏',
  readerFooterMaxHeight: '阅读器页脚最大高度',
  readerScrollbarSize: '滚动条宽度',
  readerBarDuration: '顶底栏动画时长',
  readerBarEasingEnter: '顶底栏进入缓动',
  readerBarEasingExit: '顶底栏退出缓动',
  readerBrightnessChromeGap: '亮度胶囊间距',
  mobileSafeTop: '移动端安全区上',
  mobileSafeBottomGesture: '移动端手势区下',
  mobileSafeBottomButtons: '移动端按钮区下',
  searchLoopDuration: '搜索循环动画',
  searchLoopMinWidth: '搜索循环最小宽度',
};

export const DEFAULT_LAYOUT_TOKEN_VALUES: LayoutTokens = APP_THEME_LAYOUT_TOKENS;
