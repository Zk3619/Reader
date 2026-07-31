import type { DownloadHubSection } from '@/stores/download-hub/section';

/** 与 PageToolbar `px-4` 对齐的内容区水平留白，因内容区域使用了两侧预留，所以此处为 px-2 */
export const downloadHubContentInsetClass = 'px-2';

export const DOWNLOAD_HUB_SECTION_META: Record<
  DownloadHubSection,
  { title: string; description: string }
> = {
  tasks: { title: '下载', description: '任务队列与进度' },
  create: { title: '新建下载', description: '粘贴链接并选择引擎' },
  extensions: { title: '扩展', description: 'Gopeed 兼容扩展管理' },
  settings: { title: '下载设置', description: '目录、协议与媒体提取' },
};
