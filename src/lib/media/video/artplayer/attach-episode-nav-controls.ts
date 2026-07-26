/**
 * 在 Artplayer 底栏挂载上一集 / 下一集（仅在有对应集时显示）
 */

import type Artplayer from 'artplayer';
import { lucideIconHtml } from '@/lib/media/video/artplayer/lucide-icons';

const PREV_NAME = 'reader-prev-episode';
const NEXT_NAME = 'reader-next-episode';

export interface EpisodeNavControlsHandlers {
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

export function attachEpisodeNavControls(
  art: Artplayer,
  handlers: EpisodeNavControlsHandlers,
): () => void {
  const names: string[] = [];

  if (handlers.hasPrev) {
    art.controls.add({
      name: PREV_NAME,
      position: 'left',
      index: 5,
      tooltip: '上一集',
      html: lucideIconHtml('skip-back', { size: 22, filled: true }),
      click: () => handlers.onPrev(),
    });
    names.push(PREV_NAME);
  }

  if (handlers.hasNext) {
    art.controls.add({
      name: NEXT_NAME,
      position: 'left',
      index: 15,
      tooltip: '下一集',
      html: lucideIconHtml('skip-forward', { size: 22, filled: true }),
      click: () => handlers.onNext(),
    });
    names.push(NEXT_NAME);
  }

  return () => {
    for (const name of names) {
      try {
        art.controls.remove(name);
      } catch {
        /* already destroyed */
      }
    }
  };
}
