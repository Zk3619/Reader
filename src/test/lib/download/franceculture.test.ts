import { describe, expect, it } from 'vitest';
import '@/lib/download/ytdlp/extractors';
import { FranceCultureIE } from '@/lib/download/ytdlp/extractors/hand-r/radiofrance';
import { ensureBuiltinLoaded, getExtractorForUrl } from '@/lib/download/ytdlp/registry';
import { InfoExtractor } from '@/lib/download/ytdlp/common';

/** 嵌套字段：非贪婪 `+?}` 会在 interactionStatistic 处截断并导致 JSON.parse 失败 */
const FIXTURE_HTML = `
<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
{"@type":"WebPage","name":"page"},
{"@type":"AudioObject","name":"La physique d’Einstein","contentUrl":"https://media.radiofrance-podcast.net/podcast09/8440487-20220514.mp3","duration":"PT45M50S","encodingFormat":"mp3","interactionStatistic":{"@type":"InteractionCounter","userInteractionCount":1234},"datePublished":"2022-05-14"}
]}
</script>
<meta name="description" content="Existerait-il un pont conceptuel ?"/>
<meta property="og:title" content="La physique d’Einstein aiderait-elle à comprendre le cerveau ?"/>
<meta property="og:image" content="https://example.com/thumb.jpg"/>
</head>
<body>
<h1 itemprop="name">La physique d’Einstein aiderait-elle à comprendre le cerveau ?</h1>
<span class="author">Etienne Klein</span>
</body></html>
`;

describe('FranceCultureIE', () => {
  const url =
    'https://www.radiofrance.fr/franceculture/podcasts/science-en-questions/la-physique-d-einstein-aiderait-elle-a-comprendre-le-cerveau-8440487';

  it('matches yt-dlp test URL', () => {
    expect(FranceCultureIE.suitable(url)).toBe(true);
    ensureBuiltinLoaded();
    expect(getExtractorForUrl(url)?.IE_NAME).toBe('FranceCulture');
  });

  it('parses nested AudioObject via contains_pattern (not non-greedy truncation)', async () => {
    class Harness extends FranceCultureIE {
      override async _download_webpage(): Promise<string> {
        return FIXTURE_HTML;
      }
    }
    const ie = new Harness({} as ConstructorParameters<typeof InfoExtractor>[0]);
    const info = await ie._real_extract(url);
    expect(info.id).toBe('8440487');
    expect(info.display_id).toBe('la-physique-d-einstein-aiderait-elle-a-comprendre-le-cerveau');
    expect(info.url).toContain('8440487-20220514.mp3');
    expect(info.vcodec).toBe('none');
    expect(info.duration).toBe(2750);
    expect(info.title).toMatch(/Einstein/);
    expect(info.upload_date).toBe('20220514');
  });

  it('_search_json ignore_extra strips trailing junk after AudioObject', () => {
    const ie = new FranceCultureIE({} as ConstructorParameters<typeof InfoExtractor>[0]);
    const junk =
      '{"@type":"AudioObject","contentUrl":"https://cdn.example/a.mp3","encodingFormat":"mp3"},{"@type":"WebPage"} trailing';
    const data = ie._search_json<Record<string, unknown>>('', junk, 'audio', 'id', {
      contains_pattern: String.raw`\{\s*"@type"\s*:\s*"AudioObject".+\}`,
      ignore_extra: true,
    });
    expect(data?.contentUrl).toBe('https://cdn.example/a.mp3');
  });
});
