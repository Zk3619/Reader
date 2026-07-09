/**
 * Theme Studio Inspector — 动效 Tab（布局动效 Token + 全局动效）
 */

import { For, Show } from 'solid-js';
import type { LayoutTokens } from '@/lib/theme/types';
import type { InspectorEditableSections } from '@/lib/theme/preview/theme-inspector-editable';
import type { MotionTokens, ReducedMotionPolicy } from '@/lib/theme/schema/theme-pack-v1';
import { ThemeStudioLayoutTokenField } from '@/components/theme/ThemeStudioLayoutTokenField';
import { ThemeStudioDurationField } from '@/components/theme/ThemeStudioDurationField';
import { ThemeStudioEasingField } from '@/components/theme/ThemeStudioEasingField';
import { ThemeStudioSelectField } from '@/components/theme/ThemeStudioSelectField';

const REDUCED_MOTION_OPTIONS: { label: string; value: ReducedMotionPolicy }[] = [
  { label: '尊重系统设置', value: 'respect' },
  { label: '始终减弱动效', value: 'always-reduce' },
  { label: '忽略减弱设置', value: 'ignore' },
];

export interface ThemeStudioInspectorMotionPanelProps {
  sections: InspectorEditableSections;
  layoutValue: (key: keyof LayoutTokens) => string;
  patchLayout: (key: keyof LayoutTokens, value: string) => void;
  motion: MotionTokens | undefined;
  patchMotion: (patch: Partial<MotionTokens>) => void;
}

export function ThemeStudioInspectorMotionPanel(props: ThemeStudioInspectorMotionPanelProps) {
  const hasTokenMotion = () => props.sections.motionGroups.length > 0;
  const hasAppMotion = () => props.sections.showMotion;

  return (
    <div class="space-y-3">
      <Show when={hasTokenMotion()}>
        <For each={props.sections.motionGroups}>
          {(group) => (
            <div class="space-y-2 rounded-lg border border-border/50 p-2">
              <p class="text-xs font-medium text-foreground">{group.label}</p>
              <p class="text-[11px] text-muted-foreground">
                时长以毫秒调节；缓动请从预设选择，无需手写 cubic-bezier。
              </p>
              <For each={group.keys}>
                {(key) => (
                  <ThemeStudioLayoutTokenField
                    tokenKey={key}
                    value={props.layoutValue(key)}
                    onChange={(value) => props.patchLayout(key, value)}
                  />
                )}
              </For>
            </div>
          )}
        </For>
      </Show>

      <Show when={hasAppMotion()}>
        <div class="space-y-2 rounded-lg border border-border/50 p-2">
          <p class="text-xs font-medium text-foreground">全局过渡</p>
          <ThemeStudioDurationField
            label="快速过渡"
            value={props.motion?.durationFast ?? '120ms'}
            onChange={(value) => props.patchMotion({ durationFast: value })}
          />
          <ThemeStudioDurationField
            label="常规过渡"
            value={props.motion?.durationNormal ?? '200ms'}
            onChange={(value) => props.patchMotion({ durationNormal: value })}
          />
          <ThemeStudioDurationField
            label="慢速过渡"
            value={props.motion?.durationSlow ?? '300ms'}
            onChange={(value) => props.patchMotion({ durationSlow: value })}
          />
          <ThemeStudioEasingField
            label="默认缓动"
            value={props.motion?.easingDefault ?? 'ease'}
            onChange={(value) => props.patchMotion({ easingDefault: value })}
          />
          <ThemeStudioSelectField
            label="减弱动效策略"
            value={props.motion?.reducedMotionPolicy ?? 'respect'}
            onChange={(value) =>
              props.patchMotion({
                reducedMotionPolicy: value as ReducedMotionPolicy,
              })
            }
            options={REDUCED_MOTION_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
          />
        </div>
      </Show>

      <Show when={!hasTokenMotion() && !hasAppMotion()}>
        <p class="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
          当前组件无可编辑动效 Token。请选择应用壳层，或在下方的交互特效中配置鼠标/点击效果。
        </p>
      </Show>
    </div>
  );
}
