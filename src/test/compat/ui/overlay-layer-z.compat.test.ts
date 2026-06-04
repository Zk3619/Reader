import { describe, expect, it } from 'vitest';
import {
  APP_DIALOG_Z,
  APP_OVERLAY_LAYER_Z,
  APP_OVERLAY_VIEWER_Z,
  MEDIA_VIEWER_OVERLAY_LAYER_Z,
} from '@/lib/ui/overlay-z';

function zNum(tw: string): number {
  const m = tw.match(/\[(\d+)\]/);
  return m ? Number(m[1]) : Number(tw.replace(/\D/g, '')) || 0;
}

describe('overlay layer z-index bands', () => {
  it('media viewer poppers and dialogs sit above viewer shell', () => {
    const shell = zNum(APP_OVERLAY_VIEWER_Z);
    expect(zNum(MEDIA_VIEWER_OVERLAY_LAYER_Z.drawer)).toBeGreaterThan(shell);
    expect(zNum(MEDIA_VIEWER_OVERLAY_LAYER_Z.dialog)).toBeGreaterThan(shell);
    expect(zNum(MEDIA_VIEWER_OVERLAY_LAYER_Z.popper)).toBeGreaterThan(shell);
  });

  it('media viewer content z is above matching backdrop', () => {
    expect(zNum(MEDIA_VIEWER_OVERLAY_LAYER_Z.drawer)).toBeGreaterThan(
      zNum(MEDIA_VIEWER_OVERLAY_LAYER_Z.drawerOverlay),
    );
    expect(zNum(MEDIA_VIEWER_OVERLAY_LAYER_Z.dialog)).toBeGreaterThan(
      zNum(MEDIA_VIEWER_OVERLAY_LAYER_Z.dialogOverlay),
    );
  });

  it('app layer keeps dialog content below viewer shell (viewer uses media layer)', () => {
    expect(zNum(APP_OVERLAY_LAYER_Z.dialogOverlay)).toBe(zNum(APP_DIALOG_Z));
    expect(zNum(APP_OVERLAY_LAYER_Z.dialog)).toBeLessThan(zNum(APP_OVERLAY_VIEWER_Z));
  });
});
