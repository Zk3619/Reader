/**
 * 按页翻页 bitmap 快照（对齐 Legado PageView.screenshot / CoverPageDelegate）
 */

let snapshotCanvas: HTMLCanvasElement | null = null;

function getSnapshotCanvas(w: number, h: number): HTMLCanvasElement {
  if (!snapshotCanvas) {
    snapshotCanvas = document.createElement('canvas');
  }
  snapshotCanvas.width = Math.max(1, Math.round(w));
  snapshotCanvas.height = Math.max(1, Math.round(h));
  return snapshotCanvas;
}

/** SVG foreignObject 将 DOM 栅格化为 data URL */
export async function captureElementToDataUrl(
  node: HTMLElement,
  width: number,
  height: number,
): Promise<string | null> {
  if (typeof document === 'undefined' || width <= 0 || height <= 0) return null;

  const w = Math.round(width);
  const h = Math.round(height);
  const clone = node.cloneNode(true) as HTMLElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  clone.style.margin = '0';
  clone.style.transform = 'none';
  clone.style.width = `${w}px`;
  // 快照须完整页内容；翻页卷曲会在 slide 上挂 clip-path，若带入 clone 会得到空白图
  clone.style.clipPath = 'none';
  clone.style.removeProperty('-webkit-clip-path');

  const serialized = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
<foreignObject width="100%" height="100%">${serialized}</foreignObject></svg>`;
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('snapshot image load failed'));
      img.src = url;
    });

    const canvas = getSnapshotCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = getComputedStyle(node).backgroundColor || '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function mountSnapshotImage(
  host: HTMLElement,
  dataUrl: string,
  alt = '',
): HTMLImageElement {
  host.replaceChildren();
  const img = document.createElement('img');
  img.src = dataUrl;
  img.alt = alt;
  img.draggable = false;
  img.className = 'reader-paged-snapshot h-full w-full object-fill pointer-events-none';
  img.setAttribute('aria-hidden', 'true');
  host.appendChild(img);
  return img;
}

export function clearSnapshotHost(host: HTMLElement | undefined): void {
  host?.replaceChildren();
}
