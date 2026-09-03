import { describe, expect, it } from 'vitest';
import { APP_OVERLAY_BACKDROP_CLASS } from '@/lib/ui/overlay-z';
import layout from '@/components/media/viewer/audio/music/hub/MusicHubMobileLayout.tsx?raw';
import hub from '@/components/media/viewer/audio/music/hub/MusicHubShell.tsx?raw';
import lyric from '@/lib/media/audio/mobile-desktop-lyric.ts?raw';
import windowSrc from '@/lib/media/audio/desktop-lyric-window.ts?raw';
import detail from '@/components/media/viewer/audio/music/hub/MusicPlayDetail.tsx?raw';
import playBar from '@/components/media/viewer/audio/music/hub/MusicHubPlayBar.tsx?raw';
import sheet from '@/components/ui/sheet.tsx?raw';
import drawer from '@/components/media/viewer/audio/music/hub/MusicHubDrawerNav.tsx?raw';

describe('mobile desktop lyric and music chrome', () => {
  it('does not insert an in-page overlay-permission banner', () => {
    expect(layout).not.toMatch(/MusicMobileOverlayGuide/);
    expect(layout).not.toMatch(/需要悬浮窗权限/);
    expect(layout).not.toMatch(/MusicCellularWarningBanner/);
    expect(hub).toMatch(/MobileOverlayPermissionDialog/);
    expect(hub).toMatch(/maybeShowCellularHubWarningToast/);
    expect(hub).not.toMatch(/AndroidOverlayPermissionDialog/);
  });

  it('keeps mobile lyric updates while the app is in foreground', () => {
    expect(lyric).not.toMatch(/appInForeground/);
    expect(lyric).toMatch(/promptMobileOverlayPermission/);
    expect(lyric).toMatch(/supportsMobileOverlayLyric/);
    expect(lyric).toMatch(/resumeMobileDesktopLyricAfterPermissionGranted/);
    expect(lyric).toMatch(/confirmMobileDesktopLyricShown/);
    expect(lyric).toMatch(/document\.hidden/);
    expect(windowSrc).toMatch(/!hasTrack && !useMobileOverlayLyric\(\)/);
    expect(windowSrc).toMatch(/promptMobileOverlayPermission/);
    expect(windowSrc).not.toMatch(/useAndroidOverlay/);
  });

  it('hides mini player on mobile play detail', () => {
    expect(detail).toMatch(
      /Show when=\{isTauri\(\) && !isAndroid\(\) && !isMobile\(\)\}/,
    );
    expect(playBar).toMatch(/Show when=\{isTauri\(\) && !isAndroid\(\) && !isMobile\(\)\}/);
  });

  it('uses AppDialog backdrop for sidebar sheet and music drawer', () => {
    expect(sheet).toMatch(/APP_OVERLAY_BACKDROP_CLASS/);
    expect(sheet).toMatch(/APP_SHELL_SHEET_Z/);
    expect(sheet).not.toMatch(/bg-black\/80/);
    expect(drawer).toMatch(/APP_OVERLAY_BACKDROP_CLASS/);
    expect(APP_OVERLAY_BACKDROP_CLASS).toBe('bg-background/80');
  });
});
