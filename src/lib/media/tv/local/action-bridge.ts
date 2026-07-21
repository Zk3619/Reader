/**
 * LOCAL API 事件监听（/action → Rust emit → 前端）
 */

import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
  submitTvSearch,
  clearTvDetailPlay,
  loadTvDetail,
} from '@/stores/tv-hub/detail';
import { importTvConfigUrl } from '@/stores/tv-hub/home';
import { getTvHubState, setTvSection } from '@/stores/tv-hub/section';
import { extractPlayUrl } from '../play/extractors';
import { clearLivePlayState, setLivePlayState } from '@/stores/tv-hub/live';
import { handleIncomingSync } from './sync';
import { showAppToast } from '@/components/shared/AppToasts';

let unlisten: UnlistenFn | null = null;

type LocalAction = {
  do: string;
  word?: string;
  url?: string;
  type?: string;
  text?: string;
  path?: string;
  json?: string;
  mode?: string;
  force?: string;
  device?: string;
  config?: string;
  targets?: string;
  configs?: string;
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
          case 'cast':
            if (p.url) {
              const extracted = await extractPlayUrl(p.url);
              clearTvDetailPlay();
              clearLivePlayState();
              setLivePlayState({
                url: extracted.url,
                name: p.do === 'cast' ? '投屏播放' : '推送播放',
                epgText: extracted.msg || '',
                lineIndex: 0,
                sourceName: '',
                groupName: '',
                channelName: '',
                urls: extracted.url ? [extracted.url] : [],
              });
              setTvSection('play');
              if (p.do === 'cast') {
                showAppToast({
                  title: '桌面无 DLNA',
                  description: '已按推送播放处理（cast→push）',
                });
              }
            }
            break;
          case 'control':
            {
              const { controlTvPlayer } = await import('../play/player-bridge');
              const ok = controlTvPlayer(p.type || '');
              if (!ok) console.warn('[tv-local] control failed', p.type);
            }
            break;
          case 'danmaku':
            {
              const { emitLocalDanmaku } = await import('../play/player-bridge');
              emitLocalDanmaku(p.text || '');
            }
            break;
          case 'refresh':
            await handleRefresh(p);
            break;
          case 'sync':
            {
              const msg = await handleIncomingSync(p);
              console.info('[tv-local]', msg);
              showAppToast({ title: '同步完成', description: msg });
            }
            break;
          case 'file':
            if (p.path) {
              const lower = p.path.toLowerCase();
              if (/\.(srt|ssa|ass|vtt)$/.test(lower)) {
                const { setPlaySubtitleFromPath } = await import(
                  '@/stores/tv-hub/detail'
                );
                setPlaySubtitleFromPath(p.path);
              } else {
                showAppToast({
                  title: '打开文件',
                  description: p.path,
                });
              }
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

async function handleRefresh(p: LocalAction): Promise<void> {
  const typ = p.type || '';
  if (typ === 'subtitle' && p.path) {
    const { setPlaySubtitleFromPath } = await import('@/stores/tv-hub/detail');
    setPlaySubtitleFromPath(p.path);
    return;
  }
  if (typ === 'danmaku' && p.path) {
    const { setPlayDanmakuFromUrl } = await import('@/stores/tv-hub/detail');
    setPlayDanmakuFromUrl(p.path);
    return;
  }
  if (typ === 'player') {
    const { playCurrentEpisode } = await import('@/stores/tv-hub/detail');
    await playCurrentEpisode();
    return;
  }
  if (typ === 'detail') {
    const hub = getTvHubState();
    if (hub.siteKey && hub.vodId) await loadTvDetail(hub.siteKey, hub.vodId);
    return;
  }
  if (typ === 'live') {
    setTvSection('live');
  }
}
