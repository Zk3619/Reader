import { describe, expect, it } from 'vitest';
import '@/lib/download/ytdlp/extractors';
import { BBCCoUkIE } from '@/lib/download/ytdlp/extractors/hand-b/bbc';
import { ensureBuiltinLoaded, getExtractorForUrl } from '@/lib/download/ytdlp/registry';

const PROG_URL = 'http://www.bbc.co.uk/programmes/b039g8p7';

/** 对齐线上：playlist.json 空 versions + 页面协议相对 Direct Download MP3 */
const FIXTURE_HTML = `
<html><head>
<meta property="og:title" content="Kaleidoscope, Leonard Cohen"/>
<meta name="description" content="The Canadian songwriter reflects on his musical career."/>
</head><body>
<h1>Leonard Cohen</h1>
<p>29 minutes</p>
<ul>
<li><a href="//open.live.bbc.co.uk/mediaselector/6/redir/version/2.0/mediaset/audio-nondrm-download/proto/https/vpid/p02r80pb.mp3" download="Kaleidoscope, Leonard Cohen - b039g8p7.mp3" aria-label="Download Higher quality (128kbps)">Higher quality (128kbps)</a></li>
<li><a href="//open.live.bbc.co.uk/mediaselector/6/redir/version/2.0/mediaset/audio-nondrm-download-low/proto/https/vpid/p02r80pb.mp3">Lower quality (64kbps)</a></li>
</ul>
</body></html>
`;

describe('BBCCoUkIE programme downloads', () => {
  it('matches programmes URL', () => {
    expect(BBCCoUkIE.suitable(PROG_URL)).toBe(true);
    ensureBuiltinLoaded();
    expect(getExtractorForUrl(PROG_URL)?.IE_NAME).toBe('bbc.co.uk');
  });

  it('extracts 128/64kbps MP3 when playlist has no stream versions', async () => {
    class Harness extends BBCCoUkIE {
      override async _download_webpage(url: string): Promise<string> {
        if (url.includes('iplayer/playlist')) {
          throw new Error('HTTP 404: should not fall back to legacy playlist');
        }
        return FIXTURE_HTML;
      }
      override async _download_json<T = unknown>(url: string): Promise<T> {
        if (url.includes('playlist.json')) {
          return {
            allAvailableVersions: [],
            defaultAvailableVersion: null,
          } as T;
        }
        throw new Error(`unexpected json: ${url}`);
      }
      override async _downloadMediaSelector(): Promise<{
        formats: never[];
        subtitles: Record<string, never[]>;
      }> {
        return { formats: [], subtitles: {} };
      }
    }

    const ie = new Harness();
    const info = await ie._real_extract(PROG_URL);
    expect(info.id).toBe('p02r80pb');
    expect(info.formats?.length).toBe(2);
    expect(info.formats?.map((f) => f.abr).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([
      64, 128,
    ]);
    expect(info.formats?.every((f) => f.ext === 'mp3' && f.vcodec === 'none')).toBe(true);
    expect(info.formats?.[0]?.url?.startsWith('https://open.live.bbc.co.uk/')).toBe(true);
    expect(info.duration).toBe(29 * 60);
    expect(info.title).toMatch(/Leonard Cohen|Kaleidoscope/);
  });

  it('does not call iplayer/playlist when playlist.json is 200 with empty versions', async () => {
    let legacyHits = 0;
    class Harness extends BBCCoUkIE {
      override async _download_webpage(url: string): Promise<string> {
        if (url.includes('iplayer/playlist')) {
          legacyHits++;
          throw new Error('HTTP 404');
        }
        return FIXTURE_HTML;
      }
      override async _download_json<T = unknown>(): Promise<T> {
        return { allAvailableVersions: [] } as T;
      }
    }
    const ie = new Harness();
    await ie._real_extract(PROG_URL);
    expect(legacyHits).toBe(0);
  });
});
