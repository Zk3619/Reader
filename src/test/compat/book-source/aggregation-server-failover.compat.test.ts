import { describe, expect, it } from 'vitest';
import type { BookSource } from '@/types';
import {
  listAggregationServerCandidates,
  replaceHttpUrlOrigin,
  shouldUseAggregationServerFailover,
} from '@/lib/book-source/source-http';

const GYKS_HOSTS = [
  'https://v1.gyks.cf',
  'https://v2.gyks.cf',
  'https://v3.gyks.cf',
];

describe('aggregation server failover helpers', () => {
  const source = {
    jsLib: `let hosts = [\n${GYKS_HOSTS.map((h) => `  '${h}'`).join(',\n')}\n];`,
  } as BookSource;

  it('listAggregationServerCandidates 合并当前 origin 与 jsLib hosts', () => {
    const url =
      'https://v1.gyks.cf/discovestyle?source=%E7%95%AA%E8%8C%84&tab=%E5%B0%8F%E8%AF%B4';
    expect(listAggregationServerCandidates(source, url)).toEqual(GYKS_HOSTS);
  });

  it('replaceHttpUrlOrigin 仅替换 origin，保留 path 与 query', () => {
    const url =
      'https://v1.gyks.cf/discovestyle?source=%E7%95%AA%E8%8C%84&tab=%E5%B0%8F%E8%AF%B4';
    expect(replaceHttpUrlOrigin(url, 'https://v2.gyks.cf')).toBe(
      'https://v2.gyks.cf/discovestyle?source=%E7%95%AA%E8%8C%84&tab=%E5%B0%8F%E8%AF%B4',
    );
  });

  it('shouldUseAggregationServerFailover 在多线路且 origin 匹配时启用', () => {
    expect(
      shouldUseAggregationServerFailover(
        source,
        'https://v1.gyks.cf/discovestyle?source=%E7%95%AA%E8%8C%84',
      ),
    ).toBe(true);
    expect(
      shouldUseAggregationServerFailover(source, 'https://example.com/search'),
    ).toBe(false);
  });
});
