/**
 * 播放详情歌词字号：NumberField + rem/px 单位切换与换算提示
 */

import { createMemo, type Component } from 'solid-js';
import {
  NumberField,
  NumberFieldDecrementTrigger,
  NumberFieldGroup,
  NumberFieldIncrementTrigger,
  NumberFieldInput,
} from '@/components/ui/number-field';
import { MusicAppSelect } from '@/components/viewer/audio/music/MusicAppSelect';
import {
  PLAY_DETAIL_LYRIC_FONT_REM_MAX,
  PLAY_DETAIL_LYRIC_FONT_REM_MIN,
  displayValueToRem,
  fontSizeConversionHint,
  formatFontSizeForUnit,
  getRootFontSizePx,
  remToPx,
  type MusicFontSizeUnit,
} from '@/lib/media/audio/play-detail-lyric-font';

const UNIT_OPTIONS: MusicFontSizeUnit[] = ['rem', 'px'];
const UNIT_LABELS: Record<MusicFontSizeUnit, string> = {
  rem: 'rem',
  px: 'px',
};

export interface MusicPlayDetailLyricFontSizeFieldProps {
  /** 已归一的 rem 字号 */
  remValue: number;
  unit: MusicFontSizeUnit;
  onRemChange: (rem: number) => void;
  onUnitChange: (unit: MusicFontSizeUnit) => void;
  /** 紧凑布局（详情页弹层） */
  compact?: boolean;
}

export const MusicPlayDetailLyricFontSizeField: Component<
  MusicPlayDetailLyricFontSizeFieldProps
> = (props) => {
  const rootPx = createMemo(() => getRootFontSizePx());
  const displayValue = createMemo(() =>
    formatFontSizeForUnit(props.remValue, props.unit, rootPx()),
  );
  const minDisplay = createMemo(() =>
    props.unit === 'px'
      ? remToPx(PLAY_DETAIL_LYRIC_FONT_REM_MIN, rootPx())
      : PLAY_DETAIL_LYRIC_FONT_REM_MIN,
  );
  const maxDisplay = createMemo(() =>
    props.unit === 'px'
      ? remToPx(PLAY_DETAIL_LYRIC_FONT_REM_MAX, rootPx())
      : PLAY_DETAIL_LYRIC_FONT_REM_MAX,
  );

  const commit = (raw: number) => {
    // 输入清空或中间态时 NumberField 可能给出 NaN，勿回写以免打断输入
    if (!Number.isFinite(raw)) return;
    props.onRemChange(displayValueToRem(raw, props.unit, rootPx()));
  };

  return (
    <div class="space-y-1">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-muted-foreground">
          {props.compact ? '字号' : '歌词字体大小：'}
        </span>
        <NumberField
          rawValue={displayValue()}
          onRawValueChange={commit}
          minValue={minDisplay()}
          maxValue={maxDisplay()}
          step={props.unit === 'px' ? 1 : 0.05}
          formatOptions={
            props.unit === 'px'
              ? { maximumFractionDigits: 1 }
              : { maximumFractionDigits: 3 }
          }
        >
          <NumberFieldGroup class="w-28">
            <NumberFieldInput
              class="pr-6"
              aria-label="播放详情歌词字号"
            />
            <NumberFieldIncrementTrigger />
            <NumberFieldDecrementTrigger />
          </NumberFieldGroup>
        </NumberField>
        <MusicAppSelect
          value={props.unit}
          onChange={(value) => props.onUnitChange(value as MusicFontSizeUnit)}
          options={UNIT_OPTIONS}
          optionLabel={(value) => UNIT_LABELS[value]}
          triggerClass="w-20"
          aria-label="歌词字号单位"
        />
      </div>
      <p class="text-xs text-muted-foreground">
        {fontSizeConversionHint(props.remValue, props.unit, rootPx())}
      </p>
    </div>
  );
};
