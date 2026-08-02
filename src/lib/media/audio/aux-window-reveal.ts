/**
 * 辅助窗口：首帧绘制完成后再显示，避免重启恢复时全白闪屏。
 */

export function waitNextPaint(frames = 2): Promise<void> {
  return new Promise((resolve) => {
    const step = (left: number) => {
      if (left <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(() => step(left - 1));
    };
    step(Math.max(1, frames));
  });
}

export async function waitFontsReady(timeoutMs = 400): Promise<void> {
  const fonts = (
    document as Document & { fonts?: { ready?: Promise<unknown> } }
  ).fonts?.ready;
  if (!fonts) return;
  await Promise.race([
    fonts.then(() => undefined).catch(() => undefined),
    new Promise<void>((r) => window.setTimeout(r, timeoutMs)),
  ]);
}

/** 等布局/字体落定；超时也继续，避免永久隐藏 */
export async function waitAuxWindowReady(opts?: {
  frames?: number;
  fontTimeoutMs?: number;
  extraDelayMs?: number;
}): Promise<void> {
  await waitNextPaint(opts?.frames ?? 2);
  await waitFontsReady(opts?.fontTimeoutMs ?? 400);
  const extra = opts?.extraDelayMs ?? 0;
  if (extra > 0) {
    await new Promise<void>((r) => window.setTimeout(r, extra));
  }
}
