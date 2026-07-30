/**
 * 下载配置：从 persistence 域再导出，供 gopeed 子模块统一引用
 */

export {
  DOWNLOAD_CONFIG_KEY,
  DEFAULT_DOWNLOAD_CONFIG,
  getDownloadConfig,
  setDownloadConfig,
  subscribeDownloadConfig,
  downloadConfigRevision,
  type DownloadModuleConfig,
  type DownloadProxyMode,
  type DownloadHttpProtocolConfig,
  type DownloadBtProtocolConfig,
  type DownloadEd2kProtocolConfig,
} from '@/lib/persistence/domains/download-config';
