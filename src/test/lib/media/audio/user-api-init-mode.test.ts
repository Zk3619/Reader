import { describe, expect, it } from 'vitest';
import {
  selectReadyUserApiScriptIdsForPlayback,
  shouldInitializeUserApiScriptForMode,
} from '@/lib/media/audio/online/user-api-engine';

describe('user api initialization mode', () => {
  it('initializes only the active source in activeOnly mode', () => {
    expect(shouldInitializeUserApiScriptForMode('activeOnly', 'active', 'active')).toBe(true);
    expect(shouldInitializeUserApiScriptForMode('activeOnly', 'other', 'active')).toBe(false);
  });

  it('initializes every enabled candidate in allEnabled mode', () => {
    expect(shouldInitializeUserApiScriptForMode('allEnabled', 'active', 'active')).toBe(true);
    expect(shouldInitializeUserApiScriptForMode('allEnabled', 'other', 'active')).toBe(true);
  });

  it('uses only enabled and ready sources for fallback playback', () => {
    const candidates = [
      { id: 'pending', enabled: true, initStatus: 'pending' as const },
      { id: 'disabled', enabled: false, initStatus: 'ready' as const },
      { id: 'fallback', enabled: true, initStatus: 'ready' as const },
      { id: 'active', enabled: true, initStatus: 'ready' as const },
    ];

    expect(
      selectReadyUserApiScriptIdsForPlayback(candidates, 'active', true),
    ).toEqual(['active', 'fallback']);
    expect(
      selectReadyUserApiScriptIdsForPlayback(candidates, 'active', false),
    ).toEqual(['active']);
  });
});
