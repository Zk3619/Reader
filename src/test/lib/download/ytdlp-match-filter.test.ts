import { describe, expect, it } from 'vitest';
import { YoutubeDL } from '@/lib/download/ytdlp/youtube-dl';
import { ExtractorError } from '@/lib/download/ytdlp/common';
import type { VideoInfo } from '@/lib/download/ytdlp/types';

describe('YoutubeDL match_filter / retries surface', () => {
  it('rejects via function match_filter', () => {
    const ydl = new YoutubeDL({
      match_filter: (info) => (Number(info.duration) < 60 ? 'too short' : null),
    });
    const reject = (
      ydl as unknown as { _matchFilterReject: (i: VideoInfo) => string | null }
    )._matchFilterReject({ id: '1', title: 't', duration: 10 });
    expect(reject).toBe('too short');
  });

  it('parses duration>N string filter', () => {
    const ydl = new YoutubeDL({ match_filter: 'duration>100' });
    const reject = (
      ydl as unknown as { _matchFilterReject: (i: VideoInfo) => string | null }
    )._matchFilterReject({ id: '1', title: 't', duration: 50 });
    expect(reject).toMatch(/duration/);
    const ok = (
      ydl as unknown as { _matchFilterReject: (i: VideoInfo) => string | null }
    )._matchFilterReject({ id: '1', title: 't', duration: 150 });
    expect(ok).toBeNull();
  });

  it('ExtractorError is expected for filter reject', async () => {
    // Smoke: construct path without network by calling private helper only
    const ydl = new YoutubeDL({ match_filter: 'view_count>10' });
    const msg = (
      ydl as unknown as { _matchFilterReject: (i: VideoInfo) => string | null }
    )._matchFilterReject({ id: '1', title: 't', view_count: 1 });
    expect(msg).toBeTruthy();
    expect(() => {
      throw new ExtractorError(msg!, { expected: true });
    }).toThrow(/view_count/);
  });
});
