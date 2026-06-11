import { describe, expect, it } from 'vitest';
import { parseAjaxArgs } from '@/lib/js-engine/legado/host/parse-ajax';

describe('parseAjaxArgs params', () => {
  it('将 params 对象追加到 URL 查询串', () => {
    const parsed = parseAjaxArgs(
      'https://mby.lanzoue.com/filemoreajax.php,{"method":"POST","params":{"uri":"b016iz5kgd","img":"004.png"},"body":"lx=2"}',
    );
    expect(parsed?.method).toBe('POST');
    expect(parsed?.urlStr).toContain('filemoreajax.php?');
    expect(parsed?.urlStr).toContain('uri=b016iz5kgd');
    expect(parsed?.urlStr).toContain('img=004.png');
    expect(parsed?.body).toBe('lx=2');
  });
});
