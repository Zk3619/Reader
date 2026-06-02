import { describe, expect, it, vi } from 'vitest';
import { flushExploreScriptToastBuffer } from '@/lib/js-engine/legado/explore-inject';

describe('flushExploreScriptToastBuffer', () => {
  it('VM 结束后才调用 onScriptToast，单条失败不中断后续', () => {
    const buffer = [
      { msg: '第一条', level: 'info' },
      { msg: '第二条', level: 'warning' },
    ];
    const onScriptToast = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("Cannot read properties of undefined (reading 'owner')");
      })
      .mockImplementationOnce(() => {});

    expect(() => flushExploreScriptToastBuffer(buffer, onScriptToast)).not.toThrow();
    expect(onScriptToast).toHaveBeenCalledTimes(2);
    expect(onScriptToast).toHaveBeenNthCalledWith(1, '第一条', 'info');
    expect(onScriptToast).toHaveBeenNthCalledWith(2, '第二条', 'warning');
  });

  it('buffer 为空或未提供回调时不调用', () => {
    const onScriptToast = vi.fn();
    flushExploreScriptToastBuffer([], onScriptToast);
    flushExploreScriptToastBuffer([{ msg: 'x', level: undefined }], undefined);
    expect(onScriptToast).not.toHaveBeenCalled();
  });
});
