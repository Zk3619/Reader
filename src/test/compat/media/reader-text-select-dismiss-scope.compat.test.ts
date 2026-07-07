import { describe, expect, it } from 'vitest';
import {
  TEXT_VIEWER_TEXT_SELECT_DISMISS_SCOPE_LABELS,
  defaultTextViewerUiConfig,
  normalizeTextViewerTextSelectDismissScope,
} from '@/lib/media/text/reader-ui-config';

describe('textSelectDismissScope config', () => {
  it('defaults to outsideHandleAndSelection', () => {
    expect(defaultTextViewerUiConfig.textSelectDismissScope).toBe('outsideHandleAndSelection');
  });

  it('normalizes unknown values to outsideHandleAndSelection', () => {
    expect(normalizeTextViewerTextSelectDismissScope(undefined)).toBe('outsideHandleAndSelection');
    expect(normalizeTextViewerTextSelectDismissScope('invalid')).toBe('outsideHandleAndSelection');
  });

  it('preserves outsideHandle', () => {
    expect(normalizeTextViewerTextSelectDismissScope('outsideHandle')).toBe('outsideHandle');
  });

  it('has labels for both scopes', () => {
    expect(TEXT_VIEWER_TEXT_SELECT_DISMISS_SCOPE_LABELS.outsideHandle).toBe('非游标区域');
    expect(TEXT_VIEWER_TEXT_SELECT_DISMISS_SCOPE_LABELS.outsideHandleAndSelection).toBe(
      '非游标及选区区域',
    );
  });
});
