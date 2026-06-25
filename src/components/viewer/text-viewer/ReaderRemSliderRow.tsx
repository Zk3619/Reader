import { Show, createSignal, type JSX } from 'solid-js';
import { Slider, SliderTrack, SliderFill, SliderThumb } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  NumberField,
  NumberFieldDecrementTrigger,
  NumberFieldGroup,
  NumberFieldIncrementTrigger,
  NumberFieldInput,
} from '@/components/ui/number-field';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import { ViewerAppDialog, ViewerAppDialogContent, ViewerAppDialogFooter, ViewerAppDialogHeader, ViewerAppDialogTitle } from '@/components/viewer/viewer-app-overlay';
import { pxToRem, remToPx } from '@/lib/media/text/reader-rem';
import { cn } from '@/lib/utils';

export type ReaderRemValueUnit = 'px' | 'rem';

export interface ReaderRemSliderRowProps {
  label: string;
  valueLabel: string;
  sliderValue: number;
  minValue: number;
  maxValue: number;
  step: number;
  onSliderChange: (rem: number) => void;
  /** 精确调整对话框标题，默认同 label */
  dialogTitle?: string;
  getDialogValue: (unit: ReaderRemValueUnit) => number;
  onDialogApply: (value: number, unit: ReaderRemValueUnit) => void;
  /** 对话框步进，默认同 step */
  dialogStep?: number;
  dialogMinRem?: number;
  dialogMaxRem?: number;
  dialogMinPx?: number;
  dialogMaxPx?: number;
  /** 是否允许 px 单位，默认 true */
  allowPxUnit?: boolean;
  class?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function convertBetweenUnits(
  value: number,
  from: ReaderRemValueUnit,
  to: ReaderRemValueUnit,
): number {
  if (from === to) return value;
  return to === 'rem' ? pxToRem(value) : remToPx(value);
}

const PRECISION_ADJUST_HINT = '单击精确调整';

function PrecisionAdjustTrigger(props: {
  class?: string;
  onOpen: () => void;
  children: JSX.Element;
}) {
  return (
    <AppTooltip>
      <AppTooltipTrigger
        as="button"
        type="button"
        class={props.class}
        onClick={(e) => {
          e.stopPropagation();
          props.onOpen();
        }}
      >
        {props.children}
      </AppTooltipTrigger>
      <AppTooltipContent layer="viewer">{PRECISION_ADJUST_HINT}</AppTooltipContent>
    </AppTooltip>
  );
}

export function ReaderRemSliderRow(props: ReaderRemSliderRowProps) {
  const [dialogOpen, setDialogOpen] = createSignal(false);
  const [draftUnit, setDraftUnit] = createSignal<ReaderRemValueUnit>('rem');
  const [draftValue, setDraftValue] = createSignal(0);

  const allowPx = () => props.allowPxUnit !== false;
  const dialogStep = () => props.dialogStep ?? props.step;

  const dialogBounds = (unit: ReaderRemValueUnit) => {
    if (unit === 'rem') {
      return {
        min: props.dialogMinRem ?? props.minValue,
        max: props.dialogMaxRem ?? props.maxValue,
      };
    }
    return {
      min: props.dialogMinPx ?? remToPx(props.minValue),
      max: props.dialogMaxPx ?? remToPx(props.maxValue),
    };
  };

  const openDialog = () => {
    const unit: ReaderRemValueUnit = 'rem';
    setDraftUnit(unit);
    setDraftValue(props.getDialogValue(unit));
    setDialogOpen(true);
  };

  const onUnitChange = (next: string | null) => {
    if (!next || (next !== 'px' && next !== 'rem')) return;
    const unit = next as ReaderRemValueUnit;
    if (unit === 'px' && !allowPx()) return;
    const converted = convertBetweenUnits(draftValue(), draftUnit(), unit);
    const bounds = dialogBounds(unit);
    setDraftUnit(unit);
    setDraftValue(clamp(converted, bounds.min, bounds.max));
  };

  const confirmDialog = () => {
    const unit = draftUnit();
    const bounds = dialogBounds(unit);
    const next = clamp(draftValue(), bounds.min, bounds.max);
    props.onDialogApply(next, unit);
    setDialogOpen(false);
  };

  const labelActionClass =
    'cursor-pointer select-none rounded-sm border-0 bg-transparent p-0 font-inherit text-inherit decoration-dotted underline-offset-4 hover:underline';

  return (
    <div class={cn('space-y-2', props.class)}>
      <div class="flex items-center justify-between gap-2">
        <PrecisionAdjustTrigger
          class={cn('text-left text-sm font-normal', labelActionClass)}
          onOpen={openDialog}
        >
          {props.label}
        </PrecisionAdjustTrigger>
        <PrecisionAdjustTrigger
          class={cn('shrink-0 text-sm tabular-nums text-muted-foreground', labelActionClass)}
          onOpen={openDialog}
        >
          {props.valueLabel}
        </PrecisionAdjustTrigger>
      </div>
      <Slider
        value={[props.sliderValue]}
        minValue={props.minValue}
        maxValue={props.maxValue}
        step={props.step}
        onChange={(values: number[]) => props.onSliderChange(values[0] ?? props.sliderValue)}
      >
        <SliderTrack>
          <SliderFill />
          <SliderThumb />
        </SliderTrack>
      </Slider>

      <ViewerAppDialog open={dialogOpen()} onOpenChange={setDialogOpen}>
        <ViewerAppDialogContent layout="plain" class="max-w-sm">
          <ViewerAppDialogHeader>
            <ViewerAppDialogTitle>{props.dialogTitle ?? props.label}</ViewerAppDialogTitle>
          </ViewerAppDialogHeader>
          <div class="space-y-4 py-1">
            <Show when={allowPx()}>
              <Tabs value={draftUnit()} onChange={onUnitChange} class="w-full">
                <TabsList class="grid w-full grid-cols-2">
                  <TabsTrigger value="rem">rem</TabsTrigger>
                  <TabsTrigger value="px">px</TabsTrigger>
                </TabsList>
              </Tabs>
            </Show>
            <NumberField
              class="space-y-2"
              rawValue={draftValue()}
              onRawValueChange={(value) => {
                if (!Number.isFinite(value)) return;
                setDraftValue(value);
              }}
              minValue={dialogBounds(draftUnit()).min}
              maxValue={dialogBounds(draftUnit()).max}
              step={dialogStep()}
            >
              <p class="text-sm font-normal text-foreground">数值（{draftUnit()}）</p>
              <NumberFieldGroup class="w-full">
                <NumberFieldInput class="h-10 pr-7" />
                <NumberFieldIncrementTrigger />
                <NumberFieldDecrementTrigger />
              </NumberFieldGroup>
            </NumberField>
          </div>
          <ViewerAppDialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={confirmDialog}>确定</Button>
          </ViewerAppDialogFooter>
        </ViewerAppDialogContent>
      </ViewerAppDialog>
    </div>
  );
}
