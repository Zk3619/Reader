/**
 * 主题工作室 — 布局 Token 字段（按类型自动选择控件）
 */

import { Show } from 'solid-js';
import type { LayoutTokens } from '@/lib/theme/types';
import { LAYOUT_TOKEN_LABELS } from '@/lib/theme/theme-layout-tokens';
import { layoutTokenFieldKind } from '@/lib/theme/preview/theme-layout-token-meta';
import { ThemeStudioSizeField } from '@/components/theme/ThemeStudioSizeField';
import { ThemeStudioDurationField } from '@/components/theme/ThemeStudioDurationField';
import { ThemeStudioEasingField } from '@/components/theme/ThemeStudioEasingField';
import { ThemeStudioPercentField } from '@/components/theme/ThemeStudioPercentField';

export interface ThemeStudioLayoutTokenFieldProps {
  tokenKey: keyof LayoutTokens;
  value: string;
  onChange: (value: string) => void;
}

export function ThemeStudioLayoutTokenField(props: ThemeStudioLayoutTokenFieldProps) {
  const label = () => LAYOUT_TOKEN_LABELS[props.tokenKey];
  const kind = () => layoutTokenFieldKind(props.tokenKey);

  return (
    <>
      <Show when={kind() === 'length'}>
        <ThemeStudioSizeField
          label={label()}
          value={props.value}
          onChange={props.onChange}
          showRuler
        />
      </Show>
      <Show when={kind() === 'time'}>
        <ThemeStudioDurationField
          label={label()}
          value={props.value}
          onChange={props.onChange}
        />
      </Show>
      <Show when={kind() === 'easing'}>
        <ThemeStudioEasingField
          label={label()}
          value={props.value}
          onChange={props.onChange}
        />
      </Show>
      <Show when={kind() === 'percent'}>
        <ThemeStudioPercentField
          label={label()}
          value={props.value}
          onChange={props.onChange}
        />
      </Show>
    </>
  );
}
