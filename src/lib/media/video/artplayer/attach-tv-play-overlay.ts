/**
 * 隐藏主壳顶栏时，用 Artplayer layers 叠加播放页顶栏（随 controls 显隐）
 */

import type Artplayer from 'artplayer';
import { lucideIconHtml } from '@/lib/media/video/artplayer/lucide-icons';

export interface TvPlayOverlayToolbarHandlers {
  onBack: () => void;
  onRefresh: () => void;
  onShowHeader: () => void;
}

export interface TvPlayOverlayToolbarHandle {
  update: (title: string, description: string) => void;
  setRefreshing: (busy: boolean) => void;
  detach: () => void;
}

function btn(label: string, className: string): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = className;
  el.setAttribute('aria-label', label);
  el.title = label;
  return el;
}

export function attachTvPlayOverlayToolbar(
  art: Artplayer,
  handlers: TvPlayOverlayToolbarHandlers,
): TvPlayOverlayToolbarHandle {
  const root = document.createElement('div');
  root.className = 'reader-tv-play-overlay';
  root.setAttribute('data-artplayer-plugin', 'tv-play-overlay');

  const back = btn('返回', 'reader-tv-play-overlay-btn');
  back.innerHTML = lucideIconHtml('arrow-left', { size: 18 });

  const meta = document.createElement('div');
  meta.className = 'reader-tv-play-overlay-meta';
  const titleEl = document.createElement('div');
  titleEl.className = 'reader-tv-play-overlay-title';
  const descEl = document.createElement('div');
  descEl.className = 'reader-tv-play-overlay-desc';
  meta.append(titleEl, descEl);

  const actions = document.createElement('div');
  actions.className = 'reader-tv-play-overlay-actions';

  const refresh = btn('刷新', 'reader-tv-play-overlay-btn');
  refresh.innerHTML = lucideIconHtml('refresh-cw', {
    size: 18,
    className: 'reader-tv-play-overlay-refresh-icon',
  });

  const showHeader = btn('显示顶栏', 'reader-tv-play-overlay-btn');
  showHeader.innerHTML = lucideIconHtml('panel-top', { size: 18 });

  actions.append(refresh, showHeader);
  root.append(back, meta, actions);

  const stop = (e: Event) => {
    e.stopPropagation();
  };

  const onBack = (e: MouseEvent) => {
    stop(e);
    handlers.onBack();
  };
  const onRefresh = (e: MouseEvent) => {
    stop(e);
    handlers.onRefresh();
  };
  const onShowHeader = (e: MouseEvent) => {
    stop(e);
    handlers.onShowHeader();
  };

  back.addEventListener('click', onBack);
  refresh.addEventListener('click', onRefresh);
  showHeader.addEventListener('click', onShowHeader);
  root.addEventListener('mousedown', stop);
  root.addEventListener('pointerdown', stop);

  art.layers.add({
    name: 'reader-tv-play-overlay',
    html: root,
    style: {
      position: 'absolute',
      inset: '0 auto auto 0',
      width: '100%',
      height: 'auto',
      zIndex: '70',
      pointerEvents: 'none',
    },
  });

  return {
    update(title, description) {
      titleEl.textContent = title;
      descEl.textContent = description;
      descEl.style.display = description ? '' : 'none';
    },
    setRefreshing(busy) {
      refresh.classList.toggle('is-busy', busy);
      refresh.disabled = busy;
    },
    detach() {
      back.removeEventListener('click', onBack);
      refresh.removeEventListener('click', onRefresh);
      showHeader.removeEventListener('click', onShowHeader);
      root.removeEventListener('mousedown', stop);
      root.removeEventListener('pointerdown', stop);
      try {
        art.layers.remove('reader-tv-play-overlay');
      } catch {
        root.remove();
      }
    },
  };
}
