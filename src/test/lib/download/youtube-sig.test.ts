import { describe, expect, it } from 'vitest';
import {
  applySolversToUrl,
  extractPlayerFunctions,
  extractPlayerJsUrl,
} from '@/lib/download/ytdlp/extractors/youtube-sig';

describe('youtube-sig', () => {
  it('extracts player js url from watch html', () => {
    const html = `"jsUrl":"/s/player/deadbeef/player_ias.vflset/en_US/base.js"`;
    expect(extractPlayerJsUrl(html)).toBe(
      'https://www.youtube.com/s/player/deadbeef/player_ias.vflset/en_US/base.js',
    );
  });

  it('extracts decipher / ncode from synthetic player', () => {
    const player = `
      var xyz={r:function(a,b){a.reverse()},s:function(a,b){a.splice(0,b)}};
      var abc=function(a){a=a.split("");xyz.r(a,1);xyz.s(a,2);return a.join("")};
      a.set("alr","yes");c&&(c=abc(decodeURIComponent(c)));
      var nfn=function(a){return a.split("").reverse().join("")};
      &&(b=a.get("n"))&&(b=nfn(b));
    `;
    const fns = extractPlayerFunctions(player);
    expect(fns.decipher || fns.ncode).toBeTruthy();
  });

  it('applies n transform when solver present', () => {
    const url = applySolversToUrl('https://googlevideo.com/v?n=abcdef&clen=1', {
      decipherSig: null,
      transformN: (n) => n.split('').reverse().join(''),
    });
    expect(url).toContain('n=fedcba');
  });
});
