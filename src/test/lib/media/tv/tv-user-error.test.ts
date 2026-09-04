import { describe, expect, it } from 'vitest';
import { formatTvUserError } from '@/lib/media/tv/tv-user-error';

describe('formatTvUserError', () => {
  it('does not hide NetworkOnMainThreadException as a generic connectivity failure', () => {
    const msg = formatTvUserError(
      new Error('JAR Spider 调用失败: NetworkOnMainThreadException'),
    );
    expect(msg).not.toMatch(/网络连接失败/);
    expect(msg).toMatch(/主线程|站点引擎/);
  });

  it('maps real fetch failures to 网络连接失败', () => {
    expect(formatTvUserError(new Error('TypeError: Failed to fetch'))).toMatch(
      /网络连接失败/,
    );
    expect(
      formatTvUserError(
        new Error('CLEARTEXT communication to example.com not permitted by network security policy'),
      ),
    ).toMatch(/网络连接失败/);
  });

  it('keeps Guard native errors distinct from network copy', () => {
    const msg = formatTvUserError(
      new Error('JAR Spider 调用失败: UnsatisfiedLinkError: dlopen failed ftyguard_v8.so'),
    );
    expect(msg).not.toMatch(/网络连接失败/);
  });

  it('maps isolated spider process death to a non-crash user message', () => {
    const msg = formatTvUserError(
      new Error('JAR Spider 调用失败: 影视加固库进程已退出（DexNative/ftyguard）'),
    );
    expect(msg).not.toMatch(/网络连接失败/);
    expect(msg).toMatch(/ftyguard|JAR 缓存|Guard|16KB/);
  });

  it('maps crash-fence quarantine to a retry hint', () => {
    const msg = formatTvUserError(
      new Error('JAR Spider 调用失败: 影视 JAR 上次加载导致应用崩溃，已暂时禁用该加固源'),
    );
    expect(msg).not.toMatch(/网络连接失败/);
    expect(msg).toMatch(/暂时禁用|重新尝试/);
  });
});
