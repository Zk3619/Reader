import { describe, expect, it } from 'vitest';

import {
  APP_GMP_FIXED_BOTTOM_VAR,
  APP_GMP_FIXED_TOP_VAR,
  appGmpFixedInsetCssVars,
  QUICK_SCROLL_GMP_BOTTOM_OFFSET_STYLE,
} from '@/lib/viewer/media-player-chrome-layout';
import appSrc from '@/app/App.tsx?raw';
import buttonsSrc from '@/components/shell/QuickScrollButtons.tsx?raw';
import hubSrc from '@/components/media/viewer/audio/music/hub/MusicHubQuickScroll.tsx?raw';

describe('quick scroll vs fixed global media player', () => {
  it('exposes CSS vars matching the same inset used for main-content padding', () => {
    expect(
      appGmpFixedInsetCssVars({ top: false, bottom: true, heightPx: 76 }),
    ).toEqual({
      [APP_GMP_FIXED_BOTTOM_VAR]: '76px',
      [APP_GMP_FIXED_TOP_VAR]: '0px',
    });
    expect(
      appGmpFixedInsetCssVars({ top: true, bottom: false, heightPx: 88 }),
    ).toEqual({
      [APP_GMP_FIXED_BOTTOM_VAR]: '0px',
      [APP_GMP_FIXED_TOP_VAR]: '88px',
    });
    expect(
      appGmpFixedInsetCssVars({ top: false, bottom: false, heightPx: 76 }),
    ).toEqual({
      [APP_GMP_FIXED_BOTTOM_VAR]: '0px',
      [APP_GMP_FIXED_TOP_VAR]: '0px',
    });
  });

  it('lifts bottom-fixed controls with margin so bottom-* classes still apply', () => {
    expect(QUICK_SCROLL_GMP_BOTTOM_OFFSET_STYLE['margin-bottom']).toBe(
      `var(${APP_GMP_FIXED_BOTTOM_VAR}, 0px)`,
    );
  });

  it('wires the vars from App into QuickScrollButtons without replacing Hub PlayBar lift', () => {
    expect(appSrc).toMatch(/appGmpFixedInsetCssVars\(mediaPlayerFixedInset\(\)\)/);
    expect(buttonsSrc).toMatch(/QUICK_SCROLL_GMP_BOTTOM_OFFSET_STYLE/);
    expect(buttonsSrc).toMatch(/showBottomBar \? 'bottom-20' : 'bottom-8'/);
    expect(hubSrc).toMatch(/bottom-20 z-110/);
  });
});
