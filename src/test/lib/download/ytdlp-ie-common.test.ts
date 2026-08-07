/**
 * IE common (XML / MPD / SMIL / m3u8-parse / helpers) — P5-2.
 */
import { describe, expect, it } from 'vitest';
import { InfoExtractor } from '@/lib/download/ytdlp/common';
import {
  availabilityFromFlags,
  extractEmbedUrls,
  genericTitleFrom,
  isValidUrlShape,
  mergeSubtitleItems,
  parseM3u8FormatsAndSubtitles,
  parseM3u8VodDuration,
  parseMpdFormatsAndSubtitles,
  parseSmilFormatsAndSubtitles,
  parseXmlString,
  parseXspf,
} from '@/lib/download/ytdlp/ie-common';

class TestIE extends InfoExtractor {
  static IE_NAME = 'TestIE';
  static _VALID_URL = /https?:\/\/example\.com\/(?<id>\w+)/;
  async _real_extract(url: string) {
    return this.url_result(url);
  }
}

const SAMPLE_MPD = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT30S">
  <Period id="p0">
    <AdaptationSet contentType="video" mimeType="video/mp4">
      <SegmentTemplate timescale="1000" media="seg-$Number%05d$.m4s" initialization="init.mp4" startNumber="1">
        <SegmentTimeline>
          <S t="0" d="2000" r="2"/>
        </SegmentTimeline>
      </SegmentTemplate>
      <Representation id="v1" bandwidth="800000" width="1280" height="720" codecs="avc1.64001f"/>
    </AdaptationSet>
    <AdaptationSet contentType="audio" mimeType="audio/mp4" lang="en">
      <BaseURL>https://cdn.example.com/audio/</BaseURL>
      <Representation id="a1" bandwidth="128000" codecs="mp4a.40.2">
        <BaseURL>track.mp4</BaseURL>
      </Representation>
    </AdaptationSet>
    <AdaptationSet contentType="text" mimeType="application/ttml+xml" lang="en">
      <Representation id="t1">
        <BaseURL>https://cdn.example.com/subs.ttml</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

const SAMPLE_SMIL = `<?xml version="1.0"?>
<smil>
  <head>
    <meta name="title" content="Demo"/>
    <meta base="https://cdn.example.com/"/>
  </head>
  <body>
    <video src="clip.mp4" system-bitrate="500000" width="640" height="360"/>
    <textstream src="https://cdn.example.com/en.vtt" systemLanguage="en" type="text/vtt"/>
  </body>
</smil>`;

const SAMPLE_XSPF = `<?xml version="1.0"?>
<playlist xmlns="http://xspf.org/ns/0/">
  <trackList>
    <track>
      <title>Song A</title>
      <location>https://cdn.example.com/a.mp3</location>
      <duration>120000</duration>
    </track>
  </trackList>
</playlist>`;

const SAMPLE_M3U8 = `#EXTM3U
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",LANGUAGE="en",URI="en.vtt"
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=1280x720,CODECS="avc1.42e01e,mp4a.40.2"
hi.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=400000,RESOLUTION=640x360
lo.m3u8
`;

describe('ie-common xml/mpd', () => {
  it('parses MPD periods with SegmentTemplate $Number$', () => {
    const { formats, subtitles } = parseMpdFormatsAndSubtitles(
      SAMPLE_MPD,
      'dash',
      'https://cdn.example.com/v/',
      'https://cdn.example.com/v/manifest.mpd',
    );
    expect(formats.length).toBeGreaterThanOrEqual(2);
    const video = formats.find((f) => f.height === 720);
    expect(video?.fragments?.length).toBeGreaterThan(1);
    expect(video?.fragments?.[0]?.url).toMatch(/init\.mp4/);
    expect(subtitles.en?.length).toBeGreaterThan(0);
  });

  it('InfoExtractor._parse_mpd_formats_and_subtitles wires through', () => {
    const ie = new TestIE();
    const { formats } = ie._parse_mpd_formats_and_subtitles(
      SAMPLE_MPD,
      'dash',
      'https://cdn.example.com/v/',
      'https://cdn.example.com/manifest.mpd',
    );
    expect(formats.some((f) => f.format_id?.includes('v1'))).toBe(true);
  });
});

describe('ie-common smil/xspf/m3u8', () => {
  it('parses SMIL video + textstream', async () => {
    const { formats, subtitles } = await parseSmilFormatsAndSubtitles(
      SAMPLE_SMIL,
      'https://cdn.example.com/demo.smil',
    );
    expect(formats.some((f) => /clip\.mp4/.test(f.url || ''))).toBe(true);
    expect(subtitles.en?.[0]?.url).toMatch(/en\.vtt/);
  });

  it('parses XSPF track list', () => {
    const entries = parseXspf(SAMPLE_XSPF, 'pl1', {
      xspfUrl: 'https://cdn.example.com/list.xspf',
      xspfBaseUrl: 'https://cdn.example.com/',
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.title).toBe('Song A');
    expect(entries[0]!.duration).toBe(120);
    expect(entries[0]!.formats?.[0]?.url).toMatch(/a\.mp3/);
  });

  it('parse-only m3u8 master + vod duration', () => {
    const { formats, subtitles } = parseM3u8FormatsAndSubtitles(
      SAMPLE_M3U8,
      'https://cdn.example.com/master.m3u8',
      'mp4',
      'm3u8_native',
      undefined,
      undefined,
      'hls',
    );
    expect(formats.length).toBe(2);
    expect(subtitles.en?.[0]?.ext).toBe('vtt');
    expect(
      parseM3u8VodDuration('#EXTM3U\n#EXTINF:1.5,\na.ts\n#EXTINF:2.5,\nb.ts\n#EXT-X-ENDLIST\n'),
    ).toBe(4);
  });
});

describe('ie-common helpers + IE hooks', () => {
  it('helpers: availability, title, embed urls, merge subs', () => {
    expect(availabilityFromFlags({ needs_auth: true })).toBe('needs_auth');
    expect(genericTitleFrom('https://x/a/b.mp4', '<title>Hi</title>')).toBe('Hi');
    expect(isValidUrlShape('https://example.com/a')).toBe(true);
    expect(isValidUrlShape('not-a-url')).toBe(false);
    const embeds = extractEmbedUrls('https://site.example/', '<iframe src="/e/1"></iframe>');
    expect(embeds[0]).toBe('https://site.example/e/1');
    expect(mergeSubtitleItems([{ url: 'a' }], [{ url: 'a' }, { url: 'b' }])).toHaveLength(2);
  });

  it('InfoExtractor XML parse + comments/captions hooks', async () => {
    const ie = new TestIE({ params: { getcomments: true, writesubtitles: true } });
    const doc = ie._parse_xml('<root><a>1</a></root>');
    expect(doc.documentElement?.tagName.toLowerCase()).toBe('root');
    expect(ie._og_search_url('<meta property="og:url" content="https://og.example/"/>')).toBe(
      'https://og.example/',
    );
    expect(ie._availability({ is_unlisted: true })).toBe('unlisted');
    expect(ie._int('42', 'n')).toBe(42);
    expect(ie.extract_subtitles()).toEqual({});
    const extractor = ie.extract_comments();
    expect(extractor).not.toBeNull();
    const out = await extractor!();
    expect(out.comments).toEqual([]);
    expect(out.comment_count).toBe(0);
    expect(InfoExtractor._extract_embed_urls('https://a/', '<embed src="https://b/x"/>')).toContain(
      'https://b/x',
    );
  });

  it('parseXmlString parses valid xml', () => {
    const doc = parseXmlString('<root><a/></root>');
    expect(doc.documentElement?.tagName.toLowerCase()).toBe('root');
  });
});
