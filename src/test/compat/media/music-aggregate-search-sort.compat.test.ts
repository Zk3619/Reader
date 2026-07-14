import { describe, expect, it } from 'vitest';
import { parseKuwoObjStr } from '@/lib/media/audio/music-sdk/sources/kw/parse-kuwo-json';
import {
  aggregateSongSortText,
  similar,
  sortByKeywordSimilarity,
} from '@/lib/media/audio/music-sdk/search-similarity';

describe('parseKuwoObjStr', () => {
  it('parses single-quote kuwo payload like lx objStr2JSON', () => {
    const raw = "{'TOTAL':'2','abslist':[{'name':'薛之谦','playlistid':'1'},{'name':'薛之谦精选','playlistid':'2'}]}";
    const body = parseKuwoObjStr<{
      TOTAL: string;
      abslist: Array<{ name: string; playlistid: string }>;
    }>(raw);
    expect(body.TOTAL).toBe('2');
    expect(body.abslist).toHaveLength(2);
    expect(body.abslist[0]?.name).toBe('薛之谦');
  });
});

describe('aggregate playlist sort (lx handleSortList)', () => {
  it('puts exact name matches first, preserving source merge order among ties', () => {
    const merged = [
      { source: 'kw', name: '薛之谦精选' },
      { source: 'kw', name: '薛之谦' },
      { source: 'kg', name: '薛之谦' },
      { source: 'wy', name: '薛之谦四巡' },
    ];
    const sorted = sortByKeywordSimilarity(merged, '薛之谦', (p) => p.name);
    expect(sorted.map((p) => `${p.source}:${p.name}`)).toEqual([
      'kw:薛之谦',
      'kg:薛之谦',
      'kw:薛之谦精选',
      'wy:薛之谦四巡',
    ]);
    expect(similar('薛之谦', '薛之谦')).toBe(1);
  });
});

describe('aggregate song sort (lx handleSortList name+singer)', () => {
  it('treats placeholder 未知 artist as empty string like lx empty singer', () => {
    expect(aggregateSongSortText('演员', '未知')).toBe('演员 ');
    expect(aggregateSongSortText('演员', '薛之谦')).toBe('演员 薛之谦');
  });

  it('ranks higher when keyword matches song name, preserving merge order among ties', () => {
    const merged = [
      { source: 'kw', name: '演员', artist: '薛之谦' },
      { source: 'kg', name: '演员', artist: '薛之谦' },
      { source: 'tx', name: '薛之谦', artist: '' },
      { source: 'mg', name: '刚刚好', artist: '薛之谦' },
    ];
    const sorted = sortByKeywordSimilarity(merged, '薛之谦', (t) =>
      aggregateSongSortText(t.name, t.artist),
    );
    expect(sorted.map((t) => `${t.source}:${t.name}`)).toEqual([
      'tx:薛之谦',
      'kw:演员',
      'kg:演员',
      'mg:刚刚好',
    ]);
  });
});
