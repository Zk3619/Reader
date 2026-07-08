/**
 * 带主题背景的卡片 / 区块壳层
 */

import type { JSX, ValidComponent } from 'solid-js';
import { splitProps } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import type { AppComponentId } from '@/lib/theme/schema/theme-pack-v1';
import { ThemedComponentBackground } from '@/components/theme/ThemedComponentBackground';
import { componentDataAttr } from '@/lib/theme/preview/component-registry';
import { cn } from '@/lib/utils';

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

export function ThemedAppCardShell(props: ThemedAppCardShellProps) {
  const [local, rest] = splitProps(props, ['variant', 'class', 'style', 'children', 'as']);
  const componentId = () => CARD_VARIANT_TO_ID[local.variant];
  const Tag = () => local.as ?? 'div';

  return (
    <Dynamic
      component={Tag()}
      class={cn(
        'relative overflow-hidden',
        '[&>:not([data-theme-background])]:relative [&>:not([data-theme-background])]:z-1',
        local.class,
      )}
      style={local.style}
      {...componentDataAttr(componentId())}
      {...rest}
    >
      <ThemedComponentBackground componentId={componentId()} />
      {local.children}
    </Dynamic>
  );
}
