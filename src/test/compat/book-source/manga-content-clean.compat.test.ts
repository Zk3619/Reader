import { describe, expect, it } from 'vitest';
import { flowImageRefs, flowImages } from '@/lib/media/flow-images';

/** 模拟 cleanContent(mode=image) 在浏览器中误用 textContent 后的结果 */
function simulateBrokenBrowserEntityDecode(html: string): string {
  if (typeof document === 'undefined') return html;
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  return tempDiv.textContent || tempDiv.innerText || html;
}

describe('漫画正文 img 提取', () => {
  const legadoImg = `<img src="https://f40-1-4.g-mh.online/kk/a.webp" data-legado-headers="{&quot;User-Agent&quot;:&quot;LegadoUA&quot;}">`;

  it('Legado img 可被 flowImageRefs 提取', () => {
    const refs = flowImageRefs(legadoImg);
    expect(refs).toHaveLength(1);
    expect(refs[0]!.url).toBe('https://f40-1-4.g-mh.online/kk/a.webp');
    expect(refs[0]!.legadoHeaders?.['User-Agent']).toBe('LegadoUA');
  });

  it('浏览器 textContent 解码会剥离 img（cleanContent 须在 image 模式跳过）', () => {
    if (typeof document === 'undefined') return;
    const broken = simulateBrokenBrowserEntityDecode(legadoImg);
    expect(broken).not.toContain('<img');
    expect(flowImages(broken)).toEqual([]);
  });
});
