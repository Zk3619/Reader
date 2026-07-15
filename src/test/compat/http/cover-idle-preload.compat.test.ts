import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('cover idle preload queue', () => {
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    vi.resetModules();
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
  });

  afterEach(async () => {
    const { setCoverLoadScrollIdleProbe } = await import(
      '@/components/shared/virtual-list/virtual-list-scroll-coalesce'
    );
    const { clearIdleCoverQueue } = await import('@/lib/http/cover-idle-preload');
    setCoverLoadScrollIdleProbe(null);
    clearIdleCoverQueue();
    vi.unstubAllGlobals();
  });

  it('滚动中提交的任务不会丢失，停滚后继续执行', async () => {
    let idle = false;
    const task = vi.fn();
    const { setCoverLoadScrollIdleProbe } = await import(
      '@/components/shared/virtual-list/virtual-list-scroll-coalesce'
    );
    const { enqueueIdleCoverTask } = await import('@/lib/http/cover-idle-preload');
    setCoverLoadScrollIdleProbe(() => idle);

    enqueueIdleCoverTask(task);
    expect(frames).toHaveLength(1);

    frames.shift()!(0);
    expect(task).not.toHaveBeenCalled();
    expect(frames).toHaveLength(1);

    idle = true;
    frames.shift()!(16);
    expect(task).toHaveBeenCalledTimes(1);
  });
});
