/**
 * Theme Studio 预览表面 — 组件 override 样式 + 背景层
 */

import { createMemo, type JSX } from 'solid-js';
import { ThemedComponentBackground } from '@/components/theme/ThemedComponentBackground';
import { useThemeDraftRuntime } from '@/components/theme/ThemeDraftRuntimeProvider';
import { componentDataAttr, isAppComponentId } from '@/lib/theme/preview/component-registry';
import { componentOverrideToStyle } from '@/lib/theme/theme-runtime';
import type { AppComponentId, ViewerComponentId } from '@/lib/theme/schema/theme-pack-v1';
import { cn } from '@/lib/utils';

export interface ThemedPreviewSurfaceProps {
  componentId: AppComponentId | ViewerComponentId;
  class?: string;
  style?: Record<string, string>;
  /** 为 false 时仅渲染背景层，不写入 layout/typography override（用于外层容器） */
  applyOverride?: boolean;
  children?: JSX.Element;
}

export function ThemedPreviewSurface(props: ThemedPreviewSurfaceProps) {
  const draft = useThemeDraftRuntime();

  const overrideStyle = createMemo(() => {
    if (props.applyOverride === false) return {};
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
      void override.background;
      void override.surfaceAppearance;
    }
    return componentOverrideToStyle(override, { componentId: props.componentId });
  });

  const mergedStyle = createMemo(() => ({
    ...props.style,
    ...overrideStyle(),
  }));

  return (
    <div
      class={cn(
        'relative overflow-hidden',
        '[&>:not([data-theme-background])]:relative [&>:not([data-theme-background])]:z-1',
        props.class,
      )}
      style={mergedStyle()}
      {...componentDataAttr(props.componentId)}
    >
      <ThemedComponentBackground componentId={props.componentId} />
      {props.children}
    </div>
  );
}
