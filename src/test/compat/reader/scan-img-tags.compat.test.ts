import { describe, expect, it } from 'vitest';
import { processImageStyle } from '@/lib/book-source/content-processor';
import { flowImageRefs } from '@/lib/media/flow-images';
import { scanImgTags } from '@/lib/reader/scan-img-tags';
import { parseImgRefsFromHtml } from '@/lib/reader/reader-content-blocks';

const UA =
  'Mozilla/5.0 (Linux; Android 13; PFJM10 Build/TP1A.220905.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/132.0.6834.163 Mobile Safari/537.36';

function legadoImg(url: string, encoded = false): string {
  const headers = encoded
    ? `{&quot;User-Agent&quot;:&quot;${UA}&quot;}`
    : `{"User-Agent":"${UA}"}`;
  return `<img src="${url}" data-legado-headers="${headers}">`;
}

describe('scanImgTags', () => {
  it('连续多张 img 全部提取（含 style 与 legado headers）', () => {
    const html = [1, 2, 3, 4].map((n) => legadoImg(`https://cdn.example/p${n}.webp`, true)).join('\n');
    const styled = processImageStyle(html, 'FULL');
    expect(scanImgTags(styled)).toHaveLength(4);
    expect(flowImageRefs(styled)).toHaveLength(4);
    expect(flowImageRefs(styled).map((r) => r.url)).toEqual([
      'https://cdn.example/p1.webp',
      'https://cdn.example/p2.webp',
      'https://cdn.example/p3.webp',
      'https://cdn.example/p4.webp',
    ]);
  });

  it('未转义引号的 data-legado-headers 不被 [^>]* 截断', () => {
    const html = [1, 2].map((n) => legadoImg(`https://cdn.example/p${n}.webp`, false)).join('');
    expect(parseImgRefsFromHtml(html)).toHaveLength(2);
    expect(parseImgRefsFromHtml(processImageStyle(html, 'FULL'))).toHaveLength(2);
  });
});
