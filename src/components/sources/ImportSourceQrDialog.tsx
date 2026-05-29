import { createSignal, Show } from 'solid-js';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { Button } from '@/components/ui/button';
import { TextField, TextFieldTextArea } from '@/components/ui/text-field';
import { showAppToast } from '@/components/shared/AppToasts';
import { decodeTextFromImageFile, isBarcodeDetectorAvailable } from '@/lib/qr/decode-from-image';
import { isCameraScanAvailable } from '@/lib/qr/decode-from-video';
import { QrCameraScanner } from '@/components/sources/QrCameraScanner';

export interface ImportSourceQrDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIdentify: (raw: string) => void;
  /** 内嵌页会话时须高于 .reader-inner-web-layer（如 z-[160]） */
  portalZClass?: string;
}

type QrInputMode = 'paste' | 'camera';

export function ImportSourceQrDialog(props: ImportSourceQrDialogProps) {
  const [raw, setRaw] = createSignal('');
  const [mode, setMode] = createSignal<QrInputMode>('paste');
  const cameraAvailable = isCameraScanAvailable();

  const handleIdentify = () => {
    const value = raw().trim();
    if (!value) return;
    props.onIdentify(value);
    props.onOpenChange(false);
    setRaw('');
    setMode('paste');
  };

  const handleOpenChange = (open: boolean) => {
    props.onOpenChange(open);
    if (!open) {
      setRaw('');
      setMode('paste');
    }
  };

  return (
    <AppDialog open={props.open} onOpenChange={handleOpenChange} modal>
      <AppDialogContent portalZClass={props.portalZClass}>
        <AppDialogHeader>
          <AppDialogTitle>二维码导入书源</AppDialogTitle>
          <AppDialogDescription>
            粘贴、摄像头扫描或从图片识别（`yuedu://`、`legado://`、书源 JSON 或 http/https 地址）。
          </AppDialogDescription>
        </AppDialogHeader>
        <div class="min-h-0 overflow-y-auto overscroll-contain px-6 py-4 contain-layout">
          <section class="space-y-3 rounded-lg border border-border/50 bg-muted/20 p-4">
            <div class="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={mode() === 'paste' ? 'default' : 'outline'}
                onClick={() => setMode('paste')}
              >
                粘贴内容
              </Button>
              <Show when={cameraAvailable}>
                <Button
                  type="button"
                  size="sm"
                  variant={mode() === 'camera' ? 'default' : 'outline'}
                  onClick={() => setMode('camera')}
                >
                  摄像头扫码
                </Button>
              </Show>
            </div>

            <Show when={mode() === 'camera'}>
              <QrCameraScanner
                onDecoded={(text) => {
                  setRaw(text);
                  setMode('paste');
                  showAppToast({ title: '已识别二维码', variant: 'default' });
                }}
                onError={(msg) => {
                  showAppToast({ title: msg, variant: 'destructive' });
                }}
              />
            </Show>

            <Show when={mode() === 'paste'}>
              <Show when={isBarcodeDetectorAvailable()}>
                <div class="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => document.getElementById('import-source-qr-file')?.click()}
                  >
                    从图片识别
                  </Button>
                  <label for="import-source-qr-file" class="sr-only">
                    选择包含二维码的图片文件
                  </label>
                  <input
                    id="import-source-qr-file"
                    type="file"
                    accept="image/*"
                    class="hidden"
                    aria-label="选择包含二维码的图片文件"
                    onChange={async (e) => {
                      const file = e.currentTarget.files?.[0];
                      e.currentTarget.value = '';
                      if (!file) return;
                      const text = await decodeTextFromImageFile(file);
                      if (text) {
                        setRaw(text);
                        showAppToast({ title: '已识别二维码', variant: 'default' });
                      } else {
                        showAppToast({
                          title: '未识别到二维码',
                          description: '请换一张更清晰的图片，或手动粘贴内容',
                          variant: 'destructive',
                        });
                      }
                    }}
                  />
                </div>
              </Show>
              <TextField>
                <TextFieldTextArea
                  value={raw()}
                  onInput={(e: Event) => setRaw((e.currentTarget as HTMLTextAreaElement).value)}
                  placeholder="yuedu://booksource/importonline?src=..."
                  rows={4}
                />
              </TextField>
            </Show>
          </section>
        </div>
        <AppDialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleIdentify} disabled={!raw().trim()}>
            确定
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
