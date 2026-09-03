import { describe, expect, it } from 'vitest';
import helper from '@/lib/navigation/media-hub-back-layers.ts?raw';
import app from '@/app/App.tsx?raw';

describe('collectMediaHubBackLayers', () => {
  it('registers music play-detail and related hub pages', () => {
    expect(helper).toMatch(/id: 'music-now-playing'/);
    expect(helper).toMatch(/id: 'music-songlist-detail'/);
    expect(helper).toMatch(/id: 'music-browse'/);
    expect(helper).toMatch(/id: 'tv-play'/);
    expect(helper).toMatch(/id: 'tv-detail'/);
  });

  it('is wired into the app back stack', () => {
    expect(app).toMatch(/collectMediaHubBackLayers/);
    expect(app).toMatch(/musicShell: isMusicShellPage\(\)/);
  });
});
