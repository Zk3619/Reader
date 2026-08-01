/**
 * 哔哩下载页会话状态
 */

import { createStore } from 'solid-js/store';
import type {
  MediaInfo,
  MediaItem,
  MediaType,
  PopupProvider,
  PopupSelect,
  BiliUserProfile,
} from '@/lib/download/bili/types';
import type { HistoryEntry } from '@/lib/download/bili/history';

export type BiliPane = 'search' | 'history';

const [state, setState] = createStore({
  pane: 'search' as BiliPane,
  input: '',
  mediaTypeHint: 'auto' as MediaType | 'auto',
  loading: false,
  error: '' as string,
  media: null as MediaInfo | null,
  selected: [] as number[],
  sectionTarget: undefined as number | undefined,
  user: null as BiliUserProfile | null,
  popupOpen: false,
  popupProvider: null as PopupProvider | null,
  popupSelect: null as PopupSelect | null,
  popupItems: [] as MediaItem[],
  enqueueing: false,
  history: [] as HistoryEntry[],
  historyNext: 0,
  historyKeyword: '',
  historyLoading: false,
});

export function getBiliHubState() {
  return state;
}

export function setBiliPane(pane: BiliPane) {
  setState('pane', pane);
}

export function setBiliInput(v: string) {
  setState('input', v);
}

export function setBiliMediaTypeHint(v: MediaType | 'auto') {
  setState('mediaTypeHint', v);
}

export function setBiliLoading(v: boolean) {
  setState('loading', v);
}

export function setBiliError(v: string) {
  setState('error', v);
}

export function setBiliMedia(media: MediaInfo | null) {
  setState({
    media,
    selected: media ? media.list.map((_, i) => i).filter((i) => media.list[i]?.isTarget) : [],
    sectionTarget: media?.sections?.target,
    error: '',
  });
  if (media && state.selected.length === 0 && media.list.length) {
    setState('selected', [0]);
  }
}

export function setBiliSelected(indexes: number[]) {
  setState('selected', indexes);
}

export function toggleBiliSelected(index: number, multi = true) {
  const cur = state.selected;
  if (!multi) {
    setState('selected', [index]);
    return;
  }
  if (cur.includes(index)) {
    setState(
      'selected',
      cur.filter((i) => i !== index),
    );
  } else {
    setState('selected', [...cur, index].sort((a, b) => a - b));
  }
}

export function setBiliSectionTarget(target: number) {
  setState('sectionTarget', target);
}

export function setBiliUser(user: BiliUserProfile | null) {
  setState('user', user);
}

export function openBiliPopup(
  items: MediaItem[],
  provider: PopupProvider,
  select: PopupSelect,
) {
  setState({
    popupOpen: true,
    popupItems: items,
    popupProvider: provider,
    popupSelect: select,
  });
}

export function closeBiliPopup() {
  setState({
    popupOpen: false,
    popupProvider: null,
    popupSelect: null,
    popupItems: [],
  });
}

export function patchBiliPopupSelect(patch: Partial<PopupSelect>) {
  if (!state.popupSelect) return;
  setState('popupSelect', { ...state.popupSelect, ...patch });
}

export function setBiliEnqueueing(v: boolean) {
  setState('enqueueing', v);
}

export function setBiliHistory(
  list: HistoryEntry[],
  next: number,
  append = false,
) {
  setState({
    history: append ? [...state.history, ...list] : list,
    historyNext: next,
  });
}

export function setBiliHistoryKeyword(v: string) {
  setState('historyKeyword', v);
}

export function setBiliHistoryLoading(v: boolean) {
  setState('historyLoading', v);
}
