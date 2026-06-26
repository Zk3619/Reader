import { describe, expect, it } from 'vitest';
import {
  buildHttpTtsRequest,
  isJsHttpTtsUrl,
} from '@/lib/media/text/http-tts-analyze';
import {
  httpTtsWebPlaybackSupport,
  parseHttpTtsJson,
} from '@/lib/media/text/http-tts-import';
import type { HttpTTS } from '@/types';

describe('http-tts-analyze', () => {
  it('detects js urls', () => {
    expect(isJsHttpTtsUrl('@js:foo()')).toBe(true);
    expect(isJsHttpTtsUrl('http://example.com')).toBe(false);
  });

  it('parses legado POST url format', () => {
    const tts: HttpTTS = {
      id: 1,
      name: 'test',
      url: 'http://example.com/tts,{"method":"POST","body":"tex={{speakText}}&spd={{speakSpeed}}"}',
      lastUpdateTime: 0,
    };
    const spec = buildHttpTtsRequest(tts, '你好', 5);
    expect(spec.method).toBe('POST');
    expect(spec.body).toContain('你好');
    expect(spec.body).toContain('5');
  });
});

describe('http-tts-import', () => {
  it('parses json array', () => {
    const items = parseHttpTtsJson('[{"name":"A","url":"http://a"}]');
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('A');
  });

  it('classifies playback support', () => {
    expect(httpTtsWebPlaybackSupport('http://a')).toBe('full');
    expect(httpTtsWebPlaybackSupport('@js:x')).toBe('unsupported');
  });
});
