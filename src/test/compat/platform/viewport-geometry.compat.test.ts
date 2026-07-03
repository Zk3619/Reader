import { describe, expect, it } from 'vitest';
import { resolveLayoutScreenHeightPx } from '@/lib/platform/viewport-geometry';

describe('viewport-geometry', () => {
  it('竖屏取 screen 长边作为布局高度', () => {
    expect(
      resolveLayoutScreenHeightPx({
        screenWidth: 412,
        screenHeight: 915,
        innerWidth: 412,
        innerHeight: 800,
      }),
    ).toBe(915);
  });

  it('横屏取 screen 短边作为布局高度（screen 尺寸不随旋转交换）', () => {
    expect(
      resolveLayoutScreenHeightPx({
        screenWidth: 412,
        screenHeight: 915,
        innerWidth: 915,
        innerHeight: 412,
      }),
    ).toBe(412);
  });

  it('横屏不应把固定 screen.height 当作布局高度', () => {
    const layoutHeight = resolveLayoutScreenHeightPx({
      screenWidth: 412,
      screenHeight: 915,
      innerWidth: 915,
      innerHeight: 380,
    });
    const gap = layoutHeight - 380;
    expect(layoutHeight).toBe(412);
    expect(gap).toBe(32);
    expect(gap).toBeLessThan(100);
  });
});
