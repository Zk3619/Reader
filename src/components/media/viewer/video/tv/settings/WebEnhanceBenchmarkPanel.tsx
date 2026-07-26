/**
 * Web 增强帧预算 benchmark（settings-regression 交付物）
 * @see docs/VIDEO_WEB_ENHANCE.md
 */

import { createSignal, onCleanup, Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  detectEnhanceCaps,
  FrameBudgetAccumulator,
  resolveAnime4KWebPass,
  decideRifeCascade,
  ensureDemuxServer,
} from '@/lib/media/video/enhance';
import { getVideoPlaybackPrefs } from '@/lib/media/video/playback/prefs';

export function WebEnhanceBenchmarkPanel() {
  const [running, setRunning] = createSignal(false);
  const [log, setLog] = createSignal('');
  const [capsLine, setCapsLine] = createSignal('');
  let timer: number | undefined;

  const refreshCaps = async () => {
    const c = await detectEnhanceCaps(true);
    const line = `codecs=${c.webCodecs} gpu=${c.webgpu} gl2=${c.webgl2} ort=${c.ortWebgpu} demux=${c.rustDemux} native=${c.rustNative} mpv=${c.mpv}`;
    setCapsLine(line);
    const demux = await ensureDemuxServer();
    setLog(`[caps] ${line}\n[demux] ${demux.detail}`);
  };

  const runSynthetic = () => {
    if (running()) return;
    setRunning(true);
    const acc = new FrameBudgetAccumulator();
    const prefs = getVideoPlaybackPrefs();
    let n = 0;
    const tick = () => {
      const t0 = performance.now();
      // 合成负载：模拟 SR 耗时
      let x = 0;
      for (let i = 0; i < 5000; i++) x += Math.sin(i);
      void x;
      const srMs = performance.now() - t0 + Math.random() * 2;
      acc.push({ srMs, presentMs: 1, totalMs: srMs + 1 });
      n += 1;
      if (n >= 120) {
        const r = acc.report();
        const pass = resolveAnime4KWebPass({
          mode: prefs.anime4kMode === 'off' ? 'A' : prefs.anime4kMode,
          quality: prefs.anime4kQuality,
          sourceHeight: 2160,
          displayHeight: 1080,
        });
        const rife = decideRifeCascade({
          codedHeight: 2160,
          maxInputHeight: prefs.frameInterpMaxInputHeight,
          sourceFps: 24,
          maxInputFps: prefs.frameInterpMaxInputFps,
          displayRefreshHz: 60,
          frameInterpEnabled: true,
          watchdogAllowsRife: true,
        });
        setLog(
          `[budget] n=${r.samples} avgTotal=${r.avgTotalMs.toFixed(2)}ms max=${r.maxTotalMs.toFixed(2)}ms avgSR=${r.avgSrMs.toFixed(2)}ms\n` +
            `[4K gate] ${pass.reason} pass=${pass.pass}\n` +
            `[rife 4K] run=${'runRife' in rife && rife.runRife} ${'reason' in rife ? rife.reason : ''}`,
        );
        setRunning(false);
        return;
      }
      timer = window.setTimeout(tick, 0) as unknown as number;
    };
    tick();
  };

  onCleanup(() => {
    if (timer) clearTimeout(timer);
  });

  return (
    <div class="space-y-2 rounded-md border border-border p-3">
      <p class="text-xs font-medium">Web Enhance Benchmark</p>
      <p class="text-[11px] text-muted-foreground">
        帧预算表供看门狗阈值；4K 源应只 SR 不插值。
      </p>
      <p class="text-[11px] text-muted-foreground break-all">{capsLine()}</p>
      <div class="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" class="h-7 text-xs" onClick={() => void refreshCaps()}>
          刷新 caps / demux
        </Button>
        <Button
          size="sm"
          variant="outline"
          class="h-7 text-xs"
          disabled={running()}
          onClick={runSynthetic}
        >
          {running() ? '跑分中…' : '合成帧预算 120 帧'}
        </Button>
      </div>
      <Show when={log()}>
        <pre class="max-h-40 overflow-auto whitespace-pre-wrap text-[11px] text-muted-foreground">
          {log()}
        </pre>
      </Show>
    </div>
  );
}
