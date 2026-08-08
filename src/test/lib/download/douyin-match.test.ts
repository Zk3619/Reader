import { describe, expect, it } from 'vitest';
import '@/lib/download/ytdlp/extractors';
import { DouyinIE, extractDouyinDetail } from '@/lib/download/ytdlp/extractors/hand-d/douyin';
import { ensureBuiltinLoaded, getExtractorForUrl } from '@/lib/download/ytdlp/registry';
import { formatDownloadErrorForUser } from '@/lib/download/error-message';

describe('DouyinIE', () => {
  it('matches douyin video URLs', () => {
    const url = 'https://www.douyin.com/video/6961737553342991651';
    expect(DouyinIE.suitable(url)).toBe(true);
    ensureBuiltinLoaded();
    expect(getExtractorForUrl(url)?.IE_NAME).toBe('Douyin');
  });

  it('parses share-page _ROUTER_DATA', () => {
    const html = `<html><script>window._ROUTER_DATA = ${JSON.stringify({
      loaderData: {
        'video_(id)/page': {
          videoInfoRes: {
            item_list: [
              {
                aweme_id: '6961737553342991651',
                desc: '#杨超越  小小水手带你去远航',
                video: {
                  play_addr: {
                    url_list: [
                      'https://aweme.snssdk.com/aweme/v1/playwm/?video_id=v0300fg10000c2egtqtovkemgno0u7o0&ratio=720p&line=0',
                    ],
                  },
                  duration: 19782,
                },
                author: { unique_id: '6897520xka', nickname: '杨超越' },
              },
            ],
          },
        },
      },
    })};</script></html>`;
    const detail = extractDouyinDetail(html);
    expect(detail?.aweme_id).toBe('6961737553342991651');
    expect(String((detail?.video as { play_addr?: { url_list?: string[] } })?.play_addr?.url_list?.[0])).toMatch(
      /playwm/,
    );
  });

  it('maps cookie errors to Chinese hint', () => {
    expect(
      formatDownloadErrorForUser(
        'Fresh cookies (not necessarily logged in) are needed for Douyin — open the video in browser once',
      ),
    ).toMatch(/Cookie|cookiesfrombrowser|浏览器/);
  });
});
