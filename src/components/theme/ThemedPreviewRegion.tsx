/**
 * Theme Studio 预览区域 — 仅背景层 + 布局容器（不应用组件 override 样式）
 */

import { createMemo, type JSX } from 'solid-js';
import { ThemedComponentBackground } from '@/components/theme/ThemedComponentBackground';
import { useThemeDraftRuntime } from '@/components/theme/ThemeDraftRuntimeProvider';
import { componentDataAttr, isAppComponentId } from '@/lib/theme/preview/component-registry';
import { componentOverrideToStyle } from '@/lib/theme/theme-runtime';
import type { AppComponentId, ViewerComponentId } from '@/lib/theme/schema/theme-pack-v1';
import { cn } from '@/lib/utils';

export interface ThemedPreviewRegionProps {
  componentId: AppComponentId | ViewerComponentId;
  class?: string;
  contentClass?: string;
  children?: JSX.Element;
}

export function ThemedPreviewRegion(props: ThemedPreviewRegionProps) {
  const draft = useThemeDraftRuntime();

  const overrideStyle = createMemo(() => {
    const runtime = draft;
    if (!runtime) return {};
    const pack = isAppComponentId(props.componentId) ? runtime.appPack() : runtime.viewerPack();
    if (!pack) return {};
    const id = props.componentId;
    const override = isAppComponentId(id)
      ? pack.app?.components?.[id as AppComponentId]
      : pack.viewer?.components?.[id as ViewerComponentId];
    if (override) {
      void override.cssVars;
      void override.layout;
      void override.typography;
      void override.surfaceAppearance;
    }
    return componentOverrideToStyle(override, { componentId: props.componentId });
  });

  return (
    <div
      class={cn('relative min-h-0 min-w-0 overflow-hidden', props.class)}
      style={overrideStyle()}
      {...componentDataAttr(props.componentId)}
    >
      <ThemedComponentBackground componentId={props.componentId} />
      <div class={cn('relative z-1 min-h-0 min-w-0', props.contentClass)}>{props.children}</div>
    </div>
  );
}
