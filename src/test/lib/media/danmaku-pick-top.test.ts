import { describe, expect, it } from 'vitest';
import {
  applyOverlapTrackJitter,
  pickDanmuTop,
  type DanmuTopVisible,
} from '@/lib/media/video/danmaku/pick-danmu-top';

describe('pickDanmuTop', () => {
  const base = {
    target: { mode: 0, height: 30, speed: 100 },
    clientWidth: 800,
    clientHeight: 400,
    marginBottom: 10,
    marginTop: 10,
    antiOverlap: true,
  };

  it('on empty screen picks across the lane grid, not always top', () => {
    const seen = new Set<number>();
    let i = 0;
    const seq = [0.1, 0.5, 0.9, 0.2, 0.7];
    for (let n = 0; n < 20; n++) {
      const top = pickDanmuTop(
        { ...base, visibles: [] },
        () => seq[i++ % seq.length]!,
      );
      expect(top).toBeTypeOf('number');
      seen.add(top!);
    }
    expect(seen.size).toBeGreaterThan(1);
    expect(Math.max(...seen)).toBeGreaterThan(100);
  });

  it('uses free gaps in the lower half when upper is occupied', () => {
    const visibles = Array.from({ length: 6 }, (_, i) => ({
      top: 10 + i * 30,
      right: 100,
      height: 28,
      speed: 80,
      distance: 400,
      time: 3,
      mode: 0,
    }));
    const tops = new Set<number>();
    let i = 0;
    const seq = [0.05, 0.25, 0.45, 0.65, 0.85, 0.15, 0.35, 0.55];
    for (let n = 0; n < 16; n++) {
      const top = pickDanmuTop(
        { ...base, visibles },
        () => seq[i++ % seq.length]!,
      );
      if (top != null) tops.add(top);
    }
    expect(Math.max(...tops)).toBeGreaterThan(180);
  });

  it('returns undefined when antiOverlap and no lane free', () => {
    const visibles = [];
    for (let y = 10; y < 390; y += 28) {
      visibles.push({
        top: y,
        right: 10,
        height: 28,
        speed: 50,
        distance: 900,
        time: 10,
        mode: 0,
      });
    }
    const top = pickDanmuTop({ ...base, visibles }, () => 0.5);
    expect(top).toBeUndefined();
  });

  it('overlap mode: free lane has no jitter (exact grid top)', () => {
    // 仅占用顶部几行，下方仍有空轨
    const visibles = [
      {
        top: 10,
        right: 100,
        height: 28,
        speed: 80,
        distance: 400,
        time: 3,
        mode: 0,
      },
    ];
    const top = pickDanmuTop(
      { ...base, visibles, antiOverlap: false },
      () => 0.5,
    );
    expect(top).toBeTypeOf('number');
    // 空轨应为整数车道，未经 jitter（jitter 会打出非半像素级噪声；这里要求贴近 30 的倍数网格）
    expect(top! % 1).toBe(0);
    expect(top!).toBeGreaterThan(10);
  });

  it('overlap mode: when full, forces overlap with jitter', () => {
    const visibles: DanmuTopVisible[] = [];
    for (let y = 10; y < 390; y += 28) {
      visibles.push({
        top: y,
        right: 10,
        height: 28,
        speed: 50,
        distance: 900,
        time: 10,
        mode: 0,
      });
    }
    let i = 0;
    const seq = [0.2, 0.8, 0.1, 0.9];
    const tops: number[] = [];
    for (let n = 0; n < 4; n++) {
      const top = pickDanmuTop(
        { ...base, visibles, antiOverlap: false },
        () => seq[i++ % seq.length]!,
      );
      expect(top).toBeTypeOf('number');
      tops.push(top!);
    }
    // 至少有一条相对「整轨」发生了偏移
    const onGrid = tops.every((t) => visibles.some((v) => Math.abs(v.top - t) < 0.01));
    expect(onGrid).toBe(false);
  });
});

describe('applyOverlapTrackJitter', () => {
  it('stays within bounds', () => {
    const t = applyOverlapTrackJitter(100, 30, 10, 400, () => 0);
    expect(t).toBeGreaterThanOrEqual(10);
    expect(t).toBeLessThanOrEqual(370);
  });
});
