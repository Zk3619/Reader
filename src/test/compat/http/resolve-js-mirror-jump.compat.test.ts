import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyzeListElements } from '@/lib/rule-engine';
import type { RuleContext } from '@/lib/rule-engine/analyze-rule';
import type { RssSource } from '@/types';
import {
  isJsMirrorJumpPage,
  looksLikeJsMirrorJumpResolved,
  resolveJsMirrorJumpTargets,
} from '@/lib/http/resolve-js-mirror-jump';

const here = dirname(fileURLToPath(import.meta.url));

const jumpHtml = `<!DOCTYPE html>
<html data-theme=dark>
<head><meta charset=UTF-8><title></title></head>
<body>
<script>
var hostjjj=window.location.host.toLowerCase();
var urlt = window.location.href;
urlt=urlt.split(hostjjj)[1];
var url2 = new Array();
var url3="";
//Jump3url Start
eval(decodeURIComponent('url2%2Epush%28%2266eezz%2Ecom%2C55rrtt%2Ecom%22%29%3B%0D%0A'))
//Jump3url End
var UseProtocol="https://";
var UseDay=1;
var OffsetHour=0;
var timestamp = Date.parse(new Date());
var dayjjj=parseInt((timestamp+8*3600000-OffsetHour*3600000)/86400000/UseDay);
var url3temp = url2[(dayjjj%url2.length)].split(",");
url3 = UseProtocol+"www." + escape(url3temp[Math.floor(Math.random() * url3temp.length)]);
setTimeout("window.location.href=url3+urlt;",300);
</script>
</body></html>`;

const listFixture = `<div class="video-listing avdata ex1">
  <div class="cover-div">
    <a href="/htm/play2/224882.htm" target=_blank><img src="/images/placeholder2.png"></a>
  </div>
  <h4 class="av_data_title ">
    <script>document.write('<a href="/htm/play2/224882.htm"> '+decodeURIComponent("%E6%96%97%E9%B1%BC")+'</a>');</script>
  </h4>
</div>`;

describe('resolve-js-mirror-jump', () => {
  it('识别七猫 Jump3url 占位页', () => {
    expect(isJsMirrorJumpPage(jumpHtml)).toBe(true);
    expect(isJsMirrorJumpPage(listFixture)).toBe(false);
  });

  it('从跳转页解析镜像列表 URL', () => {
    const targets = resolveJsMirrorJumpTargets(
      jumpHtml,
      'https://www.11mmzz.com/list.jsp?s=ASMR',
    );
    expect(targets).toEqual([
      'https://www.66eezz.com/list.jsp?s=ASMR',
      'https://www.55rrtt.com/list.jsp?s=ASMR',
    ]);
  });

  it('区分跳转占位与真实正文', () => {
    expect(looksLikeJsMirrorJumpResolved(jumpHtml)).toBe(false);
    expect(looksLikeJsMirrorJumpResolved(listFixture.repeat(20))).toBe(true);
    expect(looksLikeJsMirrorJumpResolved(`<html>${'x'.repeat(5000)}</html>`)).toBe(true);
  });
});

describe('七猫高清 ruleArticles', () => {
  const source = JSON.parse(
    readFileSync(join(here, '../../../../examples/七猫高清.json'), 'utf8'),
  )[0] as RssSource;

  it('.video-listing 可解析出文章块', async () => {
    const ctx: RuleContext = {
      content: listFixture,
      contentType: 'html',
      baseUrl: 'https://www.66eezz.com/list.jsp?s=ASMR',
      source: source as unknown as Record<string, unknown>,
    };
    const items = await analyzeListElements(String(source.ruleArticles), ctx);
    expect(items.length).toBe(1);
    expect(items[0]?.content).toContain('/htm/play2/224882.htm');
  });
});
