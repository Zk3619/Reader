/**
 * 主题组件容器背景层
 */

import { Show, createMemo } from 'solid-js';
import type { AppComponentId, ViewerComponentId } from '@/lib/theme/schema/theme-pack-v1';
import { ContainerBackgroundLayer } from '@/lib/theme/background/ContainerBackgroundLayer';
import { getThemeComponentBackground, mergeThemeAssetManifests } from '@/lib/theme/component-background';
import { isAppComponentId } from '@/lib/theme/preview/component-registry';
import { componentDataAttr } from '@/lib/theme/preview/component-registry';
import { cn } from '@/lib/utils';
import { useThemePackRuntime } from '@/components/theme/ThemePackRuntimeProvider';
import { useThemeDraftRuntime } from '@/components/theme/ThemeDraftRuntimeProvider';
import { useThemeTarget } from '@/components/theme/ThemeTargetHost';

export interface ThemedComponentBackgroundProps {
  componentId: AppComponentId | ViewerComponentId;
  class?: string;
}

export function ThemedComponentBackground(props: ThemedComponentBackgroundProps) {
  const draftRuntime = useThemeDraftRuntime();
  const runtime = useThemePackRuntime();
  const target = useThemeTarget();
  const pack = createMemo(() => {
    const draft = draftRuntime;
    if (target) return (draft ?? runtime).targetPack(target);
    if (draft) {
      return isAppComponentId(props.componentId) ? draft.appPack() : draft.viewerPack();
    }
    return isAppComponentId(props.componentId) ? runtime.appPack() : runtime.viewerPack();
  });
  const config = createMemo(() => {
    const p = pack();
    if (!p) return undefined;
    const id = props.componentId;
    const targetOverride = target ? p.targets?.[target]?.components?.[id] : undefined;
    if (targetOverride) {
      void targetOverride.background;
      return targetOverride.background ?? getThemeComponentBackground(p, id);
    }
    if (isAppComponentId(id)) {
      const override = p.app?.components?.[id];
      if (override) void override.background;
    } else {
      const override = p.viewer?.components?.[id];
      if (override) void override.background;
    }
    void p.assets;
    return getThemeComponentBackground(p, props.componentId);
  });
  const assets = createMemo(() => {
    const draft = draftRuntime;
    if (draft) {
      const p = pack();
      return p?.assets;
    }
    if (target) return pack()?.assets;
    return mergeThemeAssetManifests(runtime.appPack()?.assets, runtime.viewerPack()?.assets);
  });
  const resolveAssetUrl = (assetId: string) =>
    (draftRuntime ?? runtime).resolveAssetUrl(assetId);

  return (
    <Show when={config() && config()!.type !== 'none'}>
      <ContainerBackgroundLayer
        config={config()}
        assets={assets()}
        resolveAssetUrl={resolveAssetUrl}
        class={cn('rounded-[inherit]', props.class)}
      />
    </Show>
  );
}

/**
 * 浮层表面主题背景：仅叠在宿主内部，不修改宿主 position（避免 fixed + relative 冲突）。
 * 宿主须为 fixed / absolute / relative 之一；Popper 根节点请用 overflow-hidden isolate。
 */
export function ThemedOverlaySurfaceBackground(props: ThemedComponentBackgroundProps) {
  return <ThemedComponentBackground {...props} />;
}

export interface ThemedContainerShellProps {
  componentId: AppComponentId | ViewerComponentId;
  class?: string;
  style?: Record<string, string>;
  children?: import('solid-js').JSX.Element;
}

/** 带背景层的相对定位容器 */
export function ThemedContainerShell(props: ThemedContainerShellProps) {
  return (
    <div
      class={cn(
        'relative overflow-hidden',
        '[&>:not([data-theme-background])]:relative [&>:not([data-theme-background])]:z-1',
        props.class,
      )}
      style={props.style}
      {...componentDataAttr(props.componentId)}
    >
      <ThemedComponentBackground componentId={props.componentId} />
      {props.children}
    </div>
  );
}
