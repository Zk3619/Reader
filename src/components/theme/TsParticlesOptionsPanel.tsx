/**
 * tsParticles 常用参数可视化编辑
 */

import { For, createMemo } from 'solid-js';
import { TextField, TextFieldInput, TextFieldLabel } from '@/components/ui/text-field';
import {
  DEFAULT_VISUAL_PARTICLE_OPTIONS,
  mergeTsParticlesVisualOptions,
  parseTsParticlesVisualOptions,
} from '@/lib/theme/tsparticles-options';

export interface TsParticlesOptionsPanelProps {
  optionsJson?: string;
  onChange: (optionsJson: string) => void;
}

const FIELDS: Array<{
  key: keyof typeof DEFAULT_VISUAL_PARTICLE_OPTIONS;
  label: string;
  min: number;
  max: number;
  step: number;
}> = [
  { key: 'particleCount', label: '粒子数量', min: 5, max: 300, step: 1 },
  { key: 'speed', label: '移动速度', min: 0, max: 10, step: 0.1 },
  { key: 'opacity', label: '不透明度', min: 0.05, max: 1, step: 0.05 },
  { key: 'sizeMax', label: '最大尺寸 px', min: 1, max: 48, step: 1 },
  { key: 'linkDistance', label: '连线距离', min: 0, max: 300, step: 5 },
  { key: 'fpsLimit', label: 'FPS 上限', min: 15, max: 120, step: 1 },
];

export function TsParticlesOptionsPanel(props: TsParticlesOptionsPanelProps) {
  const visual = createMemo(() => parseTsParticlesVisualOptions(props.optionsJson));

  const patch = (key: keyof typeof DEFAULT_VISUAL_PARTICLE_OPTIONS, value: number) => {
    props.onChange(mergeTsParticlesVisualOptions(props.optionsJson, { [key]: value }));
  };

  return (
    <div class="space-y-2 rounded-lg border border-border/50 p-3">
      <p class="text-xs font-medium text-muted-foreground">粒子可视化参数（写入 optionsJson）</p>
      <For each={FIELDS}>
        {(field) => (
          <TextField>
            <TextFieldLabel>{field.label}</TextFieldLabel>
            <TextFieldInput
              type="number"
              min={field.min}
              max={field.max}
              step={field.step}
              value={String(visual()[field.key])}
              onInput={(e) => {
                const n = Number(e.currentTarget.value);
                if (Number.isFinite(n)) patch(field.key, n);
              }}
            />
          </TextField>
        )}
      </For>
    </div>
  );
}
