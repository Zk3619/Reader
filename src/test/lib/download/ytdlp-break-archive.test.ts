import { describe, expect, it } from 'vitest';
import { DownloadArchive } from '@/lib/download/ytdlp/archive';
import { ExistingVideoReached } from '@/lib/download/ytdlp/common';
import { YoutubeDL } from '@/lib/download/ytdlp/youtube-dl';

describe('break_on_existing + archive', () => {
  it('throws ExistingVideoReached when break_on_existing and archived', async () => {
    const { DownloadArchive } = await import('@/lib/download/ytdlp/archive');
    const archive = new DownloadArchive(new Set(['test 1']));
    const ydl = new YoutubeDL({
      break_on_existing: true,
      quiet: true,
      no_warnings: true,
    });
    (ydl as unknown as { _archive: typeof archive })._archive = archive;

    await expect(
      ydl.process_video_result({ id: '1', extractor_key: 'test', title: 't' }, false),
    ).rejects.toBeInstanceOf(ExistingVideoReached);
  });

  it('skips archived playlist entry when break_on_existing is false', async () => {
    const archive = new DownloadArchive(new Set(['test 2']));
    const ydl = new YoutubeDL({ quiet: true, no_warnings: true });
    (ydl as unknown as { _archive: DownloadArchive })._archive = archive;

    await expect(
      ydl.process_video_result({ id: '2', extractor_key: 'test', title: 't' }, false),
    ).rejects.toThrow(/Already downloaded/);
  });
});
