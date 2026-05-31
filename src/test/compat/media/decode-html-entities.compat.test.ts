import { describe, expect, it } from 'vitest';
import {
  decodeHtmlEntities,
  decodeHtmlEntitiesFallback,
} from '@/lib/media/text/decode-html-entities';

describe('decodeHtmlEntitiesFallback', () => {
  it('decodes numeric entity &#34; to double quote', () => {
    expect(decodeHtmlEntitiesFallback('??&#34;??&#34;')).toBe('??"??"');
  });

  it('decodes hex and named entities', () => {
    expect(decodeHtmlEntitiesFallback('&quot; &amp; &lt; &gt; &#x22;')).toBe('" & < > "');
  });

  it('preserves unknown named entities', () => {
    expect(decodeHtmlEntitiesFallback('&unknown;')).toBe('&unknown;');
  });
});

describe('decodeHtmlEntities', () => {
  it('returns plain text unchanged when no ampersand', () => {
    expect(decodeHtmlEntities('plain text')).toBe('plain text');
  });

  it('decodes entities such as &#34;', () => {
    expect(decodeHtmlEntities('??&#34;??&#34;')).toBe('??"??"');
  });
});
