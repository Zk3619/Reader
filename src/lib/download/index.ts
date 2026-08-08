/**
 * 下载模块公共导出
 */

export type {
  DownloadEngineKind,
  DownloadTaskState,
  DownloadTask,
  DownloadTaskMeta,
  ResolveProtocol,
  ResolveResult,
  ResolveFileEntry,
} from '@/lib/download/task-model';
export { createEmptyTask } from '@/lib/download/task-model';

export {
  DOWNLOAD_CATEGORIES,
  LEGACY_DOWNLOAD_CATEGORIES,
  classifyDownloadCategory,
  inferYtdlpMediaHint,
  joinDownloadCategoryPath,
  downloadCategoryDirName,
  expandDownloadDeletePaths,
  type DownloadCategory,
} from '@/lib/download/categories';

export {
  DownloadService,
  getDownloadService,
  resetDownloadServiceForTests,
  type ProbeOptions,
  type DownloadServiceOptions,
  type CreateDownloadTaskOptions,
} from '@/lib/download/service';

export {
  TaskQueue,
  getTaskQueue,
  resetTaskQueueForTests,
  type TaskQueueEvent,
  type TaskQueueListener,
  type TaskQueueOptions,
  type CreateTaskOptions,
} from '@/lib/download/gopeed/queue';

export {
  resolveUrl,
  detectProtocol,
  type DetectedProtocol,
} from '@/lib/download/gopeed/resolve';

export {
  getDownloadConfig,
  setDownloadConfig,
  subscribeDownloadConfig,
  downloadConfigRevision,
  DEFAULT_DOWNLOAD_CONFIG,
  DOWNLOAD_CONFIG_KEY,
  type DownloadModuleConfig,
} from '@/lib/download/gopeed/config';

export {
  extractArchive,
  isArchiveFile,
  defaultArchiveExtractor,
  type ArchiveExtractOptions,
  type ArchiveExtractResult,
  type ArchiveExtractProgress,
  type ArchiveExtractor,
} from '@/lib/download/gopeed/archive';

export {
  fireDownloadWebhook,
  postWebhook,
  type WebhookEvent,
  type WebhookData,
  type WebhookSendResult,
} from '@/lib/download/gopeed/webhook';

export {
  runDoneScripts,
  type ScriptEvent,
  type ScriptRunResult,
} from '@/lib/download/gopeed/script';

export {
  ExtensionHost,
  getExtensionHost,
  resetExtensionHostForTests,
  buildGopeedPrelude,
  type ExtensionHostOptions,
} from '@/lib/download/gopeed/extensions/host';

export {
  matchUrlPattern,
  matchAnyUrlPattern,
} from '@/lib/download/gopeed/extensions/match';

export type {
  ActivationEvent,
  Extension,
  ExtensionManifest,
  ExtensionScript,
  ExtensionSetting,
  ExtensionMatch,
  ExtensionRepository,
  OnResolveContext,
  OnTaskContext,
  SettingType,
} from '@/lib/download/gopeed/extensions/types';

export {
  buildExtensionIdentity,
  validateManifest,
} from '@/lib/download/gopeed/extensions/types';

export type * from '@/lib/download/ytdlp/types';
export { YoutubeDL, extractInfo } from '@/lib/download/ytdlp';
export {
  listExtractors,
  getExtractorForUrl,
  ensureBuiltinLoaded,
} from '@/lib/download/ytdlp/registry';
