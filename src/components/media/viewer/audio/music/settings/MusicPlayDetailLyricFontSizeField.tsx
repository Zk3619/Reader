/**
 * 播放详情歌词字号：number 输入 + rem/px 单位切换与换算提示
 * 仅在失焦/提交时做范围校验。
 */

import { createMemo, type Component } from 'solid-js';
import { MusicAppSelect } from '@/components/media/viewer/audio/music/MusicAppSelect';
import { MusicSettingsNumberInput } from '@/components/media/viewer/audio/music/settings/MusicSettingsNumberInput';
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

  return (
    <div class="space-y-1">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-muted-foreground">
          {props.compact ? '字号' : '歌词字体大小：'}
        </span>
        <MusicSettingsNumberInput
          value={displayValue()}
          min={minDisplay()}
          max={maxDisplay()}
          step={props.unit === 'px' ? 1 : 0.05}
          class="w-28"
          aria-label="播放详情歌词字号"
          onCommit={(raw) => {
            props.onRemChange(displayValueToRem(raw, props.unit, rootPx()));
          }}
        />
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
