import { createSignal, Show } from 'solid-js';
import { createUniqueId } from 'solid-js';
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
  /** ????????? .reader-inner-web-layer?? z-[160]? */
  portalZClass?: string;
  /**
   * ?????????? / ????????????????????????
   * @deprecated ?? autoImport
   */
  cameraOnly?: boolean;
  /** ??/?????????????? */
  autoImport?: boolean;
  title?: string;
  description?: string;
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
      title: '???????',
      description: '??????????',
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
        ??????
      </Button>
      <label for={props.inputId} class="sr-only">
        ????????????
      </label>
      <input
        id={props.inputId}
        type="file"
        accept="image/*"
        class="hidden"
        aria-label="????????????"
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
    showAppToast({ title: '??????', variant: 'default' });
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
          <AppDialogTitle>{props.title ?? '???????'}</AppDialogTitle>
          <AppDialogDescription>
            {props.description ??
              (useAutoImport()
                ? '????????????????????'
                : '???????????????`yuedu://`?`legado://`??? JSON ? http/https ????')}
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogScrollBody>
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
                    ????
                  </Button>
                  <Show when={isCameraInputAvailable()}>
                    <Button
                      type="button"
                      size="sm"
                      variant={mode() === 'camera' ? 'default' : 'outline'}
                      onClick={() => setMode('camera')}
                    >
                      ?????
                    </Button>
                  </Show>
                </div>

                <Show when={mode() === 'camera'}>
                  <QrCameraScanner
                    autoStart
                    onScanning={() => {
                      showAppToast({
                        title: '??????',
                        description: '???????????????????',
                        variant: 'default',
                      });
                    }}
                    onDecoded={(text) => {
                      setRaw(text);
                      setMode('paste');
                      showAppToast({ title: '??????', variant: 'default' });
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
                      showAppToast({ title: '??????', variant: 'default' });
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
                    ?????
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
                      title: '??????',
                      description: '???????????????????',
                      variant: 'default',
                    });
                  }}
                  onDecoded={handleDecoded}
                  onError={notifyCameraError}
                />
              </Show>
            </section>
          </Show>
        </AppDialogScrollBody>
        <AppDialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            ??
          </Button>
          <Show when={!useAutoImport()}>
            <Button onClick={handleIdentify} disabled={!raw().trim()}>
              ??
            </Button>
          </Show>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
