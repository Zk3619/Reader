import { describe, expect, it } from 'vitest';
import { ESPNArticleIE, ESPNIE, WatchESPNIE } from '@/lib/download/ytdlp/extractors/hand-e/espn';
import { isAwsWafChallengeHtml } from '@/lib/download/ytdlp/utils/waf-challenge';
import { formatDownloadErrorForUser } from '@/lib/download/error-message';

describe('ESPNArticleIE suitable', () => {
  it('matches story URLs and defers clip/watch to sibling IEs', () => {
    expect(
      ESPNArticleIE.suitable(
        'https://www.espn.com/mlb/story/_/id/49686743/dodgers-president-shuts-sale-talk-mark-walter-lakers-deal',
      ),
    ).toBe(true);
    expect(ESPNIE.suitable('http://www.espn.com/video/clip?id=10365079')).toBe(true);
    expect(ESPNArticleIE.suitable('http://www.espn.com/video/clip?id=10365079')).toBe(false);
    expect(
      WatchESPNIE.suitable(
        'https://www.espn.com/watch/player/_/id/11ce417a-6ac9-42b6-8a15-46aeb9ad5710',
      ),
    ).toBe(true);
    expect(
      ESPNArticleIE.suitable(
        'https://www.espn.com/watch/player/_/id/11ce417a-6ac9-42b6-8a15-46aeb9ad5710',
      ),
    ).toBe(false);
  });
});

describe('AWS WAF challenge detect', () => {
  it('recognizes challenge.js interstitial', () => {
    expect(
      isAwsWafChallengeHtml(
        '<script>window.gokuProps={};AwsWafIntegration.getToken()</script><script src="https://x.awswaf.com/a/b/challenge.js"></script>',
      ),
    ).toBe(true);
    expect(isAwsWafChallengeHtml('<html><body>normal article</body></html>')).toBe(false);
  });
});

describe('error-message ESPN / WAF 202', () => {
  it('maps HTTP 202 and WAF wording', () => {
    expect(formatDownloadErrorForUser('HTTP 状态异常: 202')).toMatch(/人机验证|WAF/);
    expect(
      formatDownloadErrorForUser('ESPN article has no embeddable video clip'),
    ).toMatch(/没有可下载视频/);
  });
});
