import { createSignal } from 'solid-js';
import type { ReaderChapterLayoutEngine } from '@/lib/media/text/reader-chapter-layout-types';

export type PagedLayoutEngineDebug = ReaderChapterLayoutEngine | 'idle';

export const [pagedLayoutEngine, setPagedLayoutEngine] =
  createSignal<PagedLayoutEngineDebug>('idle');

export const [pagedLayoutCacheHit, setPagedLayoutCacheHit] = createSignal(false);

export const [pagedLayoutPrefetchStatus, setPagedLayoutPrefetchStatus] =
  createSignal('');
