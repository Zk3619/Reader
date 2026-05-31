import { describe, expect, it } from 'vitest';
import {
  createInnerWebPresentation,
  innerWebDrawerPanelStyle,
  INNER_WEB_PRESETS,
  resolveInnerWebPresentation,
} from '@/lib/platform/inner-web-presentation';

describe('resolveInnerWebPresentation', () => {
  it('default 为全屏、无遮罩', () => {
    const r = resolveInnerWebPresentation(undefined, {});
    expect(r.layout).toBe('fullscreen');
    expect(r.backdrop.visible).toBe(false);
    expect(r.animation).toBe('fade');
  });

  it('paragraph-review 预设为底部抽屉', () => {
    const r = resolveInnerWebPresentation({ preset: 'paragraph-review' }, { showConfirm: true });
    expect(r.layout).toBe('drawer');
    expect(r.drawer.side).toBe('bottom');
    expect(r.drawer.size).toBe('72dvh');
    expect(r.drawer.showNativeDragHandle).toBe(false);
    expect(r.drawer.dragToDismiss).toBe(true);
    expect(r.backdrop.visible).toBe(true);
    expect(r.header.showConfirm).toBe(false);
    expect(r.animation).toBe('none');
  });

  it('layout sheet 兼容映射为 drawer bottom', () => {
    const r = resolveInnerWebPresentation(
      { layout: 'sheet', drawer: { side: 'bottom', size: '60vh' } },
      {},
    );
    expect(r.layout).toBe('drawer');
    expect(r.drawer.side).toBe('bottom');
    expect(r.drawer.size).toBe('60vh');
  });

  it('四向 drawer 与尺寸', () => {
    const left = resolveInnerWebPresentation(
      { layout: 'drawer', drawer: { side: 'left', size: '400px' } },
      {},
    );
    expect(left.drawer.side).toBe('left');
    expect(left.drawer.size).toBe('400px');
    expect(innerWebDrawerPanelStyle(left.drawer!)?.width).toBe('400px');

    const top = resolveInnerWebPresentation(
      { layout: 'drawer', drawer: { side: 'top', size: '50vh' } },
      {},
    );
    expect(top.drawer.side).toBe('top');
    expect(innerWebDrawerPanelStyle(top.drawer)).toBeUndefined();
  });

  it('可关闭拖拽条与拖拽关闭', () => {
    const r = resolveInnerWebPresentation(
      {
        layout: 'drawer',
        drawer: { showNativeDragHandle: false, dragToDismiss: false },
      },
      {},
    );
    expect(r.drawer.showNativeDragHandle).toBe(false);
    expect(r.drawer.dragToDismiss).toBe(false);
  });

  it('center 模式默认显示遮罩', () => {
    const r = resolveInnerWebPresentation({ layout: 'center' }, {});
    expect(r.layout).toBe('center');
    expect(r.backdrop.visible).toBe(true);
    expect(r.backdrop.dismissOnClick).toBe(true);
  });

  it('createInnerWebPresentation 统一 preset API', () => {
    const p = createInnerWebPresentation(INNER_WEB_PRESETS.paragraphReview);
    expect(p.preset).toBe('paragraph-review');
    const r = resolveInnerWebPresentation(p, {});
    expect(r.layout).toBe('drawer');
    expect(r.drawer.showNativeDragHandle).toBe(false);
  });
});
