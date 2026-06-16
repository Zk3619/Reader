/**
 * 书源导入进度（本地 / 网络 / 二维码）
 */

export type BookSourceImportStage = 'fetch' | 'parse' | 'compare' | 'file';

export interface BookSourceImportProgress {
  stage: BookSourceImportStage;
  message: string;
  current?: number;
  total?: number;
}

export type BookSourceImportProgressCallback = (progress: BookSourceImportProgress) => void;
