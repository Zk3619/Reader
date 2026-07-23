/**
 * 匹配弹幕后写缓存，供 Android Activity FlameMaster / ASS 使用
 */

import { writeTextFile, mkdir } from '@tauri-apps/plugin-fs';
import { tempDir, join } from '@tauri-apps/api/path';
import type { Danmu } from 'artplayer-plugin-danmuku';
import { danmuToAss } from '@/lib/media/video/danmaku/to-ass';
import { danmuToBilibiliXml } from '@/lib/media/video/danmaku/to-bilibili-xml';
import { getTvPlayPrefs } from '@/lib/media/tv/play/tv-play-prefs';

export type PreparedDanmakuFiles = {
  xmlPath: string;
  assPath: string;
  count: number;
};

export async function prepareDanmakuFilesForAndroid(
  danmu: Danmu[],
): Promise<PreparedDanmakuFiles | null> {
  if (!danmu.length) return null;
  const prefs = getTvPlayPrefs();
  const dir = await tempDir();
  const base = await join(dir, 'reader-danmaku');
  try {
    await mkdir(base, { recursive: true });
  } catch {
    /* */
  }
  const stamp = Date.now();
  const xmlPath = await join(base, `${stamp}.xml`);
  const assPath = await join(base, `${stamp}.ass`);
  await writeTextFile(xmlPath, danmuToBilibiliXml(danmu, prefs.libmpvDanmakuMax));
  await writeTextFile(
    assPath,
    danmuToAss(danmu, {
      fontSize: prefs.libmpvDanmakuFontSize,
      opacity: prefs.libmpvDanmakuOpacity,
      durationSec: prefs.libmpvDanmakuDuration,
      mergeSec: prefs.libmpvDanmakuMergeSec,
      maxCount: prefs.libmpvDanmakuMax,
    }),
  );
  return { xmlPath, assPath, count: danmu.length };
}
