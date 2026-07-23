/**
 * 桌面增强播放入口：强制走 libmpv 独立窗，失败则外置
 * 一般入口请用 {@link openRoutedPlayback}（尊重设置里的强制引擎）
 */

import { openInExternalPlayer, getPreferredExternalPlayer } from '@/lib/media/tv/play/external-player';
import { createLibMpvEngine } from '@/lib/media/video/playback/libmpv-engine';
import { resolvePlaybackMediaUrl } from '@/lib/media/video/playback/media-url';
import { getVideoPlaybackPrefs } from '@/lib/media/video/playback/prefs';

export async function openEnhancedOrExternal(
  url: string,
  title?: string,
  startSec?: number,
): Promise<'libmpv' | 'external'> {
  const prefs = getVideoPlaybackPrefs();
  const mediaUrl = resolvePlaybackMediaUrl(url) || url;
  let libmpvError: unknown;
  try {
    const eng = createLibMpvEngine();
    await eng.load({
      url: mediaUrl,
      title,
      startSec,
      subtitle: prefs.preferredSubtitlePath || undefined,
      anime4k: { mode: prefs.anime4kMode, quality: prefs.anime4kQuality },
    });
    return 'libmpv';
  } catch (e) {
    libmpvError = e;
    if (prefs.forceEngine === 'libmpv') {
      throw e instanceof Error ? e : new Error(String(e));
    }
  }
  try {
    await openInExternalPlayer(mediaUrl, {
      kind: getPreferredExternalPlayer(),
      title,
      startSec,
      anime4k: { mode: prefs.anime4kMode, quality: prefs.anime4kQuality },
      subtitle: prefs.preferredSubtitlePath || undefined,
    });
    return 'external';
  } catch (externalErr) {
    const libMsg =
      libmpvError instanceof Error
        ? libmpvError.message
        : libmpvError != null
          ? String(libmpvError)
          : '';
    const extMsg =
      externalErr instanceof Error ? externalErr.message : String(externalErr);
    throw new Error(
      libMsg ? `libmpv: ${libMsg}; 外置: ${extMsg}` : extMsg,
    );
  }
}
