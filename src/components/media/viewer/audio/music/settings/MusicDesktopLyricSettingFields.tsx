/**
 * 桌面歌词设置页数值控件：Slider + 原生 number input（对齐倍速 popover）
 */

import { createMemo, Show, type Component, type JSX } from 'solid-js';
import { Slider, SliderFill, SliderThumb, SliderTrack } from '@/components/ui/slider';
import { MusicAppSelect } from '@/components/media/viewer/audio/music/MusicAppSelect';
import { MusicSettingsNumberInput } from '@/components/media/viewer/audio/music/settings/MusicSettingsNumberInput';
import {
  clampDesktopLyricFontPx,
  clampDesktopLyricLineGapPx,
  clampDesktopLyricMetaFontPx,
  displayToPx,
  formatPxForUnit,
  pxConversionHint,
  DESKTOP_LYRIC_FONT_PX_MAX,
  DESKTOP_LYRIC_FONT_PX_MIN,
  DESKTOP_LYRIC_LINE_GAP_MAX,
  DESKTOP_LYRIC_LINE_GAP_MIN,
  DESKTOP_LYRIC_META_FONT_PX_MAX,
  DESKTOP_LYRIC_META_FONT_PX_MIN,
} from '@/lib/media/audio/desktop-lyric-units';
import {
  getRootFontSizePx,
  type MusicFontSizeUnit,
} from '@/lib/media/audio/play-detail-lyric-font';

const UNIT_OPTIONS: MusicFontSizeUnit[] = ['px', 'rem'];
const UNIT_LABELS: Record<MusicFontSizeUnit, string> = {
  px: 'px',
  rem: 'rem',
};

function clampFinite(value: number, min: number, max: number, round = false): number {
  if (!Number.isFinite(value)) return min;
  const next = Math.max(min, Math.min(max, value));
  return round ? Math.round(next) : next;
}

function SliderNumberRow(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  ariaLabel: string;
  disabled?: boolean;
  format?: (value: number) => string;
  onChange: (value: number) => void;
  children?: JSX.Element;
}): JSX.Element {
  const display = () => props.format?.(props.value) ?? String(props.value);
  const commit = (raw: number) => {
    if (props.disabled || !Number.isFinite(raw)) return;
    props.onChange(clampFinite(raw, props.min, props.max, props.step >= 1));
  };

  return (
    <div class="space-y-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-muted-foreground">{props.label}</span>
        <span class="tabular-nums text-foreground">
          {display()}
          {props.suffix ?? ''}
        </span>
      </div>
      <Slider
        class="w-full max-w-md"
        minValue={props.min}
        maxValue={props.max}
        step={props.step}
        value={[props.value]}
        disabled={props.disabled}
        onChange={(values) => commit(values[0] ?? props.value)}
      >
        <SliderTrack>
          <SliderFill />
          <SliderThumb />
        </SliderTrack>
      </Slider>
      <div class="flex flex-wrap items-center gap-2">
        <MusicSettingsNumberInput
          value={props.value}
          min={props.min}
          max={props.max}
          step={props.step}
          class="w-28"
          disabled={props.disabled}
          aria-label={props.ariaLabel}
          formatDisplay={props.format}
          onCommit={commit}
        />
        <Show when={props.suffix}>
          <span class="text-sm text-muted-foreground">{props.suffix}</span>
        </Show>
        {props.children}
      </div>
    </div>
  );
}

export const MusicDesktopLyricPxRemField: Component<{
  label: string;
  pxValue: number;
  unit: MusicFontSizeUnit;
  minPx: number;
  maxPx: number;
  stepPx?: number;
  clampPx: (px: number) => number;
  onPxChange: (px: number) => void;
  onUnitChange: (unit: MusicFontSizeUnit) => void;
  ariaLabel: string;
}> = (props) => {
  const rootPx = createMemo(() => getRootFontSizePx());
  const displayValue = createMemo(() =>
    formatPxForUnit(props.pxValue, props.unit, rootPx()),
  );
  const minDisplay = createMemo(() =>
    props.unit === 'rem'
      ? formatPxForUnit(props.minPx, 'rem', rootPx())
      : props.minPx,
  );
  const maxDisplay = createMemo(() =>
    props.unit === 'rem'
      ? formatPxForUnit(props.maxPx, 'rem', rootPx())
      : props.maxPx,
  );
  const step = () =>
    props.unit === 'rem'
      ? Math.max(0.01, (props.stepPx ?? 1) / rootPx())
      : (props.stepPx ?? 1);

  const commitDisplay = (raw: number) => {
    if (!Number.isFinite(raw)) return;
    props.onPxChange(props.clampPx(displayToPx(raw, props.unit, rootPx())));
  };

  return (
    <div class="space-y-2">
      <SliderNumberRow
        label={props.label}
        value={displayValue()}
        min={minDisplay()}
        max={maxDisplay()}
        step={step()}
        ariaLabel={props.ariaLabel}
        onChange={commitDisplay}
      >
        <MusicAppSelect
          value={props.unit}
          onChange={(value) => props.onUnitChange(value as MusicFontSizeUnit)}
          options={UNIT_OPTIONS}
          optionLabel={(value) => UNIT_LABELS[value]}
          triggerClass="w-20"
          aria-label={`${props.label}单位`}
        />
      </SliderNumberRow>
      <p class="text-xs text-muted-foreground">
        {pxConversionHint(props.pxValue, props.unit, rootPx())}
      </p>
    </div>
  );
};

export const MusicDesktopLyricFontSizeField: Component<{
  pxValue: number;
  unit: MusicFontSizeUnit;
  onPxChange: (px: number) => void;
  onUnitChange: (unit: MusicFontSizeUnit) => void;
}> = (props) => (
  <MusicDesktopLyricPxRemField
    label="歌词字体大小"
    pxValue={props.pxValue}
    unit={props.unit}
    minPx={DESKTOP_LYRIC_FONT_PX_MIN}
    maxPx={DESKTOP_LYRIC_FONT_PX_MAX}
    stepPx={1}
    clampPx={clampDesktopLyricFontPx}
    onPxChange={props.onPxChange}
    onUnitChange={props.onUnitChange}
    ariaLabel="桌面歌词字体大小"
  />
);

export const MusicDesktopLyricLineGapField: Component<{
  pxValue: number;
  unit: MusicFontSizeUnit;
  onPxChange: (px: number) => void;
  onUnitChange: (unit: MusicFontSizeUnit) => void;
}> = (props) => (
  <MusicDesktopLyricPxRemField
    label="歌词间距"
    pxValue={props.pxValue}
    unit={props.unit}
    minPx={DESKTOP_LYRIC_LINE_GAP_MIN}
    maxPx={DESKTOP_LYRIC_LINE_GAP_MAX}
    stepPx={1}
    clampPx={clampDesktopLyricLineGapPx}
    onPxChange={props.onPxChange}
    onUnitChange={props.onUnitChange}
    ariaLabel="桌面歌词行间距"
  />
);

export const MusicDesktopLyricMetaFontSizeField: Component<{
  pxValue: number;
  unit: MusicFontSizeUnit;
  onPxChange: (px: number) => void;
  onUnitChange: (unit: MusicFontSizeUnit) => void;
}> = (props) => (
  <MusicDesktopLyricPxRemField
    label="标题字号"
    pxValue={props.pxValue}
    unit={props.unit}
    minPx={DESKTOP_LYRIC_META_FONT_PX_MIN}
    maxPx={DESKTOP_LYRIC_META_FONT_PX_MAX}
    stepPx={1}
    clampPx={clampDesktopLyricMetaFontPx}
    onPxChange={props.onPxChange}
    onUnitChange={props.onUnitChange}
    ariaLabel="桌面歌词标题字号"
  />
);

export const MusicDesktopLyricPercentField: Component<{
  label: string;
  /** 0–1 */
  value: number;
  minPercent?: number;
  maxPercent?: number;
  onChange: (value: number) => void;
  ariaLabel: string;
}> = (props) => {
  const min = () => props.minPercent ?? 0;
  const max = () => props.maxPercent ?? 100;
  const percent = () => Math.round((props.value ?? 0) * 100);
  return (
    <SliderNumberRow
      label={props.label}
      value={percent()}
      min={min()}
      max={max()}
      step={1}
      suffix="%"
      ariaLabel={props.ariaLabel}
      onChange={(next) => props.onChange(next / 100)}
    />
  );
};

export const MusicDesktopLyricZoomScaleField: Component<{
  scale: number;
  onChange: (scale: number) => void;
}> = (props) => (
  <SliderNumberRow
    label="缩放幅度"
    value={Math.round((props.scale ?? 1.28) * 100)}
    min={100}
    max={160}
    step={1}
    suffix="%"
    ariaLabel="桌面歌词缩放幅度"
    onChange={(next) =>
      props.onChange(Math.max(1, Math.min(1.8, Math.round(next) / 100)))
    }
  />
);

export const MusicDesktopLyricMaxLinesField: Component<{
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}> = (props) => (
  <SliderNumberRow
    label="最多显示行数"
    value={props.value}
    min={1}
    max={8}
    step={1}
    disabled={props.disabled}
    ariaLabel="桌面歌词最大行数"
    onChange={(next) => props.onChange(clampFinite(next, 1, 8, true))}
  />
);
