/**
 * 组件容器背景 — 从主题包读取配置
 */

import type {
  AppComponentId,
  ContainerBackgroundConfig,
  ReaderThemePackV1,
  ThemeAssetManifest,
  ViewerComponentId,
} from '@/lib/theme/schema/theme-pack-v1';
import { isAppComponentId } from '@/lib/theme/preview/component-registry';

export function getAppComponentBackground(
  pack: ReaderThemePackV1 | null | undefined,
  componentId: AppComponentId,
): ContainerBackgroundConfig | undefined {
  return pack?.app?.components?.[componentId]?.background;
}

export function getViewerComponentBackground(
  pack: ReaderThemePackV1 | null | undefined,
  componentId: ViewerComponentId,
): ContainerBackgroundConfig | undefined {
  return pack?.viewer?.components?.[componentId]?.background;
}

/** viewer 分区级背景（非 components.*.background） */
function getViewerSectionBackground(
  pack: ReaderThemePackV1 | null | undefined,
  componentId: ViewerComponentId,
): ContainerBackgroundConfig | undefined {
  switch (componentId) {
    case 'contentSlot':
      return pack?.viewer?.text?.contentBackground;
    case 'imageStage':
      return pack?.viewer?.image?.stageBackground;
    default:
      return undefined;
  }
}

export function getThemeComponentBackground(
  pack: ReaderThemePackV1 | null | undefined,
  componentId: AppComponentId | ViewerComponentId,
): ContainerBackgroundConfig | undefined {
  if (isAppComponentId(componentId)) {
    return getAppComponentBackground(pack, componentId);
  }
  return getViewerComponentBackground(pack, componentId) ?? getViewerSectionBackground(pack, componentId);
}

export function mergeThemeAssetManifests(
  ...manifests: Array<ThemeAssetManifest | undefined>
): ThemeAssetManifest {
  return Object.assign({}, ...manifests.filter(Boolean));
}
