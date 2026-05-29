/**
 * 摄像头实时扫码（getUserMedia + BarcodeDetector）
 */

import { onMount, onCleanup, createSignal, Show } from 'solid-js';
import { decodeTextFromVideoElement, isCameraScanAvailable } from '@/lib/qr/decode-from-video';

export interface QrCameraScannerProps {
  onDecoded: (text: string) => void;
  onError?: (message: string) => void;
}

const SCAN_INTERVAL_MS = 280;

export function QrCameraScanner(props: QrCameraScannerProps) {
  const [status, setStatus] = createSignal<'loading' | 'scanning' | 'error'>('loading');
  const [errorText, setErrorText] = createSignal('');

  let videoEl: HTMLVideoElement | undefined;
  let stream: MediaStream | null = null;
  let scanTimer: ReturnType<typeof setInterval> | undefined;
  let decoding = false;

  function stopCamera() {
    if (scanTimer !== undefined) {
      clearInterval(scanTimer);
      scanTimer = undefined;
    }
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    if (videoEl) videoEl.srcObject = null;
  }

  async function scanFrame() {
    if (!videoEl || decoding) return;
    decoding = true;
    try {
      const text = await decodeTextFromVideoElement(videoEl);
      if (text) {
        stopCamera();
        props.onDecoded(text);
      }
    } finally {
      decoding = false;
    }
  }

  onMount(async () => {
    if (!isCameraScanAvailable()) {
      const msg = '当前环境不支持摄像头扫码（需 HTTPS 或 localhost，且浏览器支持 BarcodeDetector）';
      setErrorText(msg);
      setStatus('error');
      props.onError?.(msg);
      return;
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      if (!videoEl) {
        stopCamera();
        return;
      }
      videoEl.srcObject = stream;
      await videoEl.play();
      setStatus('scanning');
      scanTimer = setInterval(() => void scanFrame(), SCAN_INTERVAL_MS);
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message.includes('Permission')
            ? '未获得摄像头权限，请在浏览器设置中允许访问摄像头'
            : e.message
          : '无法打开摄像头';
      setErrorText(msg);
      setStatus('error');
      props.onError?.(msg);
      stopCamera();
    }
  });

  onCleanup(stopCamera);

  return (
    <div class="space-y-2">
      <div class="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-black">
        <video
          ref={videoEl}
          class="h-full w-full object-cover"
          playsinline
          muted
          autoplay
        />
        <Show when={status() === 'loading'}>
          <div class="absolute inset-0 flex items-center justify-center bg-black/50 text-sm text-white">
            正在启动摄像头…
          </div>
        </Show>
      </div>
      <Show when={status() === 'scanning'}>
        <p class="text-center text-xs text-muted-foreground">将二维码对准画面，识别成功后会自动填入</p>
      </Show>
      <Show when={status() === 'error'}>
        <p class="text-center text-xs text-destructive">{errorText()}</p>
      </Show>
    </div>
  );
}
