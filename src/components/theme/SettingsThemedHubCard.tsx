/**
 * 设置页 Hub 分类卡片 — settingsCard 背景
 */

import type { JSX } from 'solid-js';
import { ThemedAppCardShell } from '@/components/theme/ThemedAppCardShell';
import { cn } from '@/lib/utils';

export interface SettingsThemedHubCardProps {
  class?: string;
  onClick?: () => void;
  children?: JSX.Element;
}

export function SettingsThemedHubCard(props: SettingsThemedHubCardProps) {
  return (
    <ThemedAppCardShell
      as="button"
      type="button"
      variant="settingsCard"
      class={cn('cursor-pointer text-left', props.class)}
      onClick={props.onClick}
    >
      {props.children}
    </ThemedAppCardShell>
  );
}
