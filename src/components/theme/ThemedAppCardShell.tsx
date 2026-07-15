/**
 * 带主题背景的卡片 / 区块壳层
 */

import { createMemo, splitProps, type JSX, type ValidComponent } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import type { AppComponentId } from '@/lib/theme/schema/theme-pack-v1';
import { ThemedComponentBackground } from '@/components/theme/ThemedComponentBackground';
import { useThemeDraftRuntime } from '@/components/theme/ThemeDraftRuntimeProvider';
import { useThemePackRuntime } from '@/components/theme/ThemePackRuntimeProvider';
import { componentDataAttr } from '@/lib/theme/preview/component-registry';
import { componentOverrideToStyle } from '@/lib/theme/theme-runtime';
import { cn } from '@/lib/utils';
import { useThemeTarget } from '@/components/theme/ThemeTargetHost';

export type ThemedCardVariant =
  | 'bookshelfCard'
  | 'bookshelfGroupCard'
  | 'settingsCard'
  | 'recordCard'
  | 'surfaceCard';

const CARD_VARIANT_TO_ID: Record<ThemedCardVariant, AppComponentId> = {
  bookshelfCard: 'bookshelfCard',
  bookshelfGroupCard: 'bookshelfGroupCard',
  settingsCard: 'settingsCard',
  recordCard: 'recordCard',
  surfaceCard: 'surfaceCard',
};

export interface ThemedAppCardShellProps {
  variant: ThemedCardVariant;
  class?: string;
  style?: Record<string, string>;
  children?: JSX.Element;
  as?: ValidComponent;
  [key: string]: unknown;
}

const CARD_VARIANT_SURFACE_CLASS: Record<ThemedCardVariant, string> = {
  bookshelfCard: 'bg-card text-card-foreground',
  bookshelfGroupCard: 'bg-card text-card-foreground',
  settingsCard: 'bg-card text-card-foreground',
  recordCard: 'bg-card text-card-foreground',
  surfaceCard: 'bg-card text-card-foreground',
};

export function ThemedAppCardShell(props: ThemedAppCardShellProps) {
  const [local, rest] = splitProps(props, ['variant', 'class', 'style', 'children', 'as']);
  const draftRuntime = useThemeDraftRuntime();
  const runtime = useThemePackRuntime();
  const target = useThemeTarget();
  const componentId = () => CARD_VARIANT_TO_ID[local.variant];
  const Tag = () => local.as ?? 'div';

  const themeOverrideStyle = createMemo(() => {
    const pack = target
      ? (draftRuntime ?? runtime).targetPack(target)
      : (draftRuntime?.appPack() ?? runtime.appPack());
    if (!pack) return {};
    const id = componentId();
    const override = (target ? pack.targets?.[target]?.components?.[id] : undefined)
      ?? pack.app?.components?.[id];
    if (override) {
      void override.cssVars;
      void override.layout;
      void override.typography;
      void override.surfaceAppearance;
    }
    return componentOverrideToStyle(override, { componentId: id });
  });

  const mergedStyle = createMemo(() => ({
    ...local.style,
    ...themeOverrideStyle(),
  }));

  return (
    <Dynamic
      component={Tag()}
      class={cn(
        'relative overflow-hidden',
        '[&>:not([data-theme-background])]:relative [&>:not([data-theme-background])]:z-1',
        CARD_VARIANT_SURFACE_CLASS[local.variant],
        local.class,
      )}
      style={mergedStyle()}
      {...componentDataAttr(componentId())}
      {...rest}
    >
      <ThemedComponentBackground componentId={componentId()} />
      {local.children}
    </Dynamic>
  );
}
