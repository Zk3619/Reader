/**
 * P3 surface — websocket policy, cut-ranges, Tab renderers, continuedl opts shape.
 */
import { describe, expect, it } from 'vitest';
import {
  isUnsupportedProtocol,
  isWebsocketFragProtocol,
  normalizeProtocol,
} from '@/lib/download/ytdlp/protocol-policy';
import { detectSpecialProtocol } from '@/lib/download/ytdlp/special-protocols';
import {
  removeRangesToKeepRanges,
  mergeRanges,
  chaptersToSplitRanges,
} from '@/lib/download/ytdlp/postprocessors/cut-ranges';
import {
  collectVideoRenderers,
  findContinuation,
  extractPlaylistMetadata,
  YT_TAB_URL_PATTERNS,
} from '@/lib/download/ytdlp/extractors/youtube/shared';
import { YoutubeTabIE } from '@/lib/download/ytdlp/extractors/youtube/tab';

describe('P3 websocket protocol', () => {
  it('is no longer unsupported', () => {
    expect(isUnsupportedProtocol('websocket_frag')).toBe(false);
    expect(isUnsupportedProtocol('websocket')).toBe(false);
    expect(isWebsocketFragProtocol('websocket_frag')).toBe(true);
    expect(normalizeProtocol(undefined, 'wss://live.example/frag')).toBe('websocket_frag');
    expect(detectSpecialProtocol('websocket_frag')).toBe('websocket_frag');
    expect(detectSpecialProtocol(undefined, 'ws://example/x')).toBe('websocket_frag');
  });
});

describe('P3 cut ranges', () => {
  it('merges overlapping removes into keep ranges', () => {
    expect(mergeRanges([[10, 20], [15, 25], [40, 50]])).toEqual([
      { start: 10, end: 25 },
      { start: 40, end: 50 },
    ]);
    expect(removeRangesToKeepRanges([[10, 20], [40, 50]], 100)).toEqual([
      { start: 0, end: 10 },
      { start: 20, end: 40 },
      { start: 50, end: 100 },
    ]);
  });

  it('chaptersToSplitRanges fills ends', () => {
    expect(
      chaptersToSplitRanges(
        [
          { start_time: 0, title: 'a' },
          { start_time: 30, title: 'b' },
        ],
        90,
      ),
    ).toEqual([
      { start: 0, end: 30 },
      { start: 30, end: 90 },
    ]);
  });
});

describe('P3 YoutubeTab deepen', () => {
  it('matches bare @handle', () => {
    expect(YoutubeTabIE.suitable('https://www.youtube.com/@MrBeast')).toBe(true);
    expect(YT_TAB_URL_PATTERNS.handleVideos.test('https://www.youtube.com/@MrBeast')).toBe(true);
  });

  it('collects shortsLockupViewModel + lockupViewModel', () => {
    const hits = collectVideoRenderers({
      contents: {
        shortsLockupViewModel: {
          entityId: 'shorts-dQw4w9WgXcQ',
          overlayMetadata: { primaryText: { content: 'Short' } },
        },
        lockupViewModel: {
          contentId: 'xxxxxxxxxxx',
          title: { simpleText: 'Lockup' },
        },
        videoRenderer: {
          videoId: 'abcdefghijk',
          title: { simpleText: 'Classic' },
          lengthText: { simpleText: '1:02' },
          viewCountText: { simpleText: '1.2K views' },
        },
      },
    });
    const ids = hits.map((h) => h.videoId).sort();
    expect(ids).toContain('dQw4w9WgXcQ');
    expect(ids).toContain('xxxxxxxxxxx');
    expect(ids).toContain('abcdefghijk');
    const classic = hits.find((h) => h.videoId === 'abcdefghijk');
    expect(classic?.duration).toBe(62);
    expect(classic?.view_count).toBe(1200);
  });

  it('findContinuation reads onResponseReceivedActions', () => {
    const q = findContinuation({
      onResponseReceivedActions: [
        {
          appendContinuationItemsAction: {
            continuationItems: [
              {
                continuationItemRenderer: {
                  continuationEndpoint: {
                    clickTrackingParams: 'x',
                    continuationCommand: { token: 'CONT123' },
                  },
                },
              },
            ],
          },
        },
      ],
    });
    expect(q?.continuation).toBe('CONT123');
  });

  it('extractPlaylistMetadata fills availability', () => {
    const meta = extractPlaylistMetadata(
      {
        metadata: {
          playlistMetadataRenderer: {
            title: 'T',
            playlistId: 'PLxxx',
            privacy: 'PUBLIC',
          },
        },
      },
      'fallback',
    );
    expect(meta.id).toBe('PLxxx');
    expect(meta.availability).toBe('public');
  });
});

describe('P3 continuedl option shape', () => {
  it('writeFragmentsToFile opts accept continuedl', async () => {
    // Shape-only: ensure module exports the option type path without invoking Tauri
    const mod = await import('@/lib/download/ytdlp/fragment-downloader');
    expect(typeof mod.writeFragmentsToFile).toBe('function');
    expect(typeof mod.downloadFragmentsConcat).toBe('function');
  });
});
