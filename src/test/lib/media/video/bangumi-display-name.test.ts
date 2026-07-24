import { describe, expect, it } from 'vitest';
import {
  displayName,
  prefersBangumiChineseName,
} from '@/lib/media/video/bangumi/meta/types';

describe('bangumi displayName language', () => {
  const subject = { id: 1, name: 'ぼっち・ざ・ろっく！', nameCn: '孤独摇滚！' };
  const noCn = { id: 2, name: 'Only Original', nameCn: '' };
  const empty = { id: 3, name: '', nameCn: '' };

  it('detects Chinese app languages', () => {
    expect(prefersBangumiChineseName('zh-CN')).toBe(true);
    expect(prefersBangumiChineseName('zh-TW')).toBe(true);
    expect(prefersBangumiChineseName('zh')).toBe(true);
    expect(prefersBangumiChineseName('en-US')).toBe(false);
    expect(prefersBangumiChineseName(undefined)).toBe(false);
  });

  it('prefers nameCn for zh locales and name otherwise', () => {
    expect(displayName(subject, 'zh-CN')).toBe('孤独摇滚！');
    expect(displayName(subject, 'zh-TW')).toBe('孤独摇滚！');
    expect(displayName(subject, 'en-US')).toBe('ぼっち・ざ・ろっく！');
  });

  it('falls back when the preferred side is empty', () => {
    expect(displayName(noCn, 'zh-CN')).toBe('Only Original');
    expect(displayName(noCn, 'en-US')).toBe('Only Original');
    expect(displayName(empty, 'zh-CN')).toBe('3');
    expect(displayName(empty, 'en-US')).toBe('3');
  });
});
