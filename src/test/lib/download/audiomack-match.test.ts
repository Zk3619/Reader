import { describe, expect, it } from 'vitest';
import '@/lib/download/ytdlp/extractors';
import {
  AudiomackIE,
  extractAudiomackTrackFromWebpage,
  signAudiomackUrl,
  splitAudiomackTag,
  unwrapAudiomackEntity,
} from '@/lib/download/ytdlp/extractors/hand-a/audiomack';
import { ensureBuiltinLoaded, getExtractorForUrl } from '@/lib/download/ytdlp/registry';
import { detectProtocol } from '@/lib/download/gopeed/resolve';

describe('AudiomackIE', () => {
  it('matches legacy and modern song URLs', () => {
    expect(AudiomackIE.suitable('http://www.audiomack.com/song/roosh-williams/extraordinary')).toBe(
      true,
    );
    expect(AudiomackIE.suitable('https://audiomack.com/roosh-williams/song/extraordinary')).toBe(
      true,
    );
    ensureBuiltinLoaded();
    expect(
      getExtractorForUrl('http://www.audiomack.com/song/roosh-williams/extraordinary')?.IE_NAME,
    ).toBe('audiomack');
  });

  it('is detected as ytdlp protocol', () => {
    expect(detectProtocol('https://audiomack.com/roosh-williams/song/extraordinary')).toBe('ytdlp');
  });

  it('splits artist/slug tags', () => {
    expect(splitAudiomackTag('roosh-williams/extraordinary')).toEqual({
      artist: 'roosh-williams',
      slug: 'extraordinary',
    });
    expect(splitAudiomackTag('roosh-williams/song/extraordinary')).toEqual({
      artist: 'roosh-williams',
      slug: 'extraordinary',
    });
  });

  it('unwraps results-wrapped song payloads', () => {
    const track = unwrapAudiomackEntity({
      results: {
        id: '310086',
        title: 'Extraordinary',
        artist: 'Roosh Williams',
        type: 'song',
        url_slug: 'extraordinary',
      },
    });
    expect(track?.id).toBe('310086');
    expect(track?.title).toBe('Extraordinary');
  });

  it('extracts play id from webpage markup', () => {
    const html = `<html><script>fetch("/v1/music/play/310086?section=Song%20Page")</script></html>`;
    expect(extractAudiomackTrackFromWebpage(html)?.id).toBe('310086');
  });

  it('signs play URL like the web client sample', async () => {
    const signed = await signAudiomackUrl(
      'GET',
      'https://api.audiomack.com/v1/music/play/60415617',
      {
        oauth_nonce: 'Q3d93uCTxlN1xRMY42z35Ka6AInVX3HQ',
        oauth_timestamp: '1748867313',
        section: 'Song Page',
      },
    );
    const u = new URL(signed);
    expect(u.searchParams.get('oauth_signature')).toBe('c8pxVgqV+algxHgk2IBVNF+KnMQ=');
    expect(u.searchParams.get('oauth_consumer_key')).toBe('audiomack-js');
    expect(u.searchParams.get('section')).toBe('Song Page');
  });
});
