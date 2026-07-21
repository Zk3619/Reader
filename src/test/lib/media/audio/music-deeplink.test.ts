import { describe, expect, it } from 'vitest';
import {
  isMusicDeepLink,
  isMusicFileUri,
  isMusicOpenUri,
  parseMusicDeepLink,
} from '@/lib/media/audio/music-deeplink';

describe('music-deeplink parse', () => {
  it('detects lxmusic and reader-music schemes', () => {
    expect(isMusicDeepLink('lxmusic://player/play')).toBe(true);
    expect(isMusicDeepLink('reader-music://search?keyword=a')).toBe(true);
    expect(isMusicDeepLink('https://example.com')).toBe(false);
  });

  it('detects local file and content uris', () => {
    expect(isMusicFileUri('file:///C:/Music/a.mp3')).toBe(true);
    expect(isMusicFileUri('content://media/external/audio/media/1')).toBe(true);
    expect(isMusicOpenUri('file:///tmp/x.flac')).toBe(true);
    expect(isMusicOpenUri('lxmusic://player/play')).toBe(true);
    expect(isMusicOpenUri('https://x.com')).toBe(false);
  });

  it('parses player actions', () => {
    expect(parseMusicDeepLink('lxmusic://player/skipNext')).toEqual({
      type: 'player',
      action: 'skipNext',
      paths: [],
      params: {},
    });
    expect(parseMusicDeepLink('reader-music://player/togglePlay')).toEqual({
      type: 'player',
      action: 'togglePlay',
      paths: [],
      params: {},
    });
  });

  it('parses music searchPlay paths and data json', () => {
    const withPath = parseMusicDeepLink(
      'lxmusic://music/searchPlay/%E5%AA%9A%E4%BA%BA-%E8%96%9B%E4%B9%8B%E8%B0%A6',
    );
    expect(withPath.type).toBe('music');
    expect(withPath.action).toBe('searchPlay');
    expect(withPath.paths[0]).toBe('媚人-薛之谦');

    const payload = encodeURIComponent(
      JSON.stringify({ name: '媚人', singer: '薛之谦', playLater: true }),
    );
    const withData = parseMusicDeepLink(
      `lxmusic://music/searchPlay?data=${payload}`,
    );
    expect(withData.params.data).toEqual({
      name: '媚人',
      singer: '薛之谦',
      playLater: true,
    });
  });

  it('parses songlist play with source/url/index paths', () => {
    const parsed = parseMusicDeepLink(
      'lxmusic://songlist/play/kw/https%3A%2F%2Fexample.com%2Fpl/3',
    );
    expect(parsed).toEqual({
      type: 'songlist',
      action: 'play',
      paths: ['kw', 'https://example.com/pl', '3'],
      params: {},
    });
  });

  it('parses legacy search and songlist open', () => {
    expect(parseMusicDeepLink('lxmusic://search?keyword=hello')).toEqual({
      type: 'search',
      action: '',
      paths: [],
      params: { keyword: 'hello' },
    });
    expect(
      parseMusicDeepLink('lxmusic://songlist?url=https%3A%2F%2Fx.com&source=wy'),
    ).toEqual({
      type: 'songlist',
      action: '',
      paths: [],
      params: { url: 'https://x.com', source: 'wy' },
    });
  });
});
