import { describe, expect, it, vi } from 'vitest';
import {
  isJa3RequiredIeKey,
  isTlsImpersonateBuild,
  unsupportedJa3SiteMessage,
} from '@/lib/download/ytdlp/networking/ja3-sites';

describe('ja3-sites policy', () => {
  it('lists xhamster / wsj as JA3-required', () => {
    expect(isJa3RequiredIeKey('XHamster')).toBe(true);
    expect(isJa3RequiredIeKey('wsj')).toBe(true);
    expect(isJa3RequiredIeKey('Tube8')).toBe(false);
    expect(isJa3RequiredIeKey('ZDFChannel')).toBe(false);
  });

  it('allows JA3 sites when TLS impersonate env is on (default)', () => {
    expect(isTlsImpersonateBuild()).toBe(true);
    expect(unsupportedJa3SiteMessage('XHamster')).toBeNull();
    expect(unsupportedJa3SiteMessage('Tube8')).toBeNull();
  });

  it('blocks JA3 sites when VITE_YTDLP_TLS_IMPERSONATE=0', () => {
    vi.stubEnv('VITE_YTDLP_TLS_IMPERSONATE', '0');
    expect(isTlsImpersonateBuild()).toBe(false);
    const msg = unsupportedJa3SiteMessage('XHamster');
    expect(msg).toMatch(/VITE_YTDLP_TLS_IMPERSONATE=0/);
    expect(unsupportedJa3SiteMessage('Tube8')).toBeNull();
    vi.unstubAllEnvs();
  });
});
