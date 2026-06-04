/**
 * @deprecated 请使用 overlay-layer-active（全局档位）与 overlay-portal-mount（阅读器 Portal 宿主）。
 * 保留本文件仅为稳定 import 路径。
 */
export {
  publishActiveOverlayLayer,
  resolveOverlayLayerForNavTop,
  useOverlayLayerZ,
} from '@/lib/ui/overlay-layer-active';
export {
  registerOverlayPortalHost,
  setViewerOverlayPortalHostEnabled,
  useOverlayPortalMount,
  useOverlayPortalMountAccessor,
} from '@/lib/ui/overlay-portal-mount';
export { APP_OVERLAY_LAYER_Z, MEDIA_VIEWER_OVERLAY_LAYER_Z } from '@/lib/ui/overlay-z';
export type { OverlayLayerZ } from '@/lib/ui/overlay-z';
