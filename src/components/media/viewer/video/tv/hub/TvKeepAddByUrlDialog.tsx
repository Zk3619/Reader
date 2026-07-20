/**
 * 通过网址 / 站点键添加影视到收藏
 */

import { createSignal } from 'solid-js';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { AppTextField, AppTextFieldInput } from '@/components/shared/AppTextField';
import * as TvDao from '@/lib/media/tv/db/tv-dao';
import { showAppToast } from '@/components/shared/AppToasts';
import { appDialogSettingsShell } from '@/lib/ui/viewport-classes';

export interface TvKeepAddByUrlDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}

export function TvKeepAddByUrlDialog(props: TvKeepAddByUrlDialogProps) {
  const [siteKey, setSiteKey] = createSignal('');
  const [vodId, setVodId] = createSignal('');
  const [vodName, setVodName] = createSignal('');
  const [busy, setBusy] = createSignal(false);

  const reset = () => {
    setSiteKey('');
    setVodId('');
    setVodName('');
  };

  const handleSubmit = async () => {
    const sk = siteKey().trim();
    const id = vodId().trim();
    const name = vodName().trim() || id;
    if (!sk || !id) {
      void showAppToast({ title: '请填写站点与影片 ID', variant: 'warning' });
      return;
    }
    setBusy(true);
    try {
      // 纯 URL：当作本地/直链
      const isUrl = /^https?:\/\//i.test(id) || /^https?:\/\//i.test(sk);
      if (isUrl) {
        const url = /^https?:\/\//i.test(id) ? id : sk;
        await TvDao.upsertKeep({
          key: `local$${url}`,
          siteKey: 'local',
          vodId: url,
          vodName: name || url,
          vodPic: '',
          kind: 'local',
          cid: 0,
          createdAt: Date.now(),
        });
      } else {
        await TvDao.upsertKeep({
          key: `${sk}$${id}`,
          siteKey: sk,
          vodId: id,
          vodName: name,
          vodPic: '',
          kind: 'vod',
          cid: 0,
          createdAt: Date.now(),
        });
      }
      void showAppToast({ title: '已加入收藏', description: name, variant: 'success' });
      reset();
      props.onOpenChange(false);
      props.onDone?.();
    } catch (e) {
      void showAppToast({
        title: '添加失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppDialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) reset();
        props.onOpenChange(open);
      }}
    >
      <AppDialogContent class={appDialogSettingsShell}>
        <AppDialogHeader>
          <AppDialogTitle>添加网址</AppDialogTitle>
          <AppDialogDescription>
            填写站点 key 与影片 ID；若填入 http(s) 直链则按本地片源收藏
          </AppDialogDescription>
        </AppDialogHeader>
        <div class="space-y-3 px-1 py-2">
          <div class="space-y-1.5">
            <Label for="tv-keep-add-site">站点 key</Label>
            <AppTextField>
              <AppTextFieldInput
                id="tv-keep-add-site"
                value={siteKey()}
                onInput={(e) => setSiteKey(e.currentTarget.value)}
                placeholder="例如源站 key，或视频 URL"
              />
            </AppTextField>
          </div>
          <div class="space-y-1.5">
            <Label for="tv-keep-add-id">影片 ID / URL</Label>
            <AppTextField>
              <AppTextFieldInput
                id="tv-keep-add-id"
                value={vodId()}
                onInput={(e) => setVodId(e.currentTarget.value)}
                placeholder="vod_id 或直链"
              />
            </AppTextField>
          </div>
          <div class="space-y-1.5">
            <Label for="tv-keep-add-name">显示名称（可选）</Label>
            <AppTextField>
              <AppTextFieldInput
                id="tv-keep-add-name"
                value={vodName()}
                onInput={(e) => setVodName(e.currentTarget.value)}
                placeholder="未填则使用 ID"
              />
            </AppTextField>
          </div>
        </div>
        <AppDialogFooter>
          <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" disabled={busy()} onClick={() => void handleSubmit()}>
            添加
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
