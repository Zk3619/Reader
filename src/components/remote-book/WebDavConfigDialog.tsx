import { appDialogScrollBodySpaceY4 } from '@/lib/ui/viewport-classes';
/**
 * WebDAV 配置对话框（远程书籍 + 云备份共用）
 */

import { createSignal, createEffect } from 'solid-js';
import {
  AppDialogScrollBody,
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { Button } from '@/components/ui/button';
import { TextField, TextFieldInput } from '@/components/ui/text-field';
import { Label } from '@/components/ui/label';
import { AppSwitch, AppSwitchControl, AppSwitchLabel, AppSwitchThumb } from '@/components/shared/AppSwitch';
import { showAppToast } from '@/components/shared/AppToasts';
import {
  DEFAULT_ROOT_BOOK_PATH,
  DEFAULT_WEBDAV_DIR,
  DEFAULT_WEBDAV_URL,
  getDefaultDeviceName,
  loadWebDavConfig,
  saveWebDavConfig,
} from '@/lib/remote-book/webdav-config-storage';
import { saveWebDavConfigAndInit } from '@/lib/backup/webdav-backup';
import type { WebDavConfig } from '@/types/remote-book';

export interface WebDavConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfigSaved?: (config: WebDavConfig) => void;
}

export function WebDavConfigDialog(props: WebDavConfigDialogProps) {
  const [url, setUrl] = createSignal(DEFAULT_WEBDAV_URL);
  const [username, setUsername] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [webDavDir, setWebDavDir] = createSignal(DEFAULT_WEBDAV_DIR);
  const [deviceName, setDeviceName] = createSignal(getDefaultDeviceName());
  const [rootBookPath, setRootBookPath] = createSignal(DEFAULT_ROOT_BOOK_PATH);
  const [autoBackupEnabled, setAutoBackupEnabled] = createSignal(false);
  const [autoCheckNewBackup, setAutoCheckNewBackup] = createSignal(true);
  const [isSaving, setIsSaving] = createSignal(false);
  const [isTesting, setIsTesting] = createSignal(false);

  createEffect(() => {
    if (!props.open) return;
    void (async () => {
      try {
        const saved = await loadWebDavConfig();
        if (saved) {
          setUrl(saved.url || DEFAULT_WEBDAV_URL);
          setUsername(saved.username || '');
          setPassword(saved.password || '');
          setWebDavDir(saved.webDavDir || DEFAULT_WEBDAV_DIR);
          setDeviceName(saved.deviceName || getDefaultDeviceName());
          setRootBookPath(saved.rootBookPath || DEFAULT_ROOT_BOOK_PATH);
          setAutoBackupEnabled(saved.autoBackupEnabled === true);
          setAutoCheckNewBackup(saved.autoCheckNewBackup !== false);
        }
      } catch (error) {
        console.warn('加载 WebDAV 配置失败:', error);
      }
    })();
  });

  function buildDraftConfig(): WebDavConfig | null {
    const urlValue = url().trim();
    const usernameValue = username().trim();
    const passwordValue = password().trim();
    if (!urlValue || !usernameValue || !passwordValue) return null;
    if (!urlValue.startsWith('http://') && !urlValue.startsWith('https://')) return null;
    return {
      url: urlValue,
      username: usernameValue,
      password: passwordValue,
      webDavDir: webDavDir().trim() || DEFAULT_WEBDAV_DIR,
      deviceName: deviceName().trim() || getDefaultDeviceName(),
      rootBookPath: rootBookPath().trim() || DEFAULT_ROOT_BOOK_PATH,
      autoBackupEnabled: autoBackupEnabled(),
      autoCheckNewBackup: autoCheckNewBackup(),
    };
  }

  const handleTest = async () => {
    const config = buildDraftConfig();
    if (!config) {
      showAppToast({ title: '配置不完整', description: '请填写服务器地址、用户名和密码', variant: 'error' });
      return;
    }
    setIsTesting(true);
    try {
      await saveWebDavConfigAndInit(config);
      showAppToast({ title: '连接成功', description: 'WebDAV 目录已就绪', variant: 'success' });
    } catch (error) {
      showAppToast({
        title: '连接失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    const config = buildDraftConfig();
    if (!config) {
      showAppToast({
        title: '配置不完整',
        description: '请填写有效的 WebDAV 地址与账号密码',
        variant: 'error',
      });
      return;
    }

    setIsSaving(true);
    try {
      const saved = await saveWebDavConfig(config);
      showAppToast({ title: '保存成功', description: 'WebDAV 配置已保存', variant: 'success' });
      props.onConfigSaved?.(saved);
      props.onOpenChange(false);
    } catch (error) {
      showAppToast({
        title: '保存失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent class="max-w-lg">
        <AppDialogHeader>
          <AppDialogTitle>WebDAV 配置</AppDialogTitle>
          <AppDialogDescription>
            对齐 Legado：用于云备份与远程书籍。默认子目录为 legado，备份文件为 backup{'{日期}-{设备}'}.zip
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogScrollBody class={appDialogScrollBodySpaceY4}>
          <div class="space-y-2">
            <Label for="webdav-url">服务器地址 *</Label>
            <TextField>
              <TextFieldInput
                id="webdav-url"
                type="url"
                placeholder={DEFAULT_WEBDAV_URL}
                value={url()}
                onInput={(e: Event) => setUrl((e.currentTarget as HTMLInputElement).value)}
                disabled={isSaving() || isTesting()}
              />
            </TextField>
          </div>
          <div class="space-y-2">
            <Label for="webdav-username">用户名 *</Label>
            <TextField>
              <TextFieldInput
                id="webdav-username"
                value={username()}
                onInput={(e: Event) => setUsername((e.currentTarget as HTMLInputElement).value)}
                disabled={isSaving() || isTesting()}
              />
            </TextField>
          </div>
          <div class="space-y-2">
            <Label for="webdav-password">密码 *</Label>
            <TextField>
              <TextFieldInput
                id="webdav-password"
                type="password"
                value={password()}
                onInput={(e: Event) => setPassword((e.currentTarget as HTMLInputElement).value)}
                disabled={isSaving() || isTesting()}
              />
            </TextField>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="space-y-2">
              <Label for="webdav-dir">云同步子目录</Label>
              <TextField>
                <TextFieldInput
                  id="webdav-dir"
                  placeholder={DEFAULT_WEBDAV_DIR}
                  value={webDavDir()}
                  onInput={(e: Event) => setWebDavDir((e.currentTarget as HTMLInputElement).value)}
                  disabled={isSaving() || isTesting()}
                />
              </TextField>
            </div>
            <div class="space-y-2">
              <Label for="webdav-device">设备名</Label>
              <TextField>
                <TextFieldInput
                  id="webdav-device"
                  value={deviceName()}
                  onInput={(e: Event) => setDeviceName((e.currentTarget as HTMLInputElement).value)}
                  disabled={isSaving() || isTesting()}
                />
              </TextField>
            </div>
          </div>
          <div class="space-y-2">
            <Label for="webdav-root-path">远程书籍目录</Label>
            <TextField>
              <TextFieldInput
                id="webdav-root-path"
                placeholder={DEFAULT_ROOT_BOOK_PATH}
                value={rootBookPath()}
                onInput={(e: Event) => setRootBookPath((e.currentTarget as HTMLInputElement).value)}
                disabled={isSaving() || isTesting()}
              />
            </TextField>
          </div>
          <AppSwitch checked={autoBackupEnabled()} onChange={setAutoBackupEnabled}>
            <AppSwitchControl>
              <AppSwitchThumb />
            </AppSwitchControl>
            <AppSwitchLabel>自动云备份（24 小时间隔，打开设置页时检查）</AppSwitchLabel>
          </AppSwitch>
          <AppSwitch checked={autoCheckNewBackup()} onChange={setAutoCheckNewBackup}>
            <AppSwitchControl>
              <AppSwitchThumb />
            </AppSwitchControl>
            <AppSwitchLabel>检测云端是否有更新备份</AppSwitchLabel>
          </AppSwitch>
        </AppDialogScrollBody>
        <AppDialogFooter class="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => void handleTest()} disabled={isSaving() || isTesting()}>
            {isTesting() ? '测试中…' : '测试连接'}
          </Button>
          <div class="flex gap-2 sm:ml-auto">
            <Button variant="outline" onClick={() => props.onOpenChange(false)} disabled={isSaving()}>
              取消
            </Button>
            <Button onClick={() => void handleSave()} disabled={isSaving() || isTesting()}>
              {isSaving() ? '保存中…' : '保存'}
            </Button>
          </div>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
