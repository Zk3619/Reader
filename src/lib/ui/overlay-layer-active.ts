import { createRoot, createSignal } from 'solid-js';
import { isViewerOverlayKind, type OverlayEntry } from '@/lib/navigation/overlay-stack';
import {
  APP_OVERLAY_LAYER_Z,
  MEDIA_VIEWER_OVERLAY_LAYER_Z,
  type OverlayLayerZ,
} from '@/lib/ui/overlay-z';

const [activeOverlayLayer, setActiveOverlayLayer] = createRoot(() =>
  createSignal<OverlayLayerZ>(APP_OVERLAY_LAYER_Z),
);

/** 根据导航栈顶解析当前子树应使用的浮层 z-index 档位 */
export function resolveOverlayLayerForNavTop(top: OverlayEntry | undefined): OverlayLayerZ {
  if (top && isViewerOverlayKind(top.kind)) {
    return MEDIA_VIEWER_OVERLAY_LAYER_Z;
  }
  return APP_OVERLAY_LAYER_Z;
}

/** 由 App 在 nav.top() 变化时同步浮层 z-index 档位（阅读器内浮层用 ViewerApp* + portalToBody） */
export function publishActiveOverlayLayer(top: OverlayEntry | undefined): void {
  setActiveOverlayLayer(() => resolveOverlayLayerForNavTop(top));
}

export function useOverlayLayerZ(): OverlayLayerZ {
  return activeOverlayLayer();
}
