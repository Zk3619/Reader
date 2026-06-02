import { describe, expect, it } from 'vitest';
import {
  applyLegadoAggregationApiHeaders,
  parseLegadoApiJsonResponse,
} from '@/lib/js-engine/legado/normalize-legado-ajax-body';

describe('legado aggregation api headers', () => {
  it('login_api 自动补 Accept 与 X-Requested-With', () => {
    const headers = applyLegadoAggregationApiHeaders('http://101.35.133.34:8888/login_api', {
      'Content-Type': 'application/json',
    });
    expect(headers.Accept).toBe('application/json');
    expect(headers['X-Requested-With']).toBe('XMLHttpRequest');
    expect(headers.Origin).toBe('http://101.35.133.34:8888');
    expect(headers.Referer).toBe('http://101.35.133.34:8888/');
  });

  it('非聚合 API 不修改 headers', () => {
    const headers = applyLegadoAggregationApiHeaders('http://example.com/content', {});
    expect(headers.Accept).toBeUndefined();
  });

  it('parseLegadoApiJsonResponse 拒绝 HTML', () => {
    expect(parseLegadoApiJsonResponse('<!DOCTYPE html><html>')).toBeNull();
    expect(parseLegadoApiJsonResponse('{"code":0,"key":"abc"}')).toEqual({
      code: 0,
      key: 'abc',
    });
  });
});
