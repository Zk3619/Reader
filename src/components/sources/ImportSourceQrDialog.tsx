import { createSignal, Show } from 'solid-js';
import { createUniqueId } from 'solid-js';
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
import { decodeTextFromImageFile } from '@/lib/qr/decode-from-image';
import {
  getCameraInputUnavailableMessage,
} from '@/lib/qr/camera-errors';
import { isCameraInputAvailable } from '@/lib/qr/decode-from-video';
import { QrCameraScanner } from '@/components/sources/QrCameraScanner';

export interface ImportSourceQrDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIdentify: (raw: string) => void;
  /** 内嵌页会话时须高于 .reader-inner-web-layer（如 z-[160]） */
  portalZClass?: string;
  /**
   * 扫码导入：摄像头扫码 / 图片识别（全平台），识别后自动导入，无粘贴输入。
   * @deprecated 使用 autoImport
   */
  cameraOnly?: boolean;
  /** 扫码/识图后自动导入（无粘贴输入） */
  autoImport?: boolean;
}

type QrInputMode = 'paste' | 'camera';

const QR_IMPORT_ACTION_BUTTON_CLASS = 'min-h-9 flex-1';

function QrImagePicker(props: {
  inputId: string;
  onDecoded: (text: string) => void;
  buttonClass?: string;
  disabled?: boolean;
}) {
  const pickImage = () => {
    document.getElementById(props.inputId)?.click();
  };

  const handleFileChange = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const text = await decodeTextFromImageFile(file);
    if (text) {
      props.onDecoded(text);
      return;
    }

    showAppToast({
      title: '未识别到二维码',
      description: '请换一张更清晰的图片',
      variant: 'destructive',
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        class={props.buttonClass}
        disabled={props.disabled}
        onClick={pickImage}
      >
        选择图片识别
      </Button>
      <label for={props.inputId} class="sr-only">
        选择包含二维码的图片文件
      </label>
      <input
        id={props.inputId}
        type="file"
        accept="image/*"
        class="hidden"
        aria-label="选择包含二维码的图片文件"
        onChange={handleFileChange}
      />
    </>
  );
}

export function ImportSourceQrDialog(props: ImportSourceQrDialogProps) {
  const imageInputId = createUniqueId();
  const [raw, setRaw] = createSignal('');
  const [mode, setMode] = createSignal<QrInputMode>('paste');
  const [cameraActive, setCameraActive] = createSignal(false);
  const useAutoImport = () => props.autoImport ?? props.cameraOnly ?? false;

  const notifyCameraError = (msg: string) => {
    showAppToast({ title: msg, variant: 'destructive' });
    setCameraActive(false);
  };

  const handleIdentify = () => {
    const value = raw().trim();
    if (!value) return;
    props.onIdentify(value);
    props.onOpenChange(false);
    setRaw('');
    setMode('paste');
  };

  const handleDecoded = (text: string) => {
    props.onIdentify(text);
    props.onOpenChange(false);
    setRaw('');
    setMode('paste');
    setCameraActive(false);
    showAppToast({ title: '已识别二维码', variant: 'default' });
  };

  const handleOpenChange = (open: boolean) => {
    props.onOpenChange(open);
    if (!open) {
      setRaw('');
      setMode('paste');
      setCameraActive(false);
    }
  };

  const openCamera = () => {
    if (!isCameraInputAvailable()) {
      notifyCameraError(getCameraInputUnavailableMessage());
      return;
    }
    setCameraActive(true);
  };

  return (
    <AppDialog open={props.open} onOpenChange={handleOpenChange} modal>
      <AppDialogContent portalToBody portalZClass={props.portalZClass}>
        <AppDialogHeader>
          <AppDialogTitle>二维码导入书源</AppDialogTitle>
          <AppDialogDescription>
            {useAutoImport()
              ? '使用摄像头扫码或选择图片识别书源二维码。'
              : '粘贴、摄像头扫描或从图片识别（`yuedu://`、`legado://`、书源 JSON 或 http/https 地址）。'}
          </AppDialogDescription>
        </AppDialogHeader>
        <div class="min-h-0 overflow-y-auto overscroll-contain px-6 py-4 contain-layout">
          <Show
            when={useAutoImport()}
            fallback={
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
                  <Show when={isCameraInputAvailable()}>
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
                    autoStart
                    onScanning={() => {
                      showAppToast({
                        title: '摄像头已就绪',
                        description: '将二维码对准画面，识别成功后会自动导入',
                        variant: 'default',
                      });
                    }}
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
                  <QrImagePicker
                    inputId={imageInputId}
                    onDecoded={(text) => {
                      setRaw(text);
                      showAppToast({ title: '已识别二维码', variant: 'default' });
                    }}
                  />
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
            }
          >
            <section class="space-y-3 rounded-lg border border-border/50 bg-muted/20 p-4">
              <div class="flex gap-2">
                <Show when={isCameraInputAvailable()}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    class={QR_IMPORT_ACTION_BUTTON_CLASS}
                    disabled={cameraActive()}
                    onClick={openCamera}
                  >
                    打开摄像头
                  </Button>
                </Show>
                <QrImagePicker
                  inputId={imageInputId}
                  buttonClass={QR_IMPORT_ACTION_BUTTON_CLASS}
                  disabled={cameraActive()}
                  onDecoded={handleDecoded}
                />
              </div>
              <Show when={cameraActive() && props.open}>
                <QrCameraScanner
                  autoStart
                  onScanning={() => {
                    showAppToast({
                      title: '摄像头已就绪',
                      description: '将二维码对准画面，识别成功后会自动导入',
                      variant: 'default',
                    });
                  }}
                  onDecoded={handleDecoded}
                  onError={notifyCameraError}
                />
              </Show>
            </section>
          </Show>
        </div>
        <AppDialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            取消
          </Button>
          <Show when={!useAutoImport()}>
            <Button onClick={handleIdentify} disabled={!raw().trim()}>
              确定
            </Button>
          </Show>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
