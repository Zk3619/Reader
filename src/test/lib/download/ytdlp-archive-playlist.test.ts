import { describe, expect, it } from 'vitest';
import { DownloadArchive, makeArchiveId } from '@/lib/download/ytdlp/archive';
import {
  parsePlaylistItems,
  resolvePlaylistIndices,
} from '@/lib/download/ytdlp/playlist-items';
import {
  isUnsupportedProtocol,
  unsupportedProtocolMessage,
} from '@/lib/download/ytdlp/protocol-policy';

describe('download archive', () => {
  it('builds yt-dlp archive ids', () => {
    expect(makeArchiveId('Tube8', '12345')).toBe('tube8 12345');
  });

  it('tracks ids in memory set', () => {
    const archive = new DownloadArchive(new Set(['tube8 1']));
    expect(archive.has({ id: '1', extractor_key: 'Tube8' })).toBe(true);
    expect(archive.has({ id: '2', extractor_key: 'Tube8' })).toBe(false);
  });
});

describe('playlist_items', () => {
  it('parses single index and ranges', () => {
    expect(parsePlaylistItems('3')).toEqual([3]);
    expect(parsePlaylistItems('1:3')).toEqual([{ start: 1, end: 3, step: 1 }]);
    expect(parsePlaylistItems('1-3:2')).toEqual([{ start: 1, end: 3, step: 2 }]);
  });

  it('resolves playlist indices', () => {
    expect(resolvePlaylistIndices(5, { playlist_items: '1,3:4' })).toEqual([0, 2, 3]);
    expect(resolvePlaylistIndices(5, { playliststart: 2, playlistend: 4 })).toEqual([1, 2, 3]);
  });
});

describe('protocol policy', () => {
  it('flags unsupported protocols with explicit messages', () => {
    expect(isUnsupportedProtocol('rtmp', 'rtmp://example/live')).toBe(true);
    expect(unsupportedProtocolMessage('websocket_frag')).toMatch(/websocket_frag/);
    expect(isUnsupportedProtocol('https', 'https://example.com/video.mp4')).toBe(false);
  });
});
