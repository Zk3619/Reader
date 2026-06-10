/**
 * 摄像头实时扫码（getUserMedia + BarcodeDetector / jsQR）
 */

import { onCleanup, onMount, createSignal, Show } from 'solid-js';
import {
  decodeTextFromVideoElement,
  isCameraInputAvailable,
} from '@/lib/qr/decode-from-video';
import { buildCameraVideoConstraints } from '@/lib/qr/camera-media';
import {
  getCameraInputUnavailableMessage,
  getCameraStartErrorMessage,
} from '@/lib/qr/camera-errors';

export interface QrCameraScannerProps {
  onDecoded: (text: string) => void;
  onError?: (message: string) => void;
  /** 挂载后自动请求摄像头（由父级在点击「打开摄像头」后挂载） */
  autoStart?: boolean;
  /** 进入扫码状态（预览已就绪） */
  onScanning?: () => void;
}

const SCAN_INTERVAL_MS = 280;

export function QrCameraScanner(props: QrCameraScannerProps) {
  const [started, setStarted] = createSignal(false);
  const [status, setStatus] = createSignal<'idle' | 'loading' | 'scanning'>('idle');

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
    setStarted(false);
    setStatus('idle');
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

  async function ensureVideoElement(): Promise<HTMLVideoElement | null> {
    if (videoEl) return videoEl;
    for (let i = 0; i < 30; i += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (videoEl) return videoEl;
    }
    return null;
  }

  async function startCamera() {
    if (!isCameraInputAvailable()) {
      props.onError?.(getCameraInputUnavailableMessage());
      return;
    }

    setStarted(true);
    setStatus('loading');

    try {
      const el = await ensureVideoElement();
      if (!el) {
        throw new Error('无法初始化摄像头预览');
      }

      stream = await navigator.mediaDevices.getUserMedia({
        video: buildCameraVideoConstraints(),
        audio: false,
      });
      el.srcObject = stream;
      await el.play();
      setStatus('scanning');
      props.onScanning?.();
      scanTimer = setInterval(() => void scanFrame(), SCAN_INTERVAL_MS);
    } catch (e) {
      props.onError?.(getCameraStartErrorMessage(e));
      stopCamera();
    }
  }

  onMount(() => {
    if (props.autoStart) {
      void startCamera();
    }
  });

  onCleanup(stopCamera);

  return (
    <Show when={started()}>
      <div class="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-black">
        <video
          ref={videoEl}
          class="h-full w-full object-cover"
          playsinline
          webkit-playsinline
          muted
          autoplay
          disablepictureinpicture
        />
        <Show when={status() === 'loading'}>
          <div class="absolute inset-0 flex items-center justify-center bg-black/50 text-sm text-white">
            正在启动摄像头…
          </div>
        </Show>
      </div>
    </Show>
  );
}
