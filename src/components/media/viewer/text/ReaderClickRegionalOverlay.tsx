/**
 * 文本阅读器九宫格点击区域配置（接 textViewerStore）
 */

import { textViewerStore } from '@/stores/viewer';
import { DEFAULT_CLICK_ACTIONS } from '@/lib/media/text/reader-click-actions';
import {
  clampClickRegion,
  DEFAULT_CLICK_REGION,
} from '@/lib/media/text/reader-click-region';
import {
  ClickRegionalOverlay,
} from '@/components/media/viewer/ClickRegionalOverlay';

export interface ReaderClickRegionalOverlayProps {
  open: boolean;
  onClose: () => void;
  markHintSeenOnClose?: boolean;
  onPickerOpenChange?: (open: boolean) => void;
}

export function ReaderClickRegionalOverlay(props: ReaderClickRegionalOverlayProps) {
  return (
    <ClickRegionalOverlay
      open={props.open}
      onClose={props.onClose}
      markHintSeenOnClose={props.markHintSeenOnClose}
      onPickerOpenChange={props.onPickerOpenChange}
      config={() => ({
        clickActions: textViewerStore.state.config.clickActions,
        clickRegion: textViewerStore.state.config.clickRegion,
      })}
      onPatch={(patch) => textViewerStore.setConfig(patch)}
    />
  );
}

export function resetClickRegionalConfig(): void {
  textViewerStore.setConfig({
    clickActions: { ...DEFAULT_CLICK_ACTIONS },
    clickRegion: clampClickRegion({ ...DEFAULT_CLICK_REGION }),
  });
}
