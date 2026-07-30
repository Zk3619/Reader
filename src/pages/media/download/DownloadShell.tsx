/**
 * 下载模块壳：按 section 切换任务 / 新建 / 扩展 / 设置
 */

import { Match, Switch } from 'solid-js';
import { getDownloadHubState } from '@/stores/download-hub/section';
import { DownloadPage } from './DownloadPage';
import { DownloadCreatePage } from './DownloadCreatePage';
import { DownloadExtensionsPage } from './DownloadExtensionsPage';
import { DownloadSettingsPage } from './DownloadSettingsPage';

export function DownloadShell() {
  const hub = getDownloadHubState();
  return (
    <Switch>
      <Match when={hub.section === 'create'}>
        <DownloadCreatePage />
      </Match>
      <Match when={hub.section === 'extensions'}>
        <DownloadExtensionsPage />
      </Match>
      <Match when={hub.section === 'settings'}>
        <DownloadSettingsPage />
      </Match>
      <Match when={true}>
        <DownloadPage />
      </Match>
    </Switch>
  );
}
