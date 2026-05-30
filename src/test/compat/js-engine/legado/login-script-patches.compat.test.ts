import { describe, expect, it } from 'vitest';
import { patchLegadoLoginUrlScript } from '@/lib/js-engine/legado/login-script-patches';

describe('patchLegadoLoginUrlScript', () => {
  it('clearDevice 失败时不调用 checkStatus，且 toast 不依赖裸 res.msg', () => {
    const src = `
function clearDevice() {
  var res = java.ajax(baseUrl + '/clear', { method: 'POST' });
  res = JSON.parse(res);
  java.toast(res.code == 0 ? "\\n\\n📴设备清除成功" : res.msg)
  Packages.java.lang.Thread.sleep(500)
  checkStatus()
}
`;
    const out = patchLegadoLoginUrlScript(src);
    expect(out).toContain("res.msg || res.message");
    expect(out).toContain('if (res.code == 0 || res.code == "0")');
    expect(out).toMatch(/if\s*\(\s*res\.code\s*==\s*0[\s\S]*checkStatus\s*\(\s*\)/);
    expect(out).not.toMatch(
      /Packages\.java\.lang\.Thread\.sleep\s*\(\s*500\s*\)\s*\n\s*checkStatus\s*\(\s*\)\s*$/,
    );
  });
});
