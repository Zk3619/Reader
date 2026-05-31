/**
 * 统一 Viewer 状态（text / image / audio / video / file 共用�?
 */

import { createStore } from 'solid-js/store';
import type { ViewerState } from '@/stores/viewer/base-state';
import { defaultTextViewerUiConfig } from '@/lib/media/text/reader-ui-config';

export const initialViewerState: ViewerState = {
  kind: null,
  book: null,
  catalog: [],
  chapterIndex: 0,
  chapterPos: 0,
  guestReading: false,
  content: '',
  contentLoading: false,
  contentFetching: false,
  contentBootstrapping: false,
  showContent: false,
  config: defaultTextViewerUiConfig,
  popCataVisible: false,
  readSettingsVisible: false,
  miniInterface: false,
  rawContent: '',
  mediaUrls: [],
  primaryUrl: null,
  loading: false,
  error: null,
};

export const [state, setState] = createStore<ViewerState>({ ...initialViewerState });

export function resetViewerState(): void {
  setState({ ...initialViewerState, config: { ...defaultTextViewerUiConfig } });
}
