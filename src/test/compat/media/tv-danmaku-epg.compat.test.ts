import { describe, expect, it } from 'vitest';
import {
  fillDanmakuTemplate,
  hasUnresolvedDanmakuPlaceholders,
  isLocalJarDanmakuProxy,
  resolveDanmakuPlayUrl,
} from '@/lib/media/tv/play/danmaku-url';
import {
  formatEpgDate,
  isEpgApiTemplate,
  isEpgXmlSource,
  pickEpgApiTemplate,
  pickEpgXmlSources,
  resolveChannelEpgUrl,
  splitLiveEpgUrls,
} from '@/lib/media/tv/live/epg';

describe('fillDanmakuTemplate', () => {
  it('replaces {name} and {episode}', () => {
    const out = fillDanmakuTemplate(
      'http://127.0.0.1:9978/proxy?do=danmaku&name={name}&episode={episode}',
      '测试剧',
      '第01集',
      'https://cdn.example/a.m3u8',
    );
    expect(out).toContain('name=');
    expect(out).toContain(encodeURIComponent('测试剧'));
    expect(out).toContain(encodeURIComponent('第01集'));
    expect(hasUnresolvedDanmakuPlaceholders(out)).toBe(false);
  });
});

describe('resolveDanmakuPlayUrl', () => {
  const base = 'http://127.0.0.1:9978/proxy';

  it('wraps external danmaku API through proxy', () => {
    const out = resolveDanmakuPlayUrl(
      'https://api.example/dm?name={name}&episode={episode}',
      base,
      { vodName: '剧', episodeName: '1', playUrl: 'https://x/y.m3u8' },
    );
    expect(out).toContain('do=http');
    expect(out).toContain(encodeURIComponent('https://api.example/dm'));
  });

  it('skips local jar proxy?do=danmaku (unsupported → empty, fall back to match)', () => {
    const out = resolveDanmakuPlayUrl(
      'http://127.0.0.1:9978/proxy?do=danmaku&name={name}&episode={episode}',
      base,
      { vodName: '剧', episodeName: '1', playUrl: '' },
    );
    expect(out).toBe('');
  });
});

describe('isLocalJarDanmakuProxy', () => {
  it('detects local do=danmaku', () => {
    expect(
      isLocalJarDanmakuProxy(
        'http://127.0.0.1:9978/proxy?do=danmaku&name=a&episode=1',
      ),
    ).toBe(true);
    expect(
      isLocalJarDanmakuProxy(
        'http://127.0.0.1:9978/proxy?do=http&url=https%3A%2F%2Fx',
      ),
    ).toBe(false);
  });
});

describe('live epg urls', () => {
  const mixed =
    'https://epg.example.com/guide.xml.gz,http://diyp5.112114.xyz/?ch={name}&date={date}';

  it('splits and classifies epg sources', () => {
    expect(splitLiveEpgUrls(mixed)).toHaveLength(2);
    expect(pickEpgXmlSources(mixed)).toEqual(['https://epg.example.com/guide.xml.gz']);
    expect(pickEpgApiTemplate(mixed)).toBe('http://diyp5.112114.xyz/?ch={name}&date={date}');
    expect(isEpgXmlSource('https://a/epg.xml')).toBe(true);
    expect(isEpgApiTemplate('http://x/?ch={name}')).toBe(true);
  });

  it('resolves channel epg template', () => {
    const url = resolveChannelEpgUrl(mixed, {
      name: 'CCTV1',
      tvgId: 'cctv1',
      epg: '',
    });
    expect(url).toContain(encodeURIComponent('CCTV1'));
    expect(url).not.toContain('{name}');
  });

  it('formats epg date as YYYYMMDD', () => {
    expect(formatEpgDate(0)).toMatch(/^\d{8}$/);
  });
});
