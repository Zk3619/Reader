import { describe, expect, it } from 'vitest';
import {
  normalizeModuleProxyMode,
  normalizeOutboundProxyMode,
  resolveModuleOutboundProxy,
  resolveOutboundProxyInvocation,
  setRuntimeOutboundProxy,
} from '@/lib/settings/outbound-proxy';

describe('outbound-proxy', () => {
  it('normalizes legacy system to env at shell, follow at module', () => {
    expect(normalizeOutboundProxyMode('system')).toBe('env');
    expect(normalizeModuleProxyMode('system')).toBe('follow');
    expect(normalizeModuleProxyMode('follow')).toBe('follow');
    expect(normalizeModuleProxyMode('windows')).toBe('windows');
  });

  it('resolves shell custom URL for invocations', () => {
    setRuntimeOutboundProxy({ mode: 'custom', url: 'http://127.0.0.1:7890' });
    expect(resolveOutboundProxyInvocation()).toEqual({
      proxy: 'http://127.0.0.1:7890',
      proxyMode: 'custom',
    });
    setRuntimeOutboundProxy({ mode: 'windows', url: '' });
    expect(resolveOutboundProxyInvocation()).toEqual({
      proxy: null,
      proxyMode: 'windows',
    });
  });

  it('lets modules follow or override the shell', () => {
    setRuntimeOutboundProxy({ mode: 'windows', url: '' });
    expect(resolveModuleOutboundProxy({ mode: 'follow' }).proxyMode).toBe('windows');
    expect(
      resolveModuleOutboundProxy({ mode: 'custom', url: 'socks5h://127.0.0.1:1080' }),
    ).toEqual({
      proxy: 'socks5h://127.0.0.1:1080',
      proxyMode: 'custom',
    });
    expect(resolveModuleOutboundProxy({ mode: 'none' }).proxyMode).toBe('none');
  });
});
