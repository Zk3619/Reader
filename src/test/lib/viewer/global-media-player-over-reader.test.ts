import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { APP_GLOBAL_MEDIA_PLAYER_OVER_VIEWER_Z, APP_OVERLAY_VIEWER_Z } from '@/lib/ui/overlay-z';
import {
  globalMediaPlayerOverReaderBottomClass,
  globalMediaPlayerOverReaderTopClass,
} from '@/lib/viewer/media-player-chrome-layout';

describe('global media player over reader', () => {
  it('defines z-index above viewer overlay and below book-info drawer band', () => {
    const viewer = Number(APP_OVERLAY_VIEWER_Z.match(/\d+/)?.[0]);
    const player = Number(APP_GLOBAL_MEDIA_PLAYER_OVER_VIEWER_Z.match(/\d+/)?.[0]);
    expect(player).toBeGreaterThan(viewer);
    expect(player).toBeLessThan(115);
  });

  it('offsets away from reader chrome with safe-area', () => {
    expect(globalMediaPlayerOverReaderBottomClass).toMatch(/safe-area-inset-bottom/);
    expect(globalMediaPlayerOverReaderTopClass).toMatch(/safe-area-inset-top/);
    expect(globalMediaPlayerOverReaderBottomClass).toMatch(/5\.75rem/);
  });

  it('allows audio player over text/image viewers only', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/components/shell/GlobalMediaPlayer.tsx'),
      'utf8',
    );
    expect(src).toMatch(/'text-viewer'/);
    expect(src).toMatch(/'image-viewer'/);
    expect(src).toMatch(/allowOverTextOrImageReader/);
    expect(src).toMatch(/APP_GLOBAL_MEDIA_PLAYER_OVER_VIEWER_Z/);
    expect(src).not.toMatch(/OVERLAY_KINDS_ALLOW_AUDIO_PLAYER = new Set[\s\S]*'audio-viewer'/);
  });

  it('forces floating layout and high-z collapsed chip over text/image', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/components/shell/GlobalMediaPlayer.tsx'),
      'utf8',
    );
    expect(src).toMatch(/effectiveLayout/);
    expect(src).toMatch(/overReader\(\) \? 'floating'/);
    expect(src).toMatch(/playerZClass/);
    expect(src).toMatch(/collapsedChromeClass/);
    expect(src).not.toMatch(/'fixed z-48 right-0/);
  });

  it('uses inline left/right for fixed/stacked bar width (not dynamic Tailwind left class)', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/components/shell/GlobalMediaPlayer.tsx'),
      'utf8',
    );
    expect(src).toMatch(/shellMediaPlayerBarInsetStyle/);
    expect(src).toMatch(/shellMainLeft/);
    expect(src).not.toMatch(/shellMainLeftClass/);
  });
});
