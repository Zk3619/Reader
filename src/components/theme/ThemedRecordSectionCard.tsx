/**
 * 阅读记录页区块卡片 — recordCard 背景
 */

import type { JSX } from 'solid-js';
import { ThemedAppCardShell } from '@/components/theme/ThemedAppCardShell';
import { READ_RECORD_SECTION_CARD_CLASS } from '@/lib/record/read-record-layout';
import { cn } from '@/lib/utils';

export interface ThemedRecordSectionCardProps {
  class?: string;
  children?: JSX.Element;
}

export function ThemedRecordSectionCard(props: ThemedRecordSectionCardProps) {
  return (
    <ThemedAppCardShell
      as="section"
      variant="recordCard"
      class={cn(READ_RECORD_SECTION_CARD_CLASS, props.class)}
    >
      {props.children}
    </ThemedAppCardShell>
  );
}
