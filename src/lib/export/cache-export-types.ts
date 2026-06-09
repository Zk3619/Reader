/**
 * 书架缓存导出选项（弹窗 / runner 共用）
 */

import type { ImageTargetFormat } from '@/lib/export/image-format-convert';

export type CacheExportKind = 'text' | 'image' | 'audio';

export type TextExportFormat = 'txt' | 'epub';
export type TextExportLayout = 'single' | 'split' | 'split_zip';

export type MediaExportDelivery = 'zip' | 'folder';

export type AudioTargetFormat = 'original' | 'mp3' | 'm4a';

export interface CacheExportOptions {
  kind: CacheExportKind;
  startIndex: number;
  endIndex: number;
  onlyCached?: boolean;
  textFormat?: TextExportFormat;
  textLayout?: TextExportLayout;
  imageDelivery?: MediaExportDelivery;
  imageTargetFormat?: ImageTargetFormat;
  imageGroupByChapter?: boolean;
  audioDelivery?: MediaExportDelivery;
  audioTargetFormat?: AudioTargetFormat;
  audioMergeSingle?: boolean;
}

export const DEFAULT_CACHE_EXPORT_OPTIONS: Required<
  Pick<
    CacheExportOptions,
    | 'textFormat'
    | 'textLayout'
    | 'imageDelivery'
    | 'imageTargetFormat'
    | 'imageGroupByChapter'
    | 'audioDelivery'
    | 'audioTargetFormat'
    | 'audioMergeSingle'
    | 'onlyCached'
  >
> = {
  onlyCached: true,
  textFormat: 'txt',
  textLayout: 'single',
  imageDelivery: 'zip',
  imageTargetFormat: 'original',
  imageGroupByChapter: true,
  audioDelivery: 'zip',
  audioTargetFormat: 'original',
  audioMergeSingle: false,
};
