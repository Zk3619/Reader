import { describe, expect, it } from 'vitest';
import {
  activeReaderBgSlot,
  normalizeLegadoBgFileName,
  readerBgStrForBackup,
  readerPageBackgroundStyle,
  setActiveReaderBgSlot,
} from '@/lib/media/text/reader-background';
import { defaultTextViewerUiConfig } from '@/lib/media/text/reader-ui-config';

describe('reader-background', () => {
  it('uses night slot on night theme', () => {
    const config = {
      ...defaultTextViewerUiConfig,
      theme: 6,
      bgTypeNight: 2 as const,
      bgStrNight: 'night.jpg',
    };
    expect(activeReaderBgSlot(config).bgStr).toBe('night.jpg');
  });

  it('normalizes legado bg path to file name', () => {
    expect(normalizeLegadoBgFileName('/storage/bg/foo.png')).toBe('foo.png');
    expect(readerBgStrForBackup('/storage/bg/foo.png', 2)).toBe('foo.png');
  });

  it('builds color background style from theme palette', () => {
    const style = readerPageBackgroundStyle(
      { ...defaultTextViewerUiConfig, bgType: 0, bgStr: '#abcdef' },
      null,
    );
    expect(style['background-color']).toBe('#f5f0e6');
  });

  it('patches day vs night bg fields', () => {
    const day = setActiveReaderBgSlot(
      { ...defaultTextViewerUiConfig, theme: 0 },
      { bgType: 1, bgStr: 'paper.svg' },
    );
    expect(day.bgType).toBe(1);
    expect(day.bgStr).toBe('paper.svg');

    const night = setActiveReaderBgSlot(
      { ...defaultTextViewerUiConfig, theme: 6 },
      { bgType: 2, bgStr: 'custom.jpg' },
    );
    expect(night.bgTypeNight).toBe(2);
    expect(night.bgStrNight).toBe('custom.jpg');
  });
});
