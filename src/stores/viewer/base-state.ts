/**

 * 各类 Viewer（text / image / audio / video / file）共享的会话状态与类型

 */



import type { MediaKind } from '@/lib/book-source/book-type';

import type { Book, BookChapter } from '@/types';

import type { TextViewerUiConfig } from '@/lib/media/text/reader-ui-config';



/** 所�?Viewer 共享的基础状�?*/

export interface BaseViewerState {

  book: Book | null;

  catalog: BookChapter[];

  chapterIndex: number;

  chapterPos: number;

  guestReading: boolean;

}



/** 统一 Viewer 状态（text + �?text 媒体共用同一 store�?*/

export interface ViewerState extends BaseViewerState {

  kind: MediaKind | null;

  content: string;

  contentLoading: boolean;

  contentFetching: boolean;

  contentBootstrapping: boolean;

  showContent: boolean;

  config: TextViewerUiConfig;

  popCataVisible: boolean;

  readSettingsVisible: boolean;

  miniInterface: boolean;

  rawContent: string;

  mediaUrls: string[];

  primaryUrl: string | null;

  loading: boolean;

  error: string | null;

}



/** 共享 Store 能力 */

export interface BaseViewerStoreApi {

  saveProgress(): Promise<void>;

  closeBook(): Promise<void>;

  isGuestReading(): boolean;

}


