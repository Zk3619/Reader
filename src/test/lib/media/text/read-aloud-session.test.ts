import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  bindReadAloudSessionContext,
  getReadAloudSessionSnapshot,
  nextReadAloudChapter,
  nextReadAloudParagraph,
  prevReadAloudChapter,
  prevReadAloudParagraph,
  startReadAloudSession,
  stopReadAloudSession,
  unbindReadAloudSessionContext,
  type ReadAloudSessionContext,
} from '@/lib/media/text/read-aloud-session';
import * as readAloud from '@/lib/media/text/read-aloud';
import { defaultTextViewerUiConfig } from '@/lib/media/text/reader-ui-config';

describe('read-aloud-session', () => {
  beforeEach(() => {
    vi.spyOn(readAloud, 'speakSegment').mockResolvedValue(true);
    vi.spyOn(readAloud, 'stopReadAloud').mockImplementation(() => {});
  });

  afterEach(() => {
    unbindReadAloudSessionContext();
    vi.restoreAllMocks();
  });

  function makeContext(overrides: Partial<ReadAloudSessionContext> = {}): ReadAloudSessionContext {
    return {
      getChapterContent: () => '<p>第一段。</p><p>第二段。</p>',
      getChapterIndex: () => 0,
      getChapterCount: () => 3,
      getReadingAnchor: () => ({ chapterIndex: 0, chapterPos: 0 }),
      onRequestPrevChapter: async () => {},
      onRequestNextChapter: async () => {},
      onChapterFinished: async () => false,
      getConfig: () => ({ ...defaultTextViewerUiConfig, aloudEngine: 'system' }),
      resolveHttpTts: async () => null,
      ...overrides,
    };
  }

  it('starts session and plays first paragraph', async () => {
    const ctx = makeContext();
    bindReadAloudSessionContext(ctx);
    const ok = await startReadAloudSession(ctx);
    expect(ok).toBe(true);
    expect(readAloud.speakSegment).toHaveBeenCalled();
    const snap = getReadAloudSessionSnapshot();
    expect(snap.paragraphCount).toBe(2);
  });

  it('stops session', () => {
    const ctx = makeContext();
    bindReadAloudSessionContext(ctx);
    stopReadAloudSession();
    expect(readAloud.stopReadAloud).toHaveBeenCalled();
  });

  it('notifies when prev chapter at first chapter', async () => {
    const onNotify = vi.fn();
    const ctx = makeContext({ getChapterIndex: () => 0, onNotify });
    bindReadAloudSessionContext(ctx);
    await prevReadAloudChapter();
    expect(onNotify).toHaveBeenCalledWith('已位于第一章');
  });

  it('notifies when next chapter at last chapter', async () => {
    const onNotify = vi.fn();
    const ctx = makeContext({
      getChapterIndex: () => 2,
      getChapterCount: () => 3,
      onNotify,
    });
    bindReadAloudSessionContext(ctx);
    await nextReadAloudChapter();
    expect(onNotify).toHaveBeenCalledWith('已位于最后一章');
  });

  it('notifies when prev paragraph at first chapter first paragraph', async () => {
    const onNotify = vi.fn();
    const ctx = makeContext({ getChapterIndex: () => 0, onNotify });
    bindReadAloudSessionContext(ctx);
    await startReadAloudSession(ctx);
    await prevReadAloudParagraph();
    expect(onNotify).toHaveBeenCalledWith('已位于首章首段');
  });

  it('notifies when next paragraph at last chapter last paragraph', async () => {
    const onNotify = vi.fn();
    const ctx = makeContext({
      getChapterContent: () => '<p>唯一段。</p>',
      getChapterIndex: () => 2,
      getChapterCount: () => 3,
      onNotify,
    });
    bindReadAloudSessionContext(ctx);
    await startReadAloudSession(ctx);
    await nextReadAloudParagraph();
    expect(onNotify).toHaveBeenCalledWith('已位于最后一章最后一段');
  });
});
