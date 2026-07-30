/**
 * 下载模块会话状态
 */

import { createStore } from 'solid-js/store';

export type DownloadHubSection = 'tasks' | 'create' | 'extensions' | 'settings';

const [downloadState, setDownloadState] = createStore({
  section: 'tasks' as DownloadHubSection,
  createUrl: '',
  selectedTaskId: '',
});

export function getDownloadHubState() {
  return downloadState;
}

export function setDownloadSection(section: DownloadHubSection): void {
  setDownloadState('section', section);
}

export function setDownloadCreateUrl(url: string): void {
  setDownloadState('createUrl', url);
}

export function setDownloadSelectedTaskId(taskId: string): void {
  setDownloadState('selectedTaskId', taskId);
}

export function downloadHubSectionValue(): DownloadHubSection {
  return downloadState.section;
}
