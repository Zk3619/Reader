import { describe, expect, it } from 'vitest';
import '@/lib/download/ytdlp/extractors';
import {
  asRecordList,
  CSpanIE,
  expandCspanHlsCandidates,
} from '@/lib/download/ytdlp/extractors/hand-c/cspan';
import { ensureBuiltinLoaded, getExtractorForUrl } from '@/lib/download/ytdlp/registry';

describe('CSpan URL matching', () => {
  it('matches legacy video/? and /program/ URLs', () => {
    expect(CSpanIE.suitable('http://www.c-span.org/video/?313572-1/HolderonV')).toBe(true);
    expect(
      CSpanIE.suitable(
        'https://www.c-span.org/program/news-conference/attorney-general-eric-holder-on-voting-rights-act-decision/315139',
      ),
    ).toBe(true);
    ensureBuiltinLoaded();
    const ie = getExtractorForUrl('http://www.c-span.org/video/?313572-1/HolderonV');
    expect(ie?.IE_NAME).toBe('CSpan');
  });

  it('normalizes ajax-player files/qualities objects to lists', () => {
    expect(asRecordList({})).toEqual([]);
    const files = asRecordList({
      path: { '#text': 'https://example/a.mp4' },
      qualities: { file: { '#text': 'https://example/b.mp4' }, height: { '#text': '720' } },
    });
    expect(files).toHaveLength(1);
    expect(asRecordList(files[0]!.qualities)).toHaveLength(1);
    expect(asRecordList([{ path: 'x' }, { path: 'y' }])).toHaveLength(2);
  });

  it('expands iphone seed to m3u8-0/1 candidates first', () => {
    const cands = expandCspanHlsCandidates(
      'https://iphone.c-spanvideo.org/m3u8/program.315139.m3u8',
      'program',
      '315139',
    );
    expect(cands[0]).toContain('m3u8-1.c-spanvideo.org');
    expect(cands.some((u) => u.includes('iphone.c-spanvideo.org'))).toBe(true);
  });
});
