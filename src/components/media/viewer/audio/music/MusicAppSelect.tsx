/**
 * 音乐模块内字符串选项下拉（封装 AppSelect）
 */

import type { JSX } from 'solid-js';
import {
  AppSelect,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
  type AppSelectTriggerLayout,
  type ScrollGutterMode,
} from '@/components/shared/AppSelect';
import { ViewerAppSelectContent } from '@/components/media/viewer/viewer-app-overlay';

export interface MusicAppSelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly T[];
  optionLabel?: (value: T) => string;
  triggerClass?: string;
  layout?: AppSelectTriggerLayout;
  /** 是否在选中项左侧显示 √（默认 true） */
  showCheckmark?: boolean;
  /**
   * 滚动条预留：both 两侧 / single 单侧 / auto 自动（默认）
   */
  scrollGutter?: ScrollGutterMode;
  'aria-label'?: string;
}

export function MusicAppSelect<T extends string>(props: MusicAppSelectProps<T>): JSX.Element {
  const label = (v: T) => props.optionLabel?.(v) ?? v;
  return (
    <AppSelect
      value={props.value}
      onChange={(v) => {
        if (v != null) props.onChange(v as T);
      }}
      options={[...props.options]}
      showCheckmark={props.showCheckmark}
      itemComponent={(itemProps) => (
        <AppSelectItem item={itemProps.item}>
          {label(itemProps.item.rawValue as T)}
        </AppSelectItem>
      )}
    >
      <AppSelectTrigger
        layout={props.layout}
        class={props.triggerClass}
        aria-label={props['aria-label']}
      >
        <AppSelectValue>
          {(state) => {
            const raw = state.selectedOption();
            return raw != null ? label(raw as T) : '';
          }}
        </AppSelectValue>
        <AppSelectIcon />
      </AppSelectTrigger>
      <ViewerAppSelectContent>
        <AppSelectListbox scrollGutter={props.scrollGutter} />
      </ViewerAppSelectContent>
    </AppSelect>
  );
}
