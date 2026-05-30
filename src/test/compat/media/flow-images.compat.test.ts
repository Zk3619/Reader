import { describe, expect, it } from 'vitest';
import { flowImages, countFlowImages } from '@/lib/media/flow-images';

describe('flowImages', () => {
  it('对齐 Legado BookHelp.flowImages 提取 img src', () => {
    const html = [
      '<p>intro</p>',
      '<img src="/pic/1.jpg">',
      '<img src="https://cdn.example/a.png">',
    ].join('\n');
    const urls = flowImages(html, 'https://book.example/chapter/1');
    expect(urls).toEqual([
      'https://book.example/pic/1.jpg',
      'https://cdn.example/a.png',
    ]);
    expect(countFlowImages(html, 'https://book.example/chapter/1')).toBe(2);
  });

  it('纯文本无 img 时返回空列表', () => {
    expect(flowImages('您的书源版本过低，请及时更新书源！')).toEqual([]);
  });
});
