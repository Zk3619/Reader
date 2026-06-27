/**
 * 章节加载失败时尝试自动换源（对齐 Legado autoChangeSource）
 */

import { textViewerStore } from '@/stores/viewer';
import { isLocalBook } from '@/lib/local-book';
import { applyChangeSource, ChangeSourceSearchSession } from '@/lib/media/text/change-source';
import { loadChangeSourcePrefs } from '@/lib/media/text/change-source-prefs';
import { showAppToast } from '@/components/shared/AppToasts';

export async function tryAutoChangeSourceOnLoadError(
  _chapterIndex: number,
  error: unknown,
): Promise<boolean> {
  const config = textViewerStore.state.config;
  if (config.autoChangeSource === false) return false;

  const book = textViewerStore.state.book;
  if (!book || isLocalBook(book)) return false;

  const session = new ChangeSourceSearchSession();
  try {
    const prefs = await loadChangeSourcePrefs();
    await session.loadCached(book, prefs);
    let results = session.getResults();
    if (results.length === 0) {
      await new Promise<void>((resolve, reject) => {
        session.setCallbacks({
          onFinish: () => resolve(),
          onError: (msg) => reject(new Error(msg)),
        });
        void session.startSearch(book, prefs).catch(reject);
      });
      results = session.getResults();
    }
    const candidate = results.find((r) => r.origin !== book.origin);
    if (!candidate) {
      console.warn('[auto-change-source] 未找到可换书源', error);
      return false;
    }
    const updated = await applyChangeSource(book, candidate);
    await textViewerStore.openBook(updated);
    showAppToast({
      title: '已自动换源',
      description: candidate.originName,
    });
    return true;
  } catch (e) {
    console.warn('[auto-change-source] 失败', e);
    return false;
  } finally {
    session.close();
  }
}
