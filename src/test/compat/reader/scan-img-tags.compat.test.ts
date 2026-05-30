import { describe, expect, it } from 'vitest';
import { processImageStyle } from '@/lib/book-source/content-processor';
import { flowImageRefs } from '@/lib/media/image/flow-images';
import { scanImgTags } from '@/lib/media/text/scan-img-tags';
import { parseImgRefsFromHtml } from '@/lib/media/text/reader-content-blocks';

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

  it('晴天段评 SVG data URL 含 Legado JSON 后缀时不截断 src', () => {
    const svgB64 =
      'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iOTAiPjwvdGV4dD4KPC9zdmc+';
    const legadoSrc =
      `data:image/svg+xml;base64,${svgB64},` +
      `{"js":"showCmt('/get_para_review?book_id=&item_id=1&para=0&source=番茄', '番茄', false)","style":"text"}`;
    const html = `<p>正文<img src="${legadoSrc}"></p>`;
    const refs = parseImgRefsFromHtml(html);
    expect(refs).toHaveLength(1);
    expect(refs[0]!.url).toBe(`data:image/svg+xml;base64,${svgB64}`);
    expect(refs[0]!.legadoClick).toContain('showCmt');
    expect(refs[0]!.legadoClick).toContain('false');
    expect(refs[0]!.legadoStyle).toBe('text');
    expect(refs[0]!.layout).toBe('TEXT');
    expect(refs[0]!.url).not.toContain(',{');
  });
});
