/**
 * 音乐 Deeplink（lxmusic:// / reader-music://）
 */

import { openListFromUrlInput } from '@/stores/music-hub/songList';
import { navigateToMusicHub } from '@/stores/shell-tabs';
import { setMusicSection } from '@/stores/viewer/media/audio';
import { showAppToast } from '@/components/shared/AppToasts';
import type { MusicSdkSource } from '@/lib/media/audio/music-sdk';

export function isMusicDeepLink(uri: string): boolean {
  const t = uri.trim().toLowerCase();
  return t.startsWith('lxmusic://') || t.startsWith('reader-music://');
}

export async function handleMusicDeepLink(uri: string): Promise<boolean> {
  if (!isMusicDeepLink(uri)) return false;
  try {
    const u = new URL(uri.replace(/^reader-music:/, 'lxmusic:'));
    const path = u.pathname.replace(/^\//, '');
    const { section } = navigateToMusicHub({ section: 'search' });
    setMusicSection(section);

    if (path === 'playlist' || path === 'songlist') {
      const url = u.searchParams.get('url') ?? u.searchParams.get('id') ?? '';
      const source = u.searchParams.get('source') as MusicSdkSource | null;
      if (url) {
        const ok = await openListFromUrlInput(url, source ?? undefined);
        if (ok) {
          setMusicSection('songlist');
          return true;
        }
      }
    }

    if (path === 'search') {
      const keyword = u.searchParams.get('keyword') ?? u.searchParams.get('key') ?? '';
      if (keyword) {
        const { setSearchKeyword, runSearch } = await import('@/stores/music-hub/search');
        setSearchKeyword(keyword);
        await runSearch();
        setMusicSection('search');
        return true;
      }
    }

    showAppToast({ title: '音乐链接已打开', description: path || uri });
    return true;
  } catch (err) {
    showAppToast({
      title: '音乐链接解析失败',
      description: err instanceof Error ? err.message : String(err),
      variant: 'destructive',
    });
    return true;
  }
}
