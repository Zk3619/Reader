/**
 * LOCAL API 事件监听（/action → Rust emit → 前端）
 */

import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { submitTvSearch } from '@/stores/tv-hub/detail';
import { importTvConfigUrl } from '@/stores/tv-hub/home';
import { setTvSection } from '@/stores/tv-hub/section';
import { extractPlayUrl } from '../play/extractors';
import { setLivePlayState } from '@/components/viewer/tv/panes/TvLivePane';

let unlisten: UnlistenFn | null = null;

type LocalAction = {
  do: string;
  word?: string;
  url?: string;
  type?: string;
};

export async function ensureTvLocalActionBridge(): Promise<void> {
  if (unlisten) return;
  try {
    unlisten = await listen<LocalAction>('tv-local-action', (ev) => {
      const p = ev.payload;
      void (async () => {
        switch (p.do) {
          case 'search':
            if (p.word) {
              setTvSection('search');
              await submitTvSearch(p.word);
            }
            break;
          case 'setting':
            if (p.url) await importTvConfigUrl(p.url);
            break;
          case 'push':
            if (p.url) {
              const extracted = await extractPlayUrl(p.url);
              setLivePlayState({
                url: extracted.url,
                name: '推送播放',
                epgText: '',
              });
              setTvSection('play');
            }
            break;
          case 'control':
            {
              const { controlTvPlayer } = await import('../play/player-bridge');
              const ok = controlTvPlayer(p.type || '');
              if (!ok) console.warn('[tv-local] control failed', p.type);
            }
            break;
          default:
            console.info('[tv-local]', p);
        }
      })();
    });
  } catch (e) {
    console.warn('[tv-local-action]', e);
  }
}
