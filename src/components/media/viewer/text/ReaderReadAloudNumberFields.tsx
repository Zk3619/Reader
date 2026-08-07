/**
 * 朗读抽屉 / 全屏页可编辑数值（语速倍速、定时分钟）
 */

import { AppTextInputContextMenu } from '@/components/shared/AppTextInputContextMenu';
import { cn } from '@/lib/utils';
import {
  NumberField,
  NumberFieldDecrementTrigger,
  NumberFieldGroup,
  NumberFieldIncrementTrigger,
  NumberFieldInput,
} from '@/components/ui/number-field';
import {
  TTS_SPEECH_RATE_DISPLAY_MAX,
  TTS_SPEECH_RATE_DISPLAY_MIN,
  TTS_TIMER_MAX_MINUTES,
  normalizeTtsTimerMinutes,
  ttsSpeechRateFromDisplayValue,
  ttsSpeechRateToDisplayValue,
} from '@/lib/media/text/reader-ui-config';

function ReadAloudNumberFieldWithUnit(props: {
  value: number;
  onValueChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
  disabled?: boolean;
  groupClass?: string;
  inputClass?: string;
  'aria-label'?: string;
}) {
  const emitIfChanged = (value: number) => {
    if (!Number.isFinite(value)) return;
    if (value === props.value) return;
    props.onValueChange(value);
  };

  return (
    <div class="flex shrink-0 items-center gap-1">
      <NumberField
        rawValue={props.value}
        onRawValueChange={emitIfChanged}
        minValue={props.min}
        maxValue={props.max}
        step={props.step}
        disabled={props.disabled}
      >
        <NumberFieldGroup class={cn('w-19', props.groupClass)}>
          <AppTextInputContextMenu disabled={props.disabled}>
            <NumberFieldInput
              class={cn('h-9 pr-7 text-center tabular-nums', props.inputClass)}
              aria-label={props['aria-label']}
            />
          </AppTextInputContextMenu>
          <NumberFieldIncrementTrigger />
          <NumberFieldDecrementTrigger />
        </NumberFieldGroup>
      </NumberField>
      <span class="text-xs text-muted-foreground">{props.unit}</span>
    </div>
  );
}

export function ReadAloudSpeechRateNumberField(props: {
  rate: number;
  onRateChange: (rate: number) => void;
  disabled?: boolean;
}) {
  return (
    <ReadAloudNumberFieldWithUnit
      value={ttsSpeechRateToDisplayValue(props.rate)}
      onValueChange={(display) => props.onRateChange(ttsSpeechRateFromDisplayValue(display))}
      min={TTS_SPEECH_RATE_DISPLAY_MIN}
      max={TTS_SPEECH_RATE_DISPLAY_MAX}
      step={0.1}
      unit="倍速"
      disabled={props.disabled}
      aria-label="语速"
    />
  );
}

export function ReadAloudTimerNumberField(props: {
  minutes: number;
  onMinutesChange: (minutes: number) => void;
}) {
  return (
    <ReadAloudNumberFieldWithUnit
      value={props.minutes}
      onValueChange={(value) => props.onMinutesChange(normalizeTtsTimerMinutes(value))}
      min={0}
      max={TTS_TIMER_MAX_MINUTES}
      step={1}
      unit="分钟"
      aria-label="定时关闭"
    />
  );
}
