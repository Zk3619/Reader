import { describe, expect, it } from 'vitest';
import { InfoExtractor } from '@/lib/download/ytdlp/common';
import { YoutubeDL } from '@/lib/download/ytdlp/youtube-dl';
import { downloadFragmentsConcat } from '@/lib/download/ytdlp/fragment-downloader';
import { EmbedThumbnailPP, FFmpegFixupM3u8PP } from '@/lib/download/ytdlp/postprocessors/fixup';

class DummyIE extends InfoExtractor {
  static IE_NAME = 'dummy';
  async _real_extract() {
    return { id: '1', title: 't' };
  }
}

describe('IE common media helpers', () => {
  it('_find_jwplayer_data parses setup JSON', () => {
    const ie = new DummyIE({ params: {} });
    const html = `
      <script>
      jwplayer('player').setup({"title":"Hi","sources":[{"file":"https://cdn.example/a.mp4"}]});
      </script>`;
    const data = ie._find_jwplayer_data(html) as Record<string, unknown>;
    expect(data?.title).toBe('Hi');
    expect(Array.isArray(data?.sources)).toBe(true);
  });

  it('_extract_chapters_from_description', () => {
    const ie = new DummyIE({ params: {} });
    const chapters = ie._extract_chapters_from_description(
      '0:00 Intro\n1:30 Main\n3:00 End',
      200,
    );
    expect(chapters?.length).toBeGreaterThanOrEqual(2);
    expect(chapters?.[0]?.start_time).toBe(0);
    expect(chapters?.[1]?.start_time).toBe(90);
  });

  it('_extract_wowza_formats builds rtmp when no smil', async () => {
    const ie = new DummyIE({ params: {} });
    // Skip network protocols — only expect rtmp stub
    const formats = await ie._extract_wowza_formats(
      'https://wowza.example.com/vod/mp4:clip/playlist.m3u8',
      'vid',
      'm3u8_native',
      ['m3u8', 'f4m', 'dash', 'smil'],
    );
    expect(formats.some((f) => f.protocol === 'rtmp')).toBe(true);
  });

  it('_extract_m3u8_formats attaches fragments for clear media playlists', async () => {
    const man = `#EXTM3U
#EXT-X-TARGETDURATION:4
#EXTINF:4.0,
seg0.ts
#EXTINF:4.0,
seg1.ts
#EXT-X-ENDLIST
`;
    const ie = new DummyIE({ params: {} });
    (ie as unknown as { _httpGetText: (url: string) => Promise<string> })._httpGetText = async () =>
      man;
    const formats = await ie._extract_m3u8_formats(
      'https://cdn.example/media.m3u8',
      'vid',
      'mp4',
      'm3u8_native',
    );
    expect(formats).toHaveLength(1);
    expect(formats[0]!.protocol).toBe('m3u8_native');
    expect(formats[0]!.fragments?.length).toBe(2);
    expect(formats[0]!.fragments?.[0]?.url).toBe('https://cdn.example/seg0.ts');
  });
});

describe('match_filter string ops', () => {
  it('title*= and title!=', () => {
    const ydl = new YoutubeDL({
      quiet: true,
      no_warnings: true,
      match_filter: 'title*=Hello&uploader!=bot',
    });
    const reject = (
      ydl as unknown as {
        _matchFilterReject: (i: { id: string; title: string; uploader: string }) => string | null;
      }
    )._matchFilterReject({ id: '1', title: 'Hello World', uploader: 'bot' });
    expect(reject).toMatch(/uploader/);
    const ok = (
      ydl as unknown as {
        _matchFilterReject: (i: { id: string; title: string; uploader: string }) => string | null;
      }
    )._matchFilterReject({ id: '1', title: 'Hello World', uploader: 'alice' });
    expect(ok).toBeNull();
  });
});

describe('fragment retries', () => {
  it('downloadFragmentsConcat retries then succeeds', async () => {
    let calls = 0;
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls < 2) throw new Error('network');
      return {
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      } as Response;
    }) as typeof fetch;
    try {
      const bytes = await downloadFragmentsConcat(
        [{ url: 'https://example.com/seg0' }],
        undefined,
        { concurrency: 1, retries: 2 },
      );
      expect(Array.from(bytes)).toEqual([1, 2, 3]);
      expect(calls).toBeGreaterThanOrEqual(2);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe('fixup PP names', () => {
  it('EmbedThumbnailPP / FixupM3u8 exist', () => {
    expect(new EmbedThumbnailPP().name).toBe('EmbedThumbnail');
    expect(new FFmpegFixupM3u8PP().name).toBe('FFmpegFixupM3u8');
  });
});
