import { describe, expect, it } from 'vitest';
import { mountTurnPageCurtain } from '@/lib/media/text/reader-paged-turn-curtain';

describe('mountTurnPageCurtain body mount geometry', () => {
  it('does not add padding on slide when mount is already body-positioned', () => {
    const turnLayer = document.createElement('div');
    const slideMount = document.createElement('div');
    Object.assign(slideMount.style, {
      top: '24px',
      bottom: '20px',
      left: '16px',
      right: '16px',
    });
    const liveInner = document.createElement('div');
    liveInner.className = 'reader-paged-live-inner';
    liveInner.textContent = 'page';

    mountTurnPageCurtain(turnLayer, slideMount, liveInner, 0, {
      contentSpanPx: 400,
      contentInsetPx: { top: 24, bottom: 20, left: 16, right: 16 },
      slideViewportPanel: true,
      pageBg: '#fff',
    });

    const slide = slideMount.querySelector('.reader-paged-turn-slide') as HTMLElement;
    expect(slide).toBeTruthy();
    expect(slide.style.paddingTop).toBe('');
    expect(slide.style.paddingBottom).toBe('');
    expect(slide.style.paddingLeft).toBe('');
    expect(slide.style.paddingRight).toBe('');
  });
});
