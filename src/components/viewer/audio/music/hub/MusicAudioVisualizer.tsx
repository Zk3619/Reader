import { createEffect, onCleanup, type Component } from 'solid-js';
import type { WebAudioPlayerEngine } from '@/lib/media/audio/engine/web-audio-player';

/** 连续拖拽改窗口时，延迟重分配 canvas 位图，避免每帧 GPU 缓冲重建卡死 */
const CANVAS_RESIZE_SETTLE_MS = 160;

export const MusicAudioVisualizer: Component<{
  engine: () => WebAudioPlayerEngine | undefined;
  /** 为 false 时暂停 rAF，避免详情页隐藏后仍持续分析 */
  active?: boolean;
}> = (props) => {
  let canvas: HTMLCanvasElement | undefined;
  let context: CanvasRenderingContext2D | null = null;
  let frame = 0;
  let freqBuffer: Uint8Array | undefined;
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingPixelW = 0;
  let pendingPixelH = 0;
  let appliedPixelW = 0;
  let appliedPixelH = 0;
  let lastCssW = 0;
  let lastCssH = 0;

  const stop = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };

  const applyCanvasSize = (pixelW: number, pixelH: number, cssW: number, cssH: number) => {
    if (!canvas || !context) return;
    if (canvas.width !== pixelW) canvas.width = pixelW;
    if (canvas.height !== pixelH) canvas.height = pixelH;
    appliedPixelW = pixelW;
    appliedPixelH = pixelH;
    lastCssW = cssW;
    lastCssH = cssH;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const scheduleCanvasResize = (pixelW: number, pixelH: number, cssW: number, cssH: number) => {
    pendingPixelW = pixelW;
    pendingPixelH = pixelH;
    lastCssW = cssW;
    lastCssH = cssH;
    if (appliedPixelW === 0 || appliedPixelH === 0) {
      applyCanvasSize(pixelW, pixelH, cssW, cssH);
      return;
    }
    if (resizeTimer !== undefined) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeTimer = undefined;
      applyCanvasSize(pendingPixelW, pendingPixelH, lastCssW, lastCssH);
    }, CANVAS_RESIZE_SETTLE_MS);
  };

  const draw = () => {
    if (props.active === false) {
      stop();
      return;
    }
    if (canvas && !context) {
      context = canvas.getContext('2d');
    }
    const engine = props.engine();
    const data = engine?.getFrequencyData();
    if (canvas && context && data) {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const pixelW = Math.max(1, Math.floor(width * dpr));
      const pixelH = Math.max(1, Math.floor(height * dpr));
      if (pixelW !== appliedPixelW || pixelH !== appliedPixelH) {
        scheduleCanvasResize(pixelW, pixelH, width, height);
      }
      const drawW = lastCssW || width;
      const drawH = lastCssH || height;
      context.clearRect(0, 0, drawW, drawH);
      if (!freqBuffer || freqBuffer.length !== data.length) {
        freqBuffer = new Uint8Array(data.length);
      }
      freqBuffer.set(data);
      const bars = 32;
      const barWidth = drawW / bars;
      context.fillStyle = 'currentColor';
      for (let i = 0; i < bars; i++) {
        const value = freqBuffer[Math.floor((i / bars) * freqBuffer.length)] ?? 0;
        const barHeight = Math.max(1, (value / 255) * drawH);
        context.fillRect(
          i * barWidth + 1,
          drawH - barHeight,
          Math.max(1, barWidth - 2),
          barHeight,
        );
      }
    }
    frame = requestAnimationFrame(draw);
  };

  createEffect(() => {
    stop();
    if (props.active === false) return;
    frame = requestAnimationFrame(draw);
  });
  onCleanup(() => {
    stop();
    if (resizeTimer !== undefined) clearTimeout(resizeTimer);
    context = null;
  });

  return <canvas ref={canvas} class="h-16 w-full text-primary" aria-label="音频频谱可视化" />;
};
