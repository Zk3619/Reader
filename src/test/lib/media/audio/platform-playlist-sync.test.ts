import { describe, expect, it } from 'vitest';
import {
  buildPlatformSyncedListId,
  getPlatformSyncedListDetailUrl,
  parsePlatformSyncedListId,
} from '@/lib/media/audio/platform/playlist-sync';

describe('buildPlatformSyncedListId', () => {
  it('generates stable pl_ ids per platform + remote id', () => {
    expect(buildPlatformSyncedListId('netease', '123456')).toBe('pl_netease_123456');
    expect(buildPlatformSyncedListId('bili', '789')).toBe('pl_bili_789');
    expect(buildPlatformSyncedListId('ytm', 'VLPLabc-DEF_123')).toBe(
      'pl_ytm_VLPLabc-DEF_123',
    );
  });

  it('sanitizes unsafe characters and repeats deterministically', () => {
    const a = buildPlatformSyncedListId('netease', 'id with spaces/♥');
    const b = buildPlatformSyncedListId('netease', 'id with spaces/♥');
    expect(a).toBe(b);
    expect(a).toMatch(/^pl_netease_[a-zA-Z0-9_-]+$/);
  });

  it('handles empty remote id', () => {
    expect(buildPlatformSyncedListId('bili', '')).toBe('pl_bili_unknown');
  });
});

describe('parsePlatformSyncedListId', () => {
  it('parses platform sync list ids', () => {
    expect(parsePlatformSyncedListId('pl_netease_123456')).toEqual({
      platform: 'netease',
      remoteId: '123456',
    });
    expect(parsePlatformSyncedListId('pl_bili_789')).toEqual({
      platform: 'bili',
      remoteId: '789',
    });
    expect(parsePlatformSyncedListId('pl_ytm_VLPLabc-DEF_123')).toEqual({
      platform: 'ytm',
      remoteId: 'VLPLabc-DEF_123',
    });
  });

  it('returns null for non-platform or unknown ids', () => {
    expect(parsePlatformSyncedListId('pl_custom_1')).toBeNull();
    expect(parsePlatformSyncedListId('default')).toBeNull();
    expect(parsePlatformSyncedListId('pl_bili_unknown')).toBeNull();
  });
});

describe('getPlatformSyncedListDetailUrl', () => {
  it('builds netease / bili / ytm detail urls', () => {
    expect(getPlatformSyncedListDetailUrl('pl_netease_123')).toBe(
      'https://music.163.com/#/playlist?id=123',
    );
    expect(getPlatformSyncedListDetailUrl('pl_bili_456')).toBe(
      'https://www.bilibili.com/medialist/detail/ml456',
    );
    expect(getPlatformSyncedListDetailUrl('pl_ytm_VLxyz')).toBe(
      'https://music.youtube.com/playlist?list=xyz',
    );
  });
});
