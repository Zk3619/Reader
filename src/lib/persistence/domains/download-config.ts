/**
 * 下载模块持久化配置（对齐 Gopeed DownloaderStoreConfig 子集 + yt-dlp 选项）
 */

import { getStorage, setStorage } from '@/lib/platform/storage';
import {
  normalizeModuleProxyMode,
  type ModuleProxyMode,
} from '@/lib/settings/outbound-proxy';

export const DOWNLOAD_CONFIG_KEY = 'download.module.config.v1';

/** follow=跟随壳；其余为本模块覆盖（system 读入时迁为 follow） */
export type DownloadProxyMode = ModuleProxyMode;

export interface DownloadHttpProtocolConfig {
  connections: number;
  userAgent: string;
  useServerCtime: boolean;
}

export interface DownloadBtProtocolConfig {
  listenPort: number;
  trackers: string[];
  seedKeep: boolean;
  seedRatio: number;
  seedTimeMinutes: number;
}

export interface DownloadEd2kProtocolConfig {
  tcpPort: number;
  udpPort: number;
  serverList: string[];
}

export interface DownloadModuleConfig {
  version: 1;
  downloadDir: string;
  maxRunning: number;
  proxyMode: DownloadProxyMode;
  proxyUrl: string;
  skipVerifyCert: boolean;
  autoTorrent: boolean;
  archiveEnabled: boolean;
  autoDeleteMissingFileTasks: boolean;
  webhookUrl: string;
  doneScripts: string[];
  protocolConfig: {
    http: DownloadHttpProtocolConfig;
    bt: DownloadBtProtocolConfig;
    ed2k: DownloadEd2kProtocolConfig;
  };
    ytdlp: {
      mergeOutputFormat: 'mp4' | 'mkv' | 'webm' | 'default';
      writeSubs: boolean;
      writeAutoSubs: boolean;
      subLangs: string;
      embedMetadata: boolean;
      embedThumbnail: boolean;
      downloadArchivePath: string;
      /** Opt-in: ffmpeg -i rtmp:// for rtmp / rtmp_ffmpeg formats */
      allowRtmpFfmpeg: boolean;
    };
}

export const DEFAULT_DOWNLOAD_CONFIG: DownloadModuleConfig = {
  version: 1,
  downloadDir: '',
  maxRunning: 5,
  proxyMode: 'follow',
  proxyUrl: '',
  skipVerifyCert: false,
  autoTorrent: true,
  archiveEnabled: true,
  autoDeleteMissingFileTasks: false,
  webhookUrl: '',
  doneScripts: [],
  protocolConfig: {
    http: {
      connections: 16,
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      useServerCtime: false,
    },
    bt: {
      listenPort: 0,
      trackers: [],
      seedKeep: false,
      seedRatio: 1.0,
      seedTimeMinutes: 0,
    },
    ed2k: {
      tcpPort: 4662,
      udpPort: 4672,
      serverList: [],
    },
  },
  ytdlp: {
    mergeOutputFormat: 'mp4',
    writeSubs: false,
    writeAutoSubs: false,
    subLangs: 'zh-Hans,zh-Hant,en.*,all,-live_chat',
    embedMetadata: true,
    embedThumbnail: false,
    downloadArchivePath: '',
    allowRtmpFfmpeg: false,
  },
};

let cached: DownloadModuleConfig | null = null;
let revision = 0;
const listeners = new Set<() => void>();

export function downloadConfigRevision(): number {
  return revision;
}

export function subscribeDownloadConfig(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function bump(): void {
  revision += 1;
  for (const listener of listeners) listener();
}

export async function getDownloadConfig(): Promise<DownloadModuleConfig> {
  if (cached) return cached;
  try {
    const raw = await getStorage(DOWNLOAD_CONFIG_KEY);
    if (raw && typeof raw === 'object') {
      cached = { ...DEFAULT_DOWNLOAD_CONFIG, ...(raw as DownloadModuleConfig), version: 1 };
      cached.proxyMode = normalizeModuleProxyMode(
        (raw as { proxyMode?: unknown }).proxyMode ?? cached.proxyMode,
      );
      cached.protocolConfig = {
        http: { ...DEFAULT_DOWNLOAD_CONFIG.protocolConfig.http, ...cached.protocolConfig?.http },
        bt: { ...DEFAULT_DOWNLOAD_CONFIG.protocolConfig.bt, ...cached.protocolConfig?.bt },
        ed2k: { ...DEFAULT_DOWNLOAD_CONFIG.protocolConfig.ed2k, ...cached.protocolConfig?.ed2k },
      };
      cached.ytdlp = { ...DEFAULT_DOWNLOAD_CONFIG.ytdlp, ...cached.ytdlp };
      return cached;
    }
  } catch {
    /* ignore */
  }
  cached = { ...DEFAULT_DOWNLOAD_CONFIG };
  return cached;
}

export async function setDownloadConfig(
  patch: Partial<DownloadModuleConfig>,
): Promise<DownloadModuleConfig> {
  const current = await getDownloadConfig();
  const next: DownloadModuleConfig = {
    ...current,
    ...patch,
    version: 1,
    proxyMode: normalizeModuleProxyMode(patch.proxyMode ?? current.proxyMode),
    protocolConfig: {
      http: { ...current.protocolConfig.http, ...patch.protocolConfig?.http },
      bt: { ...current.protocolConfig.bt, ...patch.protocolConfig?.bt },
      ed2k: { ...current.protocolConfig.ed2k, ...patch.protocolConfig?.ed2k },
    },
    ytdlp: { ...current.ytdlp, ...patch.ytdlp },
  };
  cached = next;
  await setStorage(DOWNLOAD_CONFIG_KEY, next);
  bump();
  return next;
}
