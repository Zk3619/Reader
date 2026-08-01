/**
 * 哔哩下载域配置（独立持久化键）
 */

import { getStorage, setStorage } from '@/lib/platform/storage';
import type { StreamFormat } from './types';

export const BILI_DOWNLOAD_CONFIG_KEY = 'download.bili.config.v1';

export interface BiliDownloadConfig {
  version: 1;
  default: {
    res: number;
    abr: number;
    enc: number;
    fmt: StreamFormat;
  };
  blockPcdn: boolean;
  convertDanmaku: boolean;
  addMetadata: boolean;
  autoDownload: boolean;
  format: {
    series: string;
    item: string;
    file: string;
  };
  organize: {
    autoRename: boolean;
    topFolder: boolean;
    subFolder: boolean;
  };
}

export const DEFAULT_BILI_DOWNLOAD_CONFIG: BiliDownloadConfig = {
  version: 1,
  default: {
    res: 80,
    abr: 30280,
    enc: 7,
    fmt: 'dash',
  },
  blockPcdn: true,
  convertDanmaku: true,
  addMetadata: true,
  autoDownload: true,
  format: {
    series: '{container} - {showtitle} ({downtime:YYYY-MM-DD_HH-mm-ss})',
    item: '({index}) {mediaType} - {title}',
    file: '{taskType} - {title}',
  },
  organize: {
    autoRename: true,
    topFolder: true,
    subFolder: true,
  },
};

let cached: BiliDownloadConfig | null = null;
let revision = 0;
const listeners = new Set<() => void>();

export function biliDownloadConfigRevision(): number {
  return revision;
}

export function subscribeBiliDownloadConfig(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function bump(): void {
  revision += 1;
  for (const listener of listeners) listener();
}

function normalize(raw: Partial<BiliDownloadConfig> | null | undefined): BiliDownloadConfig {
  const d = DEFAULT_BILI_DOWNLOAD_CONFIG;
  return {
    version: 1,
    default: {
      res: raw?.default?.res ?? d.default.res,
      abr: raw?.default?.abr ?? d.default.abr,
      enc: raw?.default?.enc ?? d.default.enc,
      fmt: raw?.default?.fmt ?? d.default.fmt,
    },
    blockPcdn: raw?.blockPcdn ?? d.blockPcdn,
    convertDanmaku: raw?.convertDanmaku ?? d.convertDanmaku,
    addMetadata: raw?.addMetadata ?? d.addMetadata,
    autoDownload: raw?.autoDownload ?? d.autoDownload,
    format: {
      series: raw?.format?.series ?? d.format.series,
      item: raw?.format?.item ?? d.format.item,
      file: raw?.format?.file ?? d.format.file,
    },
    organize: {
      autoRename: raw?.organize?.autoRename ?? d.organize.autoRename,
      topFolder: raw?.organize?.topFolder ?? d.organize.topFolder,
      subFolder: raw?.organize?.subFolder ?? d.organize.subFolder,
    },
  };
}

export async function getBiliDownloadConfig(): Promise<BiliDownloadConfig> {
  if (cached) return cached;
  try {
    const raw = await getStorage<Partial<BiliDownloadConfig>>(BILI_DOWNLOAD_CONFIG_KEY);
    cached = normalize(raw);
  } catch {
    cached = { ...DEFAULT_BILI_DOWNLOAD_CONFIG };
  }
  return cached;
}

export function getBiliDownloadConfigSync(): BiliDownloadConfig {
  return cached ?? { ...DEFAULT_BILI_DOWNLOAD_CONFIG };
}

export async function setBiliDownloadConfig(
  patch: Partial<BiliDownloadConfig>,
): Promise<BiliDownloadConfig> {
  const cur = await getBiliDownloadConfig();
  const next = normalize({
    ...cur,
    ...patch,
    default: { ...cur.default, ...patch.default },
    format: { ...cur.format, ...patch.format },
    organize: { ...cur.organize, ...patch.organize },
  });
  cached = next;
  await setStorage(BILI_DOWNLOAD_CONFIG_KEY, next);
  bump();
  return next;
}
