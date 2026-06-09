import { getChapterCacheSettings } from '@/lib/chapter-cache/settings';

export const MANGA_IMAGE_RETAIN_DEFAULT = 2;

/** 图片磁盘缓存保留章数（当前章 ±N，对齐 Legado imageRetainNum） */
export async function getMangaImageRetainChapters(): Promise<number> {
  const settings = await getChapterCacheSettings();
  return settings.imageRetainNum;
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
