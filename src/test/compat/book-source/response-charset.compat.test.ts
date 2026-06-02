import { describe, expect, it } from 'vitest';
import { decodeBookSourceResponseBytes } from '@/lib/book-source/response-charset';

describe('response charset', () => {
  it('decodeBookSourceResponseBytes 将 GBK 字节解码为 UTF-8', async () => {
    // 「测」「试」 GBK
    const bytes = new Uint8Array([0xb2, 0xe2, 0xca, 0xd4]);
    const text = await decodeBookSourceResponseBytes(bytes, 'gbk');
    expect(text).toBe('测试');
  });
});
