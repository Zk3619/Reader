import { describe, expect, it } from 'vitest';
import {
  allocateScriptNoticeToastId,
  createLoginScriptNoticeBus,
  createScriptNoticeBus,
  normalizeScriptNoticeMessage,
  parseScriptNoticeFromHtml,
} from '@/lib/book-source/rate-limit-guard';

describe('parseScriptNoticeFromHtml', () => {
  it('classifies rate_limit from alert', () => {
    const html = '<script>alert("搜索间隔: 30 秒");</script>';
    expect(parseScriptNoticeFromHtml(html)).toEqual({
      kind: 'rate_limit',
      message: '搜索间隔: 30 秒',
    });
  });

  it('classifies info from non-throttle toast', () => {
    const html = '<script>java.toast("加载完成");</script>';
    expect(parseScriptNoticeFromHtml(html)).toEqual({
      kind: 'info',
      message: '加载完成',
    });
  });

  it('strips html and truncates long messages', () => {
    const long = 'a'.repeat(200);
    const msg = normalizeScriptNoticeMessage(`<b>${long}</b>`);
    expect(msg.length).toBeLessThanOrEqual(123);
    expect(msg.endsWith('...')).toBe(true);
  });
});

describe('allocateScriptNoticeToastId', () => {
  it('returns unique ids for stacking', () => {
    const a = allocateScriptNoticeToastId('发现');
    const b = allocateScriptNoticeToastId('发现');
    expect(a).not.toBe(b);
    expect(a.startsWith('reader-script-notice:发现:')).toBe(true);
  });
});

describe('createScriptNoticeBus', () => {
  it('blocks only on rate_limit', () => {
    const bus = createScriptNoticeBus('测试源', '搜索');
    expect(bus.shouldBlockOnNotice({ kind: 'rate_limit', message: '请稍后' })).toBe(true);
    expect(bus.shouldBlockOnNotice({ kind: 'info', message: '提示' })).toBe(false);
    expect(bus.shouldBlockOnNotice({ kind: 'warning', message: '警告' })).toBe(false);
  });

  it('allows multiple distinct script toasts in one request', () => {
    const bus = createScriptNoticeBus('测试源', '发现');
    bus.onScriptToast('第一条');
    bus.onScriptToast('第二条');
    bus.onScriptToast('第一条');
    bus.onScriptToast('第三条');
    expect(() => bus.onScriptToast('第四条')).not.toThrow();
  });
});

describe('createLoginScriptNoticeBus', () => {
  it('exposes onToast compatible with login runner', () => {
    const bridge = createLoginScriptNoticeBus('晴天');
    expect(typeof bridge.onToast).toBe('function');
    expect(typeof bridge.onScriptToast).toBe('function');
    bridge.onToast('登录成功');
    bridge.onToast('脚本执行中…');
    bridge.onToast('__READER_LEGADO_SUSPEND__');
  });
});
