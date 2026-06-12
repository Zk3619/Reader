import { describe, expect, it } from 'vitest';
import {
  extractLatencyCheckUrls,
  isLatencyCheckWebViewHtml,
} from '@/lib/js-engine/legado/rule-script-webview-latency';

describe('rule-script-webview-latency', () => {
  const sampleHtml = `<script>function checkUrl(url){return new Promise((res,rej)=>{let t=Date.now(),id=setTimeout(rej,3e3,4e3);if(url.endsWith('='))url+=t;fetch(url,{mode:'no-cors',method:'HEAD'}).catch(()=>rej(5e3)).then(()=>res(Date.now()-t)&&clearTimeout(id))})}function checkUrls(arr){return Promise.allSettled(arr.map(checkUrl)).then(a=>a.map(x=>x.value||x.reason))}checkUrls(["https://a.example.com","https://b.example.com"]).then(arr=>result=JSON.stringify(arr));</script>`;

  it('识别并解析 checkUrls 列表', () => {
    expect(isLatencyCheckWebViewHtml(sampleHtml)).toBe(true);
    expect(extractLatencyCheckUrls(sampleHtml)).toEqual([
      'https://a.example.com',
      'https://b.example.com',
    ]);
  });

  it('普通 HTML 不识别为延迟检测', () => {
    expect(isLatencyCheckWebViewHtml('<p>hello</p>')).toBe(false);
  });
});
