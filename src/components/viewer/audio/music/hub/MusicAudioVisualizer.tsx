import { onCleanup, onMount, type Component } from 'solid-js';
import type { WebAudioPlayerEngine } from '@/lib/media/audio/engine/web-audio-player';

export const MusicAudioVisualizer: Component<{
  engine: () => WebAudioPlayerEngine | undefined;
}> = (props) => {
  let canvas: HTMLCanvasElement | undefined;
  let frame = 0;

  onMount(() => {
    const draw = () => {
      const context = canvas?.getContext('2d');
      const data = props.engine()?.getFrequencyData();
      if (canvas && context && data) {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        context.clearRect(0, 0, width, height);
        const bars = 32;
        const barWidth = width / bars;
        context.fillStyle = 'currentColor';
        for (let i = 0; i < bars; i++) {
          const value = data[Math.floor((i / bars) * data.length)] ?? 0;
          const barHeight = Math.max(1, (value / 255) * height);
          context.fillRect(i * barWidth + 1, height - barHeight, Math.max(1, barWidth - 2), barHeight);
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
  });
  onCleanup(() => cancelAnimationFrame(frame));

  return <canvas ref={canvas} class="h-16 w-full text-primary" aria-label="音频频谱可视化" />;
};
