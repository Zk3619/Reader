import { describe, expect, it } from 'vitest';
import { shouldAcceptListPlayGesture } from '@/components/media/viewer/audio/music/hub/list-track-play-gesture';

describe('shouldAcceptListPlayGesture', () => {
  it('mobile always accepts single click only', () => {
    expect(
      shouldAcceptListPlayGesture(false, {
        isMobileLayout: true,
        listDoubleClickToPlay: true,
      }),
    ).toBe(true);
    expect(
      shouldAcceptListPlayGesture(true, {
        isMobileLayout: true,
        listDoubleClickToPlay: true,
      }),
    ).toBe(false);
  });

  it('desktop honors double-click setting', () => {
    expect(
      shouldAcceptListPlayGesture(true, {
        isMobileLayout: false,
        listDoubleClickToPlay: true,
      }),
    ).toBe(true);
    expect(
      shouldAcceptListPlayGesture(false, {
        isMobileLayout: false,
        listDoubleClickToPlay: true,
      }),
    ).toBe(false);
    expect(
      shouldAcceptListPlayGesture(false, {
        isMobileLayout: false,
        listDoubleClickToPlay: false,
      }),
    ).toBe(true);
  });
});
