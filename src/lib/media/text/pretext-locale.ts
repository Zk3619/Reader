/**
 * Pretext locale / word-break 与 Reader 配置联动
 */

import { setLocale } from '@chenglou/pretext';
import type { PrepareOptions } from '@chenglou/pretext';
import type { TextViewerUiConfig } from '@/lib/media/text/reader-ui-config';

let activeLocale: string | undefined;

export function syncPretextLocaleFromConfig(config: Pick<TextViewerUiConfig, 'useZhLayout'>): void {
  const next = config.useZhLayout ? 'zh' : undefined;
  if (next === activeLocale) return;
  activeLocale = next;
  setLocale(next);
}

export function pretextPrepareOptions(
  config: Pick<TextViewerUiConfig, 'useZhLayout' | 'spacing'>,
): PrepareOptions {
  syncPretextLocaleFromConfig(config);
  const options: PrepareOptions = {};
  if (config.useZhLayout) {
    options.wordBreak = 'keep-all';
  }
  const letterSpacing = config.spacing.letter;
  if (Number.isFinite(letterSpacing) && letterSpacing > 0) {
    options.letterSpacing = letterSpacing;
  }
  return options;
}
