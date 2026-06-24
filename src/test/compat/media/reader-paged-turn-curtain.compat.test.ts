import { describe, expect, it } from 'vitest';
import {
  buildPageSurfaceClone,
  mountTurnPageCurtain,
  sanitizeClonedTurnPageSurface,
} from '@/lib/media/text/reader-paged-turn-curtain';

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

  it('sanitizeClonedTurnPageSurface strips hidden live styles and staging nodes', () => {
    const root = document.createElement('div');
    root.style.opacity = '0';
    const measure = document.createElement('div');
    measure.className = 'reader-paged-measure-host';
    const incoming = document.createElement('div');
    incoming.className = 'reader-paged-incoming-inner';
    const live = document.createElement('div');
    live.className = 'reader-paged-live-inner';
    live.style.visibility = 'hidden';
    live.style.opacity = '0';
    const body = document.createElement('div');
    body.className = 'reader-body';
    body.style.opacity = '0';
    body.textContent = '正文';
    live.appendChild(body);
    root.append(measure, incoming, live);

    sanitizeClonedTurnPageSurface(root);

    expect(root.querySelector('.reader-paged-measure-host')).toBeNull();
    expect(root.querySelector('.reader-paged-incoming-inner')).toBeNull();
    expect(live.style.visibility).toBe('visible');
    expect(live.style.opacity).toBe('');
    expect(body.style.opacity).toBe('');
  });

  it('buildPageSurfaceClone resets suppressed live paint from source', () => {
    const liveInner = document.createElement('div');
    liveInner.className = 'reader-paged-live-inner';
    liveInner.style.visibility = 'hidden';
    liveInner.style.opacity = '0';
    const body = document.createElement('div');
    body.className = 'reader-body';
    body.textContent = 'page';
    liveInner.appendChild(body);

    const curtain = buildPageSurfaceClone(liveInner, 120, '#fff');

    expect(curtain.style.visibility).toBe('visible');
    expect(curtain.style.opacity).toBe('');
    expect(curtain.style.transform).toContain('-120px');
    expect(curtain.querySelector('.reader-body')?.textContent).toBe('page');
  });
});
