import { describe, expect, it } from 'vitest';
import {
  extractQttokenKey,
  isInvalidLegadoToken,
} from '@/lib/js-engine/legado/normalize-legado-ajax-body';

describe('legado qttoken helpers', () => {
  it('isInvalidLegadoToken 拒绝 undefined/null 字面量', () => {
    expect(isInvalidLegadoToken('undefined')).toBe(true);
    expect(isInvalidLegadoToken('null')).toBe(true);
    expect(isInvalidLegadoToken('')).toBe(true);
    expect(isInvalidLegadoToken('abc12345')).toBe(false);
  });

  it('extractQttokenKey 忽略无效 token', () => {
    expect(extractQttokenKey('qttoken=undefined;deviceId=x')).toBe('');
    expect(extractQttokenKey('qttoken=real-token;deviceId=x')).toBe('real-token');
    expect(extractQttokenKey('real-token')).toBe('real-token');
  });

  it('extractQttokenKey 接受短 key（不以长度判定无效）', () => {
    expect(extractQttokenKey('qttoken=1234567;deviceId=x')).toBe('1234567');
    expect(extractQttokenKey('qttoken=12345678;deviceId=x')).toBe('12345678');
  });
});
