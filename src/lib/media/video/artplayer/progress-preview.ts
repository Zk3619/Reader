/**
 * B 站风格进度预览：悬停三角指示 + 缩略图底栏时间刻度
 * （不填充未播放区间；VTT 缩略图由 artplayer-plugin-vtt-thumbnail 负责）
 */

import type Artplayer from 'artplayer';

function pad2(n: number): string {
  return String(Math.floor(Math.max(0, n))).padStart(2, '0');
}

/** mm:ss 或 h:mm:ss */
export function formatArtProgressTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 3600);
  if (h > 0) return `${h}:${pad2(m)}:${pad2(s)}`;
  return `${pad2(m)}:${pad2(s)}`;
}

function ensureThumbTimeEl($thumb: HTMLElement): HTMLElement {
  let el = $thumb.querySelector<HTMLElement>('.reader-thumb-time');
  if (el) return el;
  el = document.createElement('div');
  el.className = 'reader-thumb-time';
  $thumb.appendChild(el);
  return el;
}

function queryThumbnails(art: Artplayer, $progress: HTMLElement): HTMLElement | null {
  const fromControls = art.controls?.['vtt-thumbnail'] as HTMLElement | undefined;
  if (fromControls?.isConnected) return fromControls;
  return (
    $progress
      .closest('.art-video-player')
      ?.querySelector<HTMLElement>('.art-control-thumbnails') ?? null
  );
}

/** 插件用 inline display 表示意图；CSS 强制 flex 后靠此类做显隐动画 */
function setThumbPreviewVisible($thumb: HTMLElement | null, visible: boolean): void {
  if (!$thumb) return;
  $thumb.classList.toggle('reader-thumb-visible', visible);
}

export interface ProgressPreviewOptions {
  /** 配置了 VTT 时优先写缩略图底栏时间，不显示独立时间气泡 */
  preferThumbTime?: boolean;
}

/**
 * 在已创建的 Artplayer 上挂载悬停三角与缩略图时间。
 * 应在 `new Artplayer` 之后调用（VTT 控件可能稍后异步出现）。
 */
export function attachBilibiliProgressPreview(
  art: Artplayer,
  opts?: ProgressPreviewOptions,
): () => void {
  const $progress = art.template?.$progress;
  if (!$progress) return () => undefined;

  const preferThumb = opts?.preferThumbTime === true;

  const scrub = document.createElement('div');
  scrub.className = 'reader-progress-scrub';
  scrub.setAttribute('aria-hidden', 'true');
  scrub.innerHTML =
    '<span class="reader-progress-scrub-tri reader-progress-scrub-tri--up"></span>' +
    '<span class="reader-progress-scrub-tri reader-progress-scrub-tri--down"></span>';
  $progress.appendChild(scrub);

  const tip = document.createElement('div');
  tip.className = 'reader-progress-hover-tip';
  tip.setAttribute('aria-hidden', 'true');
  $progress.appendChild(tip);

  const hide = () => {
    scrub.classList.remove('is-visible');
    tip.classList.remove('is-visible');
    setThumbPreviewVisible(queryThumbnails(art, $progress), false);
  };

  const onSetBar = (type: string, percentage: number) => {
    if (type !== 'hover') return;
    const duration = art.duration || 0;
    const trackW = $progress.clientWidth;
    if (!trackW || percentage <= 0 || percentage >= 1) {
      hide();
      return;
    }

    const x = trackW * percentage;
    const timeText = formatArtProgressTime(percentage * duration);

    scrub.style.left = `${x}px`;
    scrub.classList.add('is-visible');

    // VTT 插件与本监听同帧；下一帧再读插件写入的 display，驱动淡入
    requestAnimationFrame(() => {
      const $thumb = queryThumbnails(art, $progress);
      if ($thumb) {
        ensureThumbTimeEl($thumb).textContent = timeText;
      }

      // 插件仍用 style.display 表达「是否有帧」；我们用 class 做动画显隐
      const pluginWantsShow = !!$thumb && $thumb.style.display === 'flex';
      setThumbPreviewVisible($thumb, pluginWantsShow);

      if (pluginWantsShow || preferThumb) {
        tip.classList.remove('is-visible');
        return;
      }

      tip.textContent = timeText;
      tip.style.left = `${x}px`;
      tip.classList.add('is-visible');
    });
  };

  const onHover = (state: boolean) => {
    if (!state) hide();
  };

  art.on('setBar', onSetBar);
  art.on('hover', onHover);

  return () => {
    art.off('setBar', onSetBar);
    art.off('hover', onHover);
    setThumbPreviewVisible(queryThumbnails(art, $progress), false);
    scrub.remove();
    tip.remove();
  };
}
