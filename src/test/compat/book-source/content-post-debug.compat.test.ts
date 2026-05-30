import { describe, expect, it } from 'vitest';
import {
  decodeAggregationItemIdLabel,
  summarizeContentPostItemId,
} from '@/lib/book-source/content-post-debug';

describe('content-post-debug', () => {
  it('解码 Legado 风格短 item_id', () => {
    expect(decodeAggregationItemIdLabel('MzI3MDdfMTc2MDY2Mg==')).toBe('32707_1760662');
    expect(summarizeContentPostItemId('MzI3MDdfMTc2MDY2Mg==').item_id_decoded).toBe(
      '32707_1760662',
    );
  });
});
