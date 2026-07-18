import { createEffect, onCleanup, type Component } from 'solid-js';
import { cn } from '@/lib/utils';
import type { WebAudioPlayerEngine } from '@/lib/media/audio/engine/web-audio-player';

/** 连续拖拽改窗口时，延迟重分配 canvas 位图，避免每帧 GPU 缓冲重建卡死 */
const CANVAS_RESIZE_SETTLE_MS = 160;

/** 对齐 lx getBarWidth：按画布宽度选择频谱柱宽 */
function getBarWidth(canvasWidth: number): number {
  const barWidth = (canvasWidth / 128) * 2.5;
  const width = canvasWidth / 86;
  const diffWidth = barWidth - width;
  if (diffWidth > 32) return canvasWidth / 128;
  if (diffWidth > 12) return width;
  return barWidth;
}

/**
 * 音频频谱可视化（对齐 lx AudioVisualizer）
 * 全屏绝对定位叠加在播放详情底层，pointer-events: none，柱体自底部向上生长。
 */
export const MusicAudioVisualizer: Component<{
  engine: () => WebAudioPlayerEngine | undefined;
  /** 为 false 时暂停 rAF，避免详情页隐藏后仍持续分析 */
  active?: boolean;
  class?: string;
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
  let maxHeightScale = 0;

  const stop = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };

  const resolveFillStyle = (): string => {
    if (!canvas) return 'hsl(var(--primary) / 0.16)';
    const styles = getComputedStyle(canvas);
    const fromVar = styles.getPropertyValue('--primary').trim();
    if (fromVar) return `hsl(${fromVar} / 0.16)`;
    return styles.color || 'hsl(var(--primary) / 0.16)';
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
    // 对齐 lx：柱高上限约为画布高度的 40%
    maxHeightScale = Math.round(((cssH * 0.4) / 255) * 10000) / 10000;
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
      if (!maxHeightScale && drawH > 0) {
        maxHeightScale = Math.round(((drawH * 0.4) / 255) * 10000) / 10000;
      }

      context.clearRect(0, 0, drawW, drawH);
      if (!freqBuffer || freqBuffer.length !== data.length) {
        freqBuffer = new Uint8Array(data.length);
      }
      freqBuffer.set(data);

      const bufferLength = freqBuffer.length;
      const barWidth = getBarWidth(drawW);
      const maxNum = 255;

      // 对齐 lx：先算全局能量均值再缩放柱高
      let frequencyAvg = 0;
      for (let i = 0; i < bufferLength; i++) {
        const mult = Math.floor(i / maxNum);
        const num =
          mult % 2 === 0 ? i - maxNum * mult : maxNum - (i - maxNum * mult);
        const spectrum = num > 90 ? 0 : (freqBuffer[num + 20] ?? 0);
        frequencyAvg += spectrum * 1.2;
      }
      frequencyAvg = (frequencyAvg / bufferLength) * 1.4;
      frequencyAvg /= maxNum;

      context.fillStyle = resolveFillStyle();
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        if (x > drawW) break;
        const raw = freqBuffer[i] ?? 0;
        const barHeight = (raw * frequencyAvg + raw * 0.42) * maxHeightScale;
        context.fillRect(x, drawH - barHeight, barWidth, barHeight);
        x += barWidth;
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

  return (
    <div
      class={cn(
        'pointer-events-none absolute inset-0 z-5 overflow-hidden',
        props.class,
      )}
      aria-hidden={true}
    >
      <canvas
        ref={canvas}
        class="h-full w-full text-primary"
        aria-label="音频频谱可视化"
      />
    </div>
  );
};
