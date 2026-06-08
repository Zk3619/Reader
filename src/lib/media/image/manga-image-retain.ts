import { getChapterCacheSettings } from '@/lib/chapter-cache/settings';

export const MANGA_IMAGE_RETAIN_DEFAULT = 2;

/** 漫画磁盘图片保留章数（当前章 ±N，对齐 Legado imageRetainNum） */
export async function getMangaImageRetainChapters(): Promise<number> {
  const settings = await getChapterCacheSettings();
  return settings.mangaImageRetainNum;
}

export async function mangaImageRetainChapterWindow(
  currentChapterIndex: number,
): Promise<{ min: number; max: number }> {
  const retain = await getMangaImageRetainChapters();
  return {
    min: Math.max(0, currentChapterIndex - retain),
    max: currentChapterIndex + retain,
  };
}
