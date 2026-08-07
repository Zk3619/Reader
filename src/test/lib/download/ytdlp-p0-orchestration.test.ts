import { describe, expect, it } from 'vitest';
import { prepareFilename, expandOuttmpl, DEFAULT_OUTTMPL } from '@/lib/download/ytdlp/outtmpl';
import { sanitize_filename } from '@/lib/download/ytdlp/utils/sanitize-filename';
import { YoutubeDL } from '@/lib/download/ytdlp/youtube-dl';
import { YtdlpCookieJar } from '@/lib/download/ytdlp/cookie-jar';
import { randomIpv4 } from '@/lib/download/ytdlp/geo-utils';
import { JSInterpreter } from '@/lib/download/ytdlp/jsinterp';
import {
  unsupportedProtocolMessage,
  isRtmpFfmpegProtocol,
} from '@/lib/download/ytdlp/protocol-policy';
import { InfoExtractor } from '@/lib/download/ytdlp/common';

describe('outtmpl / prepare_filename', () => {
  it('expands DEFAULT_OUTTMPL', () => {
    const name = expandOuttmpl(DEFAULT_OUTTMPL, {
      id: 'abc',
      title: 'Hello World',
      ext: 'mp4',
    });
    expect(name).toBe('Hello World [abc].mp4');
  });

  it('prepareFilename uses paths.home', () => {
    const path = prepareFilename(
      { id: '1', title: 't', ext: 'mkv' },
      { outtmpl: '%(title)s.%(ext)s', paths: { home: 'D:/Downloads' } },
    );
    expect(path.replace(/\\/g, '/')).toBe('D:/Downloads/t.mkv');
  });

  it('sanitize_filename strips path separators', () => {
    expect(sanitize_filename('a/b:c', true)).not.toMatch(/[/:]/);
  });
});

describe('YoutubeDL download=true does not fake finished', () => {
  it('sets _filename and returns without archive on download=true', async () => {
    const hooks: string[] = [];
    const ydl = new YoutubeDL({
      quiet: true,
      no_warnings: true,
      outtmpl: '%(id)s.%(ext)s',
      progress_hooks: [
        (h) => {
          hooks.push(h.status);
        },
      ],
    });
    const info = await ydl.process_video_result(
      {
        id: 'vid1',
        title: 'T',
        ext: 'mp4',
        url: 'https://example.com/a.mp4',
        formats: [{ format_id: '0', url: 'https://example.com/a.mp4', ext: 'mp4' }],
      },
      true,
    );
    expect(info._filename).toMatch(/vid1\.mp4$/);
    expect(hooks).toContain('processing');
    expect(hooks).not.toContain('finished');
  });
});

describe('cookie jar + geo', () => {
  it('jar setCookie appears in header', () => {
    const jar = new YtdlpCookieJar();
    jar.setCookie({
      domain: 'example.com',
      name: 'sid',
      value: 'xyz',
      path: '/',
    });
    expect(jar.getCookieHeader('https://example.com/x')).toContain('sid=xyz');
  });

  it('randomIpv4 for US returns dotted quad', () => {
    const ip = randomIpv4('US');
    expect(ip).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
  });

  it('_initialize_geo_bypass sets XFF from country', () => {
    class TmpIE extends InfoExtractor {
      static IE_NAME = 'tmp';
      static _GEO_COUNTRIES = ['US'];
      async _real_extract() {
        return { id: '1', title: 't' };
      }
    }
    const ie = new TmpIE({
      params: { geo_bypass_country: 'US' },
    });
    ie._initialize_geo_bypass();
    const headers = ie.geo_verification_headers();
    expect(headers['X-Forwarded-For']).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
  });
});

describe('jsinterp', () => {
  it('calls named function', () => {
    const code = 'function rev(s){return s.split("").reverse().join("");}';
    const ji = new JSInterpreter(code);
    expect(ji.callFunction('rev', 'abc')).toBe('cba');
  });
});

describe('rtmp protocol policy', () => {
  it('blocks rtmp_ffmpeg by default', () => {
    expect(unsupportedProtocolMessage('rtmp_ffmpeg')).toMatch(/暂不支持/);
  });

  it('allows rtmp_ffmpeg when opted in', () => {
    expect(
      unsupportedProtocolMessage('rtmp_ffmpeg', undefined, { allowRtmpFfmpeg: true }),
    ).toBeNull();
    expect(isRtmpFfmpegProtocol('rtmp', 'rtmp://x/y')).toBe(true);
  });
});
